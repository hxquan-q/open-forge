// Copyright The Open Forge contributors.

import { createHash } from "node:crypto";

/**
 * 本地 embedding 适配端口（TASK-0381）。
 *
 * 两种实现：
 * - `createDeterministicEmbeddingAdapter`：种子哈希确定性向量。**不是语义
 *   检索**，只用于合同测试/固定夹具与「无模型降级」路径的行为验证；
 * - `createOnnxEmbeddingAdapter`：真实本地模型适配。模型资源由用户显式
 *   选择下载（本模块绝不自动下载）；加载前校验固定 checksum，运行库经
 *   注入的 `LocalEmbeddingRuntime` 端口懒加载，测试用假运行库替身。
 *
 * 向量空间隔离合同：descriptor 携带 modelId/modelRevision/dimension/
 * normalization，构成 VectorSpaceKey；不同空间禁止混算（由 vector-store
 * 的主键与查询过滤结构性保证）。
 */

/** 向量空间键：任一字段不同即为不同空间，向量禁止跨空间计算。 */
export interface EmbeddingVectorSpaceKey {
	readonly modelId: string;
	readonly modelRevision: string;
	readonly dimension: number;
	/** 向量归一化合同："l2"（单位向量）或 "none"。 */
	readonly normalization: "l2" | "none";
}

/** 固定模型描述：资源清单事实由 desktop 侧 embedding-models 目录承载。 */
export interface EmbeddingModelDescriptor extends EmbeddingVectorSpaceKey {
	/** query 输入前缀（如 e5 的 "query: "）；无前缀模型为空串。 */
	readonly queryPrefix: string;
	/** passage 输入前缀（如 e5 的 "passage: "）。 */
	readonly passagePrefix: string;
}

export type EmbeddingInputKind = "query" | "passage";

export interface EmbeddingAdapter {
	readonly descriptor: EmbeddingModelDescriptor;
	/** 批量生成向量；顺序与输入一致；结果受 descriptor.dimension/normalization 约束。 */
	embed(inputs: readonly string[], kind: EmbeddingInputKind): Promise<readonly Float32Array[]>;
	/** 取消/卸载：释放会话后 embed 必须给出明确错误，不允许静默假成功。 */
	dispose(): Promise<void>;
}

export const EMBEDDING_ADAPTER_ERROR_CODES = {
	MODEL_UNAVAILABLE: "EMBEDDING_MODEL_UNAVAILABLE",
	MODEL_CHECKSUM_MISMATCH: "EMBEDDING_MODEL_CHECKSUM_MISMATCH",
	SESSION_CLOSED: "EMBEDDING_SESSION_CLOSED",
	INVALID_INPUT: "EMBEDDING_INVALID_INPUT",
} as const;

export type EmbeddingAdapterErrorCode =
	(typeof EMBEDDING_ADAPTER_ERROR_CODES)[keyof typeof EMBEDDING_ADAPTER_ERROR_CODES];

export class EmbeddingAdapterError extends Error {
	constructor(
		readonly code: EmbeddingAdapterErrorCode,
		message: string,
	) {
		super(message);
		this.name = "EmbeddingAdapterError";
	}
}

export function vectorSpaceKeyOf(descriptor: EmbeddingModelDescriptor): EmbeddingVectorSpaceKey {
	return {
		modelId: descriptor.modelId,
		modelRevision: descriptor.modelRevision,
		dimension: descriptor.dimension,
		normalization: descriptor.normalization,
	};
}

export function sameVectorSpace(a: EmbeddingVectorSpaceKey, b: EmbeddingVectorSpaceKey): boolean {
	return (
		a.modelId === b.modelId &&
		a.modelRevision === b.modelRevision &&
		a.dimension === b.dimension &&
		a.normalization === b.normalization
	);
}

