// Copyright The Open Forge contributors.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE } from "@vetta/runtime-memory/fixtures";
import { LexicalMemoryIndex, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createDeterministicEmbeddingAdapter,
	createOnnxEmbeddingAdapter,
	EMBEDDING_ADAPTER_ERROR_CODES,
	type EmbeddingAdapter,
	EmbeddingAdapterError,
	type EmbeddingModelDescriptor,
	type LocalEmbeddingRuntime,
	MemoryEmbeddingJobQueue,
	resolveLocalEmbeddingResource,
	runEmbeddingJob,
	sameVectorSpace,
	VectorMemoryStore,
} from "../../src/memory/embedding/index.js";

/**
 * TASK-0381 合同测试：真实临时 SQLite 库 + 真实事实 worker/擦除层。
 * 覆盖 GWT：生成向量/重启/维度归一化一致；模型版本升级空间隔离与
 * dropSpace 重建；未下载/下载损坏/加载取消状态明确且词法可用；被忘
 * 事实无向量写回；任务幂等与写入校验。语义模型本体不下载（确定性
 * 适配器与注入的假运行库只替代外部边界）。
 */

let workDir: string;
let databasePath: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-embedding-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后，留系统临时目录回收 */
	}
});

async function seedMemory(content: string): Promise<{ memoryId: string; revision: number }> {
	const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [FIXTURE_PROJECT_SCOPE] });
	try {
		const written = await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content,
			kind: "convention",
			scopeName: "project",
			...VECTOR_ID,
			validFrom: "2026-01-01T00:00:00Z",
			sources: [
				{ sourceId: "session/s1/turn/1/entry/1", role: "user-input", contentHash: "hash-1", retainsExcerpt: false },
			],
		});
		return { memoryId: written.memoryId, revision: written.revision ?? 1 };
	} finally {
		await store.close();
	}
}

function makeContext(options: {
	store: VectorMemoryStore;
	queue: MemoryEmbeddingJobQueue;
	adapter: EmbeddingAdapter;
	erasure: SqliteMemoryErasure;
}) {
	return {
		store: options.store,
		queue: options.queue,
		adapter: options.adapter,
		owner: "test-worker",
		readErasureState: async () => options.erasure.readErasureState(),
	};
}

const fileDeps = {
	readFile: async (path: string) => new Uint8Array(readFileSync(path)),
	exists: (path: string) => existsSync(path),
};

const VECTOR_ID = {
	principalId: FIXTURE_PROJECT_SCOPE.identity.principalId,
	projectId: FIXTURE_PROJECT_SCOPE.identity.projectId ?? "",
	workspaceViewId: FIXTURE_PROJECT_SCOPE.identity.workspaceViewId ?? "",
};

const SPACE_V1 = { modelId: "fixture-model", modelRevision: "v1", dimension: 8, normalization: "l2" as const };
const SPACE_V2 = { ...SPACE_V1, modelRevision: "v2" };

function deterministicFor(space: typeof SPACE_V1, seed = "seed-a") {
	return createDeterministicEmbeddingAdapter({ ...space, seed });
}

describe("确定性适配器合同", () => {
	it("同 seed 同输入跨实例稳定；不同 seed 产生不同向量；l2 归一化", async () => {
		const a = deterministicFor(SPACE_V1);
		const b = deterministicFor(SPACE_V1);
		const c = deterministicFor(SPACE_V1, "seed-b");
		const [va] = await a.embed(["记忆升级"], "query");
		const [vb] = await b.embed(["记忆升级"], "passage");
		const [vc] = await c.embed(["记忆升级"], "query");
		expect(va.length).toBe(8);
		expect(Array.from(va)).toEqual(Array.from(vb));
		expect(Array.from(va)).not.toEqual(Array.from(vc));
		let norm = 0;
		for (const value of va) norm += value * value;
		expect(Math.abs(Math.sqrt(norm) - 1)).toBeLessThan(1e-5);
	});

	it("空输入拒绝；dispose 后 embed 明确报错", async () => {
		const adapter = deterministicFor(SPACE_V1);
		await expect(adapter.embed([""], "query")).rejects.toMatchObject({
			code: EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
		});
		await adapter.dispose();
		await expect(adapter.embed(["x"], "query")).rejects.toBeInstanceOf(EmbeddingAdapterError);
	});
});

