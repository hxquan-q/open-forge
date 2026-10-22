// Copyright The Open Forge contributors.

/**
 * Desktop 记忆语义检索的本地 embedding 模型目录（TASK-0381）。
 *
 * 事实源职责：固定候选模型的产物坐标、维度/归一化/前后缀合同、许可证
 * 与 checksum 字段。**本模块不下载、不联网、不做 I/O**——下载由用户在
 * 明确授权后触发（届时把 sha256/bytes/runtimeVersion 钉入本目录并另行
 * 验收）；状态解析是纯函数，由宿主把磁盘/运行库观察结果传入。
 *
 * 诚实性约束：checksum 未钉住（null）的候选不可判 ready——「模型卡可
 * 用」不等于「已有可发布本地产物」；无本地资源时语义检索如实标
 * unavailable，词法检索保持可用（PLAN-0021 S5）。
 */

export interface EmbeddingArtifactRef {
	/** ONNX 产物所在仓库（HuggingFace repo id）。 */
	readonly repository: string;
	/** 产物文件路径（repo 内相对路径）。 */
	readonly filePath: string;
	/** 固定 sha256；null = 候选尚未钉住（授权下载时回填后才能 ready）。 */
	readonly sha256: string | null;
	/** 产物字节数；null = 未钉住。 */
	readonly bytes: number | null;
}

export interface EmbeddingRuntimeRef {
	/** 推理运行库模块名（懒加载；不进主 bundle）。 */
	readonly module: string;
	/** 固定版本；null = 授权下载/集成时锁定。 */
	readonly version: string | null;
}

export interface EmbeddingModelCatalogEntry {
	readonly id: string;
	readonly dimension: number;
	readonly normalization: "l2" | "none";
	readonly queryPrefix: string;
	readonly passagePrefix: string;
	readonly artifact: EmbeddingArtifactRef;
	readonly runtime: EmbeddingRuntimeRef;
	/** 模型权重许可证（按模型卡）。 */
	readonly modelLicense: string;
	/** ONNX 移植产物许可证备注；null = 授权下载时核验。 */
	readonly portLicenseNote: string | null;
	readonly notes: readonly string[];
}

/** 候选目录：intfloat/multilingual-e5-small（REQ-0027/PLAN-0021 S5 候选）。 */
export const EMBEDDING_MODEL_CATALOG: readonly EmbeddingModelCatalogEntry[] = [
	{
		id: "intfloat/multilingual-e5-small",
		dimension: 384,
		normalization: "l2",
		queryPrefix: "query: ",
		passagePrefix: "passage: ",
		artifact: {
			repository: "Xenova/multilingual-e5-small",
			filePath: "onnx/model_quantized.onnx",
			sha256: null,
			bytes: null,
		},
		runtime: { module: "@huggingface/transformers", version: null },
		modelLicense: "MIT（模型卡声明；以仓库 LICENSE 为准）",
		portLicenseNote: null,
		notes: [
			"作者要求 query/passage 前缀；中英多语；int8 量化候选",
			"sha256/bytes/运行库版本与 ONNX 移植许可在用户授权下载时固定并复验",
			"下载由用户显式选择触发；打开记忆入口不自动下载",
		],
	},
];

/** 宿主观察到的本地资源事实（由调用方实际探测后传入；本模块不探测）。 */
export interface EmbeddingModelResourceView {
	readonly directoryExists: boolean;
	readonly artifactExists: boolean;
	/** checksum 复验结果；null = 未计算（如 checksum 未钉住）。 */
	readonly checksumMatches: boolean | null;
	readonly runtimeModuleAvailable: boolean;
}

export type EmbeddingModelStatus =
	| { readonly status: "ready" }
	| {
			readonly status: "unavailable";
			readonly reason: "directory-missing" | "artifact-missing" | "checksum-not-pinned";
	  }
	| { readonly status: "degraded"; readonly reason: "checksum-mismatch" | "runtime-missing" };

/** 纯函数状态解析：ready 必须 checksum 钉住且命中、运行库可用。 */
export function resolveEmbeddingModelStatus(
	entry: EmbeddingModelCatalogEntry,
	view: EmbeddingModelResourceView,
): EmbeddingModelStatus {
	if (!view.directoryExists) {
		return { status: "unavailable", reason: "directory-missing" };
	}
	if (!view.artifactExists) {
		return { status: "unavailable", reason: "artifact-missing" };
	}
	if (entry.artifact.sha256 === null) {
		return { status: "unavailable", reason: "checksum-not-pinned" };
	}
	if (view.checksumMatches === false) {
		return { status: "degraded", reason: "checksum-mismatch" };
	}
	if (!view.runtimeModuleAvailable) {
		return { status: "degraded", reason: "runtime-missing" };
	}
	return { status: "ready" };
}

/** 面向设置页/诊断的只读描述（纯事实，不含内部路径或密钥）。 */
export function describeEmbeddingModel(entry: EmbeddingModelCatalogEntry): {
	readonly id: string;
	readonly dimension: number;
	readonly normalization: string;
	readonly requiresPrefixes: boolean;
	readonly pinnedChecksum: boolean;
	readonly pinnedRuntimeVersion: boolean;
	readonly license: string;
} {
	return {
		id: entry.id,
		dimension: entry.dimension,
		normalization: entry.normalization,
		requiresPrefixes: entry.queryPrefix.length > 0 || entry.passagePrefix.length > 0,
		pinnedChecksum: entry.artifact.sha256 !== null,
		pinnedRuntimeVersion: entry.runtime.version !== null,
		license:
			entry.portLicenseNote === null
				? entry.modelLicense
				: `${entry.modelLicense}；移植产物：${entry.portLicenseNote}`,
	};
}