/** L2 归一化；零向量原样返回（由调用方决定是否拒绝）。 */
export function l2Normalize(vector: Float32Array): Float32Array {
	let sum = 0;
	for (let index = 0; index < vector.length; index += 1) {
		sum += vector[index] * vector[index];
	}
	if (sum === 0) return vector;
	const scale = 1 / Math.sqrt(sum);
	const result = new Float32Array(vector.length);
	for (let index = 0; index < vector.length; index += 1) {
		result[index] = vector[index] * scale;
	}
	return result;
}

function xmur3(str: string): () => number {
	let h = 1779033703 ^ str.length;
	for (let index = 0; index < str.length; index += 1) {
		h = Math.imul(h ^ str.charCodeAt(index), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return h >>> 0;
	};
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface DeterministicEmbeddingOptions extends Omit<EmbeddingVectorSpaceKey, "normalization"> {
	/** 不同 seed 产生不同向量；同 seed 同输入跨进程稳定。 */
	readonly seed: string;
	/** 供测试模拟「未归一化」的异常适配器；生产路径保持 "l2"。 */
	readonly normalization?: "l2" | "none";
}

/**
 * 确定性适配器：prefix+input 哈希驱动的伪随机向量，L2 归一化。
 * 明确不是语义检索——语义召回必须等待真实本地模型 ready。
 */
export function createDeterministicEmbeddingAdapter(options: DeterministicEmbeddingOptions): EmbeddingAdapter {
	const normalization = options.normalization ?? "l2";
	const descriptor: EmbeddingModelDescriptor = {
		modelId: options.modelId,
		modelRevision: options.modelRevision,
		dimension: options.dimension,
		normalization,
		queryPrefix: "",
		passagePrefix: "",
	};
	let disposed = false;
	return {
		descriptor,
		async embed(inputs, kind) {
			if (disposed) {
				throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.SESSION_CLOSED, "确定性适配器已释放");
			}
			if (inputs.some((input) => typeof input !== "string" || input.length === 0)) {
				throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT, "embed 输入必须是非空字符串");
			}
			void kind;
			return inputs.map((input) => {
				const random = mulberry32(xmur3(`${options.seed}#${input}`)());
				const raw = new Float32Array(options.dimension);
				for (let index = 0; index < options.dimension; index += 1) {
					raw[index] = random() * 2 - 1;
				}
				return normalization === "l2" ? l2Normalize(raw) : raw;
			});
		},
		async dispose() {
			disposed = true;
		},
	};
}

/** 本地模型资源状态：ready 必须 checksum 命中；未钉住/缺失/损坏各有明确原因。 */
export type LocalEmbeddingResourceStatus =
	| { readonly status: "ready"; readonly artifactPath: string; readonly checksum: string }
	| {
			readonly status: "unavailable";
			readonly reason: "directory-missing" | "artifact-missing" | "checksum-not-pinned";
	  }
	| { readonly status: "degraded"; readonly reason: "checksum-mismatch"; readonly artifactPath: string };

export interface LocalEmbeddingArtifactSpec {
	/** 产物文件名（相对模型目录）。 */
	readonly fileName: string;
	/** 固定 sha256；null 表示候选尚未钉住（不可判 ready）。 */
	readonly sha256: string | null;
}

export async function sha256File(readFile: (path: string) => Promise<Uint8Array>, path: string): Promise<string> {
	const hash = createHash("sha256");
	hash.update(await readFile(path));
	return hash.digest("hex");
}

/**
 * 解析本地模型资源状态。目录不存在/产物缺失 → unavailable；checksum 未
 * 钉住 → unavailable（不能因「文件在」就判可用）；checksum 不匹配 →
 * degraded（资源损坏，等待用户重新下载）。ready 仅在 checksum 命中时成立。
 */