describe("版本化向量存储（真实 SQLite）", () => {
	it("写入→重启→检索：维度/归一化一致，事实层不改", async () => {
		const seeded = await seedMemory("项目使用 pnpm workspace");
		const store = await VectorMemoryStore.open({ databasePath });
		const adapter = deterministicFor(SPACE_V1);
		const [vector] = await adapter.embed(["项目使用 pnpm workspace"], "passage");
		store.put(SPACE_V1, {
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			vector,
			erasureEpochSeen: 0,
		});
		const factsBefore = countTable("memory_revisions");
		store.close();

		const reopened = await VectorMemoryStore.open({ databasePath });
		// 确定性适配器不是语义检索：同输入才同向量（cosine≈1）。
		const [query] = await adapter.embed(["项目使用 pnpm workspace"], "query");
		const hits = reopened.search(SPACE_V1, query, {
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			asOf: "2026-06-01T00:00:00Z",
			limit: 5,
		});
		expect(hits).toHaveLength(1);
		expect(hits[0]?.memoryId).toBe(seeded.memoryId);
		expect(hits[0]?.cosine).toBeGreaterThan(0.99);
		expect(countTable("memory_revisions")).toBe(factsBefore);
		reopened.close();
	});

	it("模型升级：空间隔离禁止混算；dropSpace 只清旧空间且事实不动", async () => {
		const first = await seedMemory("向量版本隔离-甲");
		const second = await seedMemory("向量版本隔离-乙");
		const adapterV1 = deterministicFor(SPACE_V1);
		const adapterV2 = deterministicFor(SPACE_V2);
		const store = await VectorMemoryStore.open({ databasePath });
		// 甲在 v1 与 v2 两个空间都有向量；乙只升级进了 v2 空间。
		for (const [space, adapter, target] of [
			[SPACE_V1, adapterV1, first],
			[SPACE_V2, adapterV2, first],
			[SPACE_V2, adapterV2, second],
		] as const) {
			const [vector] = await adapter.embed([target === first ? "向量版本隔离-甲" : "向量版本隔离-乙"], "passage");
			store.put(space, {
				memoryId: target.memoryId,
				revisionNo: target.revision,
				scopeName: FIXTURE_PROJECT_SCOPE.name,
				...VECTOR_ID,
				vector,
				erasureEpochSeen: 0,
			});
		}
		const [queryV1] = await adapterV1.embed(["向量版本隔离-乙"], "query");
		const [queryV2] = await adapterV2.embed(["向量版本隔离-乙"], "query");
		const search = { scopeName: FIXTURE_PROJECT_SCOPE.name, ...VECTOR_ID, asOf: "2026-06-01T00:00:00Z", limit: 5 };
		// v1 空间检索看不到只存在于 v2 空间的乙：不同版本禁止混算。
		const v1Hits = store.search(SPACE_V1, queryV1, search);
		expect(v1Hits.map((hit) => hit.memoryId)).not.toContain(second.memoryId);
		expect(store.search(SPACE_V2, queryV2, search).map((hit) => hit.memoryId)).toContain(second.memoryId);
		expect(store.spaceStats()).toHaveLength(2);
		const factsBefore = countTable("memory_revisions");
		expect(store.dropSpace(SPACE_V1)).toBe(1);
		expect(store.search(SPACE_V1, queryV1, search)).toHaveLength(0);
		expect(store.search(SPACE_V2, queryV2, search)).toHaveLength(2);
		expect(store.spaceStats()).toHaveLength(1);
		expect(countTable("memory_revisions")).toBe(factsBefore);
		store.close();
		await adapterV1.dispose();
		await adapterV2.dispose();
	});

	it("写入校验：错维度与非归一化向量拒绝；关闭后拒绝", async () => {
		await seedMemory("校验");
		const store = await VectorMemoryStore.open({ databasePath });
		const wrongDimension = new Float32Array(4);
		expect(() =>
			store.put(SPACE_V1, {
				memoryId: "m",
				revisionNo: 1,
				scopeName: "project",
				...VECTOR_ID,
				vector: wrongDimension,
				erasureEpochSeen: 0,
			}),
		).toThrow(EmbeddingAdapterError);
		const notNormalized = new Float32Array([2, 0, 0, 0, 0, 0, 0, 0]);
		expect(() =>
			store.put(SPACE_V1, {
				memoryId: "m",
				revisionNo: 1,
				scopeName: "project",
				...VECTOR_ID,
				vector: notNormalized,
				erasureEpochSeen: 0,
			}),
		).toThrow(/归一化/);
		store.close();
		const query = new Float32Array(8);
		expect(() =>
			store.search(SPACE_V1, query, { scopeName: "project", ...VECTOR_ID, asOf: "2026-01-01T00:00:00Z", limit: 1 }),
		).toThrow(EmbeddingAdapterError);
	});

	it("有效时间与 scope 过滤：其他 scope/未知时间行不参与", async () => {
		const seeded = await seedMemory("只有 project scope 的事实");
		const store = await VectorMemoryStore.open({ databasePath });
		const adapter = deterministicFor(SPACE_V1);
		const [vector] = await adapter.embed(["x"], "passage");
		store.put(SPACE_V1, {
			memoryId: seeded.memoryId,
			revisionNo: 1,
			scopeName: "other-scope",
			...VECTOR_ID,
			vector,
			erasureEpochSeen: 0,
		});
		const [query] = await adapter.embed(["x"], "query");
		const hits = store.search(SPACE_V1, query, {
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			asOf: "2026-06-01T00:00:00Z",
			limit: 5,
		});
		expect(hits).toHaveLength(0);
		store.close();
		await adapter.dispose();
	});
});

describe("本地模型资源状态（不下载）", () => {
	it("缺失/未钉住/损坏/就绪四态明确", async () => {
		const directory = join(workDir, "model-dir");
		const artifact = { fileName: "model.onnx", sha256: null };
		await expect(resolveLocalEmbeddingResource({ directory, artifact, ...fileDeps })).resolves.toMatchObject({
			status: "unavailable",
			reason: "directory-missing",
		});
		const { createHash } = await import("node:crypto");
		mkdirSync(directory);
		await expect(resolveLocalEmbeddingResource({ directory, artifact, ...fileDeps })).resolves.toMatchObject({
			status: "unavailable",
			reason: "artifact-missing",
		});
		writeFileSync(join(directory, "model.onnx"), "fake-onnx-bytes");
		await expect(resolveLocalEmbeddingResource({ directory, artifact, ...fileDeps })).resolves.toMatchObject({
			status: "unavailable",
			reason: "checksum-not-pinned",
		});
		const realHash = createHash("sha256").update("fake-onnx-bytes").digest("hex");
		await expect(
			resolveLocalEmbeddingResource({
				directory,
				artifact: { fileName: "model.onnx", sha256: "0".repeat(64) },
				...fileDeps,
			}),
		).resolves.toMatchObject({ status: "degraded", reason: "checksum-mismatch" });
		await expect(
			resolveLocalEmbeddingResource({
				directory,
				artifact: { fileName: "model.onnx", sha256: realHash },
				...fileDeps,
			}),
		).resolves.toMatchObject({ status: "ready", checksum: realHash });
	});

	it("未下载/加载失败/取消：embed 明确报错且词法检索不受影响", async () => {
		await seedMemory("词法仍然可用");
		const descriptor: EmbeddingModelDescriptor = {
			...SPACE_V1,
			queryPrefix: "query: ",
			passagePrefix: "passage: ",
		};
		const runtime: LocalEmbeddingRuntime = {
			openSession: async () => {
				throw new Error("runtime load cancelled");
			},
		};
		const adapter = createOnnxEmbeddingAdapter({
			descriptor,
			artifact: { fileName: "model.onnx", sha256: "0".repeat(64) },
			directory: join(workDir, "missing"),
			runtime,
			readFile: async () => new Uint8Array(),
			exists: () => false,
		});
		await expect(adapter.embed(["输入"], "query")).rejects.toMatchObject({
			code: EMBEDDING_ADAPTER_ERROR_CODES.MODEL_UNAVAILABLE,
		});
		const readyDir = join(workDir, "ready-model");
		mkdirSync(readyDir);
		writeFileSync(join(readyDir, "model.onnx"), "fake-onnx-bytes");
		const { createHash } = await import("node:crypto");
		const hash = createHash("sha256").update("fake-onnx-bytes").digest("hex");
		const failing = createOnnxEmbeddingAdapter({
			descriptor,
			artifact: { fileName: "model.onnx", sha256: hash },
			directory: readyDir,
			runtime,
			...fileDeps,
		});
		await expect(failing.embed(["输入"], "query")).rejects.toThrow(/runtime load cancelled/);
		await failing.dispose();
		await expect(failing.embed(["输入"], "query")).rejects.toMatchObject({
			code: EMBEDDING_ADAPTER_ERROR_CODES.SESSION_CLOSED,
		});
		// embedding 全程失败不影响词法索引在同一个库上工作。
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		const result = lexical.search(FIXTURE_PROJECT_SCOPE, "词法仍然", { asOf: "2026-06-01T00:00:00Z" });
		expect(result.entries).toHaveLength(1);
		lexical.close();
		await adapter.dispose();
	});

	it("ONNX 适配器注入前缀并按 descriptor 校验维度", async () => {
		const readyDir = join(workDir, "e5-dir");
		mkdirSync(readyDir);
		writeFileSync(join(readyDir, "model.onnx"), "e5-bytes");
		const { createHash } = await import("node:crypto");
		const hash = createHash("sha256").update("e5-bytes").digest("hex");
		const seenInputs: string[] = [];
		const descriptor: EmbeddingModelDescriptor = {
			...SPACE_V1,
			queryPrefix: "query: ",
			passagePrefix: "passage: ",
		};
		const adapter = createOnnxEmbeddingAdapter({
			descriptor,
			artifact: { fileName: "model.onnx", sha256: hash },
			directory: readyDir,
			runtime: {
				openSession: async () => ({
					run: async (inputs) => {
						seenInputs.push(...inputs);
						return inputs.map(() => {
							const vector = new Float32Array(8).fill(0);
							vector[0] = 1;
							return vector;
						});
					},
					close: async () => {},
				}),
			},
			...fileDeps,
		});
		const [vector] = await adapter.embed(["你好"], "query");
		expect(seenInputs).toEqual(["query: 你好"]);
		expect(vector.length).toBe(8);
		await adapter.dispose();
	});
});