export async function resolveLocalEmbeddingResource(options: {
	readonly directory: string;
	readonly artifact: LocalEmbeddingArtifactSpec;
	readonly readFile: (path: string) => Promise<Uint8Array>;
	readonly exists: (path: string) => boolean;
}): Promise<LocalEmbeddingResourceStatus> {
	const artifactPath = `${options.directory}/${options.artifact.fileName}`;
	if (!options.exists(options.directory) || !options.exists(artifactPath)) {
		return {
			status: "unavailable",
			reason: options.exists(options.directory) ? "artifact-missing" : "directory-missing",
		};
	}
	if (options.artifact.sha256 === null) {
		return { status: "unavailable", reason: "checksum-not-pinned" };
	}
	const actual = await sha256File(options.readFile, artifactPath);
	if (actual !== options.artifact.sha256) {
		return { status: "degraded", reason: "checksum-mismatch", artifactPath };
	}
	return { status: "ready", artifactPath, checksum: actual };
}

/** ONNX 会话端口：真实实现由运行库提供；测试注入确定性替身。 */
export interface LocalEmbeddingSession {
	/** 输入为已加前缀的文本；输出维度/归一化由实现保证与 descriptor 一致。 */
	run(inputs: readonly string[]): Promise<readonly Float32Array[]>;
	close(): Promise<void>;
}

export interface LocalEmbeddingRuntime {
	/** 加载会话；目录/checksum 已由调用方校验。加载失败/取消向上抛出。 */
	openSession(options: {
		readonly descriptor: EmbeddingModelDescriptor;
		readonly artifactPath: string;
	}): Promise<LocalEmbeddingSession>;
}

export interface OnnxEmbeddingAdapterOptions {
	readonly descriptor: EmbeddingModelDescriptor;
	readonly artifact: LocalEmbeddingArtifactSpec;
	readonly directory: string;
	readonly runtime: LocalEmbeddingRuntime;
	readonly readFile: (path: string) => Promise<Uint8Array>;
	readonly exists: (path: string) => boolean;
}

/**
 * 真实本地模型适配：资源校验（ready 才建会话）→ 前缀注入 → 会话推理。
 * 不下载、不联网；资源不可用时 embed 抛 MODEL_UNAVAILABLE，调用方保持
 * 词法检索可用，不得把语义检索伪装成就绪。
 */
export function createOnnxEmbeddingAdapter(options: OnnxEmbeddingAdapterOptions): EmbeddingAdapter {
	let session: LocalEmbeddingSession | null = null;
	let sessionReady = false;
	let disposed = false;
	const ensureSession = async (): Promise<LocalEmbeddingSession> => {
		if (disposed) {
			throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.SESSION_CLOSED, "模型会话已释放");
		}
		if (session !== null && sessionReady) return session;
		const resource = await resolveLocalEmbeddingResource(options);
		if (resource.status !== "ready") {
			const detail =
				resource.status === "unavailable" ? `原因 ${resource.reason}` : `checksum 不匹配：${resource.artifactPath}`;
			throw new EmbeddingAdapterError(
				EMBEDDING_ADAPTER_ERROR_CODES.MODEL_UNAVAILABLE,
				`本地模型资源不可用（${detail}）；需用户显式下载后启用语义检索`,
			);
		}
		try {
			session = await options.runtime.openSession({
				descriptor: options.descriptor,
				artifactPath: resource.artifactPath,
			});
			sessionReady = true;
			return session;
		} catch (error) {
			session = null;
			sessionReady = false;
			throw error;
		}
	};
	return {
		descriptor: options.descriptor,
		async embed(inputs, kind) {
			if (inputs.some((input) => typeof input !== "string" || input.length === 0)) {
				throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT, "embed 输入必须是非空字符串");
			}
			const active = await ensureSession();
			const prefix = kind === "query" ? options.descriptor.queryPrefix : options.descriptor.passagePrefix;
			const vectors = await active.run(inputs.map((input) => `${prefix}${input}`));
			const expected = options.descriptor.dimension;
			for (const vector of vectors) {
				if (vector.length !== expected) {
					throw new EmbeddingAdapterError(
						EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
						`模型输出维度 ${vector.length} 与声明的 ${expected} 不一致`,
					);
				}
			}
			return vectors;
		},
		async dispose() {
			disposed = true;
			sessionReady = false;
			const active = session;
			session = null;
			if (active !== null) {
				await active.close();
			}
		},
	};
}