describe("embedding 任务队列与遗忘屏障", () => {
	it("幂等入队；执行写向量；重启后完成态保留", async () => {
		const seeded = await seedMemory("幂等任务");
		const queue = await MemoryEmbeddingJobQueue.open({ databasePath });
		const first = queue.enqueue({
			space: SPACE_V1,
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			content: "幂等任务",
			contentHash: "hash-a",
			erasureEpochSeen: 0,
		});
		const second = queue.enqueue({
			space: SPACE_V1,
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			content: "幂等任务",
			contentHash: "hash-a",
			erasureEpochSeen: 0,
		});
		expect(first.enqueued).toBe(true);
		expect(second.enqueued).toBe(false);
		expect(second.jobId).toBe(first.jobId);
		expect(queue.pendingCount()).toBe(1);
		queue.close();

		const reopenedQueue = await MemoryEmbeddingJobQueue.open({ databasePath });
		const store = await VectorMemoryStore.open({ databasePath });
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		const adapter = deterministicFor(SPACE_V1);
		const outcome = await runEmbeddingJob(makeContext({ store, queue: reopenedQueue, adapter, erasure }));
		expect(outcome.status).toBe("completed");
		const [query] = await adapter.embed(["幂等"], "query");
		const hits = store.search(SPACE_V1, query, {
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			asOf: "2026-06-01T00:00:00Z",
			limit: 5,
		});
		expect(hits).toHaveLength(1);
		store.close();
		erasure.close();
		reopenedQueue.close();
		await adapter.dispose();
	});

	it("入队后遗忘：epoch 前进即放弃，被忘事实无向量写回", async () => {
		const seeded = await seedMemory("将被遗忘");
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		const queue = await MemoryEmbeddingJobQueue.open({ databasePath });
		queue.enqueue({
			space: SPACE_V1,
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			content: "将被遗忘",
			contentHash: "hash-b",
			erasureEpochSeen: erasure.readErasureState().erasureEpoch,
		});
		erasure.forgetMemoryFamily({ memoryId: seeded.memoryId, reason: "user-forget" });
		const store = await VectorMemoryStore.open({ databasePath });
		const adapter = deterministicFor(SPACE_V1);
		const outcome = await runEmbeddingJob(makeContext({ store, queue, adapter, erasure }));
		expect(outcome.status).toBe("abandoned");
		expect(store.spaceStats()).toHaveLength(0);
		// 直接写回同样被写入点的 suppressed 校验拒绝。
		const [vector] = await adapter.embed(["将被遗忘"], "passage");
		expect(() =>
			store.put(SPACE_V1, {
				memoryId: seeded.memoryId,
				revisionNo: 1,
				scopeName: "project",
				...VECTOR_ID,
				vector,
				erasureEpochSeen: 0,
			}),
		).toThrow(/遗忘/);
		store.close();
		erasure.close();
		queue.close();
		await adapter.dispose();
	});

	it("模型不可用：任务 failed 且原因可读，词法可用", async () => {
		const seeded = await seedMemory("模型缺失时的任务");
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		const queue = await MemoryEmbeddingJobQueue.open({ databasePath });
		const store = await VectorMemoryStore.open({ databasePath });
		queue.enqueue({
			space: SPACE_V1,
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			content: "模型缺失时的任务",
			contentHash: "hash-c",
			erasureEpochSeen: 0,
		});
		const unavailable = createOnnxEmbeddingAdapter({
			descriptor: { ...SPACE_V1, queryPrefix: "", passagePrefix: "" },
			artifact: { fileName: "model.onnx", sha256: null },
			directory: join(workDir, "missing"),
			runtime: {
				openSession: async () => {
					throw new Error("unreachable");
				},
			},
			readFile: async () => new Uint8Array(),
			exists: () => false,
		});
		const outcome = await runEmbeddingJob(makeContext({ store, queue, adapter: unavailable, erasure }));
		expect(outcome.status).toBe("failed");
		expect(outcome.reason).toContain(EMBEDDING_ADAPTER_ERROR_CODES.MODEL_UNAVAILABLE);
		const job = queue.leaseNext("inspector");
		expect(job).toBeNull();
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		expect(lexical.search(FIXTURE_PROJECT_SCOPE, "模型缺失", { asOf: "2026-06-01T00:00:00Z" }).entries).toHaveLength(
			1,
		);
		lexical.close();
		store.close();
		erasure.close();
		queue.close();
		await unavailable.dispose();
	});

	it("过期 lease 回收后可重领（崩溃恢复语义）", async () => {
		const seeded = await seedMemory("租约恢复");
		const queue = await MemoryEmbeddingJobQueue.open({ databasePath });
		queue.enqueue({
			space: SPACE_V1,
			memoryId: seeded.memoryId,
			revisionNo: seeded.revision,
			scopeName: FIXTURE_PROJECT_SCOPE.name,
			...VECTOR_ID,
			content: "租约恢复",
			contentHash: "hash-d",
			erasureEpochSeen: 0,
		});
		const leased = queue.leaseNext("crashed-worker", 1);
		expect(leased).not.toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(queue.recoverExpiredLeases()).toBe(1);
		expect(queue.pendingCount()).toBe(1);
		const repossessed = queue.leaseNext("recovery-worker");
		expect(repossessed?.attempts).toBe(2);
		queue.close();
	});
});

describe("向量空间键", () => {
	it("sameVectorSpace 全字段一致才成立", () => {
		expect(sameVectorSpace(SPACE_V1, SPACE_V1)).toBe(true);
		expect(sameVectorSpace(SPACE_V1, SPACE_V2)).toBe(false);
		expect(sameVectorSpace(SPACE_V1, { ...SPACE_V1, normalization: "none" })).toBe(false);
	});
});

function countTable(table: string): number {
	const require = createRequire(import.meta.url);
	const Database = require(require.resolve("better-sqlite3")) as new (
		path: string,
	) => {
		prepare: (sql: string) => { get: () => { n: number } };
		close: () => void;
	};
	const db = new Database(databasePath);
	try {
		return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
	} finally {
		db.close();
	}
}
