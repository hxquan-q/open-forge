// Copyright The Open Forge contributors.

import { createRequire } from "node:module";
import {
	EMBEDDING_ADAPTER_ERROR_CODES,
	type EmbeddingAdapter,
	EmbeddingAdapterError,
	type EmbeddingVectorSpaceKey,
	vectorSpaceKeyOf,
} from "./embedding-adapter.js";
import type { VectorMemoryStore } from "./vector-store.js";

/**
 * embedding 任务队列与执行器（TASK-0381）。
 *
 * 与捕获队列（0379）同款持久 job 模式：幂等键 = 向量空间 + 修订 + 内容
 * hash；lease/attempt；完成前复检 erasure epoch 与 suppressed 集合——
 * epoch 前进或来源被遗忘即放弃，绝不把向量写回。语义模型不可用时任务
 * 标 failed 并保留可读原因，词法路径不受影响。
 */

interface SqliteStatement {
	run: (...args: unknown[]) => { changes: number | bigint };
	all: (...args: unknown[]) => Record<string, unknown>[];
	get: (...args: unknown[]) => Record<string, unknown> | undefined;
}

interface SqliteDatabase {
	pragma: (statement: string) => unknown;
	prepare: (sql: string) => SqliteStatement;
	exec: (sql: string) => void;
	close: () => void;
}

export interface MemoryEmbeddingJob {
	readonly jobId: number;
	readonly space: EmbeddingVectorSpaceKey;
	readonly memoryId: string;
	readonly revisionNo: number;
	readonly scopeName: string;
	/** BUG-0147/R1：完整身份随任务落库，写向量时使用同一身份。 */
	readonly principalId: string;
	readonly projectId: string;
	readonly workspaceViewId: string;
	readonly content: string;
	readonly contentHash: string;
	/** 入队时观察到的 erasure epoch；完成前与当前 epoch 复检。 */
	readonly erasureEpochSeen: number;
	readonly attempts: number;
	readonly status: "pending" | "leased" | "done" | "failed";
	readonly lastError: string | null;
}

export interface EnqueueEmbeddingOptions {
	readonly space: EmbeddingVectorSpaceKey;
	readonly memoryId: string;
	readonly revisionNo: number;
	readonly scopeName: string;
	readonly principalId: string;
	readonly projectId: string;
	readonly workspaceViewId: string;
	readonly content: string;
	readonly contentHash: string;
}

export class MemoryEmbeddingJobQueue {
	private readonly db: SqliteDatabase;
	private closed = false;

	private constructor(db: SqliteDatabase) {
		this.db = db;
	}

	static async open(options: { readonly databasePath: string }): Promise<MemoryEmbeddingJobQueue> {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => SqliteDatabase;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		db.exec(
			`CREATE TABLE IF NOT EXISTS memory_embedding_jobs (
				job_id INTEGER PRIMARY KEY AUTOINCREMENT,
				model_id TEXT NOT NULL,
				model_revision TEXT NOT NULL,
				dimension INTEGER NOT NULL,
				normalization TEXT NOT NULL,
				memory_id TEXT NOT NULL,
				revision_no INTEGER NOT NULL,
				scope_name TEXT NOT NULL,
				principal_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				workspace_view_id TEXT NOT NULL,
				content TEXT NOT NULL,
				content_hash TEXT NOT NULL,
				erasure_epoch_seen INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				attempts INTEGER NOT NULL DEFAULT 0,
				lease_owner TEXT,
				lease_expires_at_ms INTEGER,
				last_error TEXT,
				created_at_ms INTEGER NOT NULL,
				UNIQUE (model_id, model_revision, dimension, normalization, memory_id, revision_no, content_hash)
			)`,
		);
		return new MemoryEmbeddingJobQueue(db);
	}

	/** 幂等入队：同空间同修订同内容 hash 只有一条（升级模型 = 新空间 = 新 job）。 */
	enqueue(options: EnqueueEmbeddingOptions & { readonly erasureEpochSeen: number }): {
		enqueued: boolean;
		jobId: number;
	} {
		this.assertOpen();
		const space = options.space;
		const inserted = this.db
			.prepare(
				`INSERT INTO memory_embedding_jobs
				 (model_id, model_revision, dimension, normalization, memory_id, revision_no, scope_name, principal_id, project_id, workspace_view_id, content, content_hash, erasure_epoch_seen, status, created_at_ms)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
				 ON CONFLICT (model_id, model_revision, dimension, normalization, memory_id, revision_no, content_hash) DO NOTHING`,
			)
			.run(
				space.modelId,
				space.modelRevision,
				space.dimension,
				space.normalization,
				options.memoryId,
				options.revisionNo,
				options.scopeName,
				options.principalId,
				options.projectId,
				options.workspaceViewId,
				options.content,
				options.contentHash,
				options.erasureEpochSeen,
				Date.now(),
			);
		const row = this.findByKey(options);
		return { enqueued: Number(inserted.changes) > 0, jobId: Number(row?.job_id ?? 0) };
	}

	leaseNext(owner: string, leaseMs = 60_000): MemoryEmbeddingJob | null {
		this.assertOpen();
		const now = Date.now();
		const candidate = this.db
			.prepare(
				`SELECT job_id FROM memory_embedding_jobs
				 WHERE status = 'pending' OR (status = 'leased' AND lease_expires_at_ms < ?)
				 ORDER BY job_id LIMIT 1`,
			)
			.get(now);
		if (!candidate) return null;
		const claimed = this.db
			.prepare(
				`UPDATE memory_embedding_jobs
				 SET status = 'leased', lease_owner = ?, lease_expires_at_ms = ?, attempts = attempts + 1
				 WHERE job_id = ? AND (status = 'pending' OR (status = 'leased' AND lease_expires_at_ms < ?))`,
			)
			.run(owner, now + leaseMs, candidate.job_id, now);
		if (Number(claimed.changes) === 0) return null;
		return this.job(Number(candidate.job_id));
	}

	/** 完成前复检：erasure epoch 前进或记忆已被抑制 → 放弃（不写向量）。 */
	complete(
		jobId: number,
		options: {
			readonly erasureEpochSeen: number;
			readonly currentEpoch: number;
			readonly suppressedMemoryIds: readonly string[];
		},
	): boolean {
		this.assertOpen();
		const job = this.job(jobId);
		if (job === null) return false;
		if (options.erasureEpochSeen < options.currentEpoch || options.suppressedMemoryIds.includes(job.memoryId)) {
			this.db
				.prepare(
					"UPDATE memory_embedding_jobs SET status = 'failed', last_error = ?, lease_owner = NULL, lease_expires_at_ms = NULL WHERE job_id = ?",
				)
				.run(
					options.erasureEpochSeen < options.currentEpoch ? "erasure epoch advanced" : "memory suppressed",
					jobId,
				);
			return false;
		}
		this.db
			.prepare(
				"UPDATE memory_embedding_jobs SET status = 'done', lease_owner = NULL, lease_expires_at_ms = NULL WHERE job_id = ?",
			)
			.run(jobId);
		return true;
	}

	fail(jobId: number, error: string): void {
		this.assertOpen();
		this.db
			.prepare(
				"UPDATE memory_embedding_jobs SET status = 'failed', last_error = ?, lease_owner = NULL, lease_expires_at_ms = NULL WHERE job_id = ?",
			)
			.run(error, jobId);
	}

	recoverExpiredLeases(): number {
		this.assertOpen();
		const now = Date.now();
		const result = this.db
			.prepare(
				"UPDATE memory_embedding_jobs SET status = 'pending', lease_owner = NULL WHERE status = 'leased' AND lease_expires_at_ms < ?",
			)
			.run(now);
		return Number(result.changes);
	}

	pendingCount(): number {
		this.assertOpen();
		const row = this.db
			.prepare("SELECT COUNT(*) AS n FROM memory_embedding_jobs WHERE status IN ('pending', 'leased')")
			.get();
		return Number(row?.n ?? 0);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.db.close();
	}

	private findByKey(options: EnqueueEmbeddingOptions): Record<string, unknown> | undefined {
		const space = options.space;
		return this.db
			.prepare(
				"SELECT job_id FROM memory_embedding_jobs WHERE model_id = ? AND model_revision = ? AND dimension = ? AND normalization = ? AND memory_id = ? AND revision_no = ? AND content_hash = ?",
			)
			.get(
				space.modelId,
				space.modelRevision,
				space.dimension,
				space.normalization,
				options.memoryId,
				options.revisionNo,
				options.contentHash,
			);
	}

	private job(jobId: number): MemoryEmbeddingJob | null {
		const row = this.db.prepare("SELECT * FROM memory_embedding_jobs WHERE job_id = ?").get(jobId);
		if (!row) return null;
		return {
			jobId: Number(row.job_id),
			space: {
				modelId: String(row.model_id),
				modelRevision: String(row.model_revision),
				dimension: Number(row.dimension),
				normalization: String(row.normalization) as EmbeddingVectorSpaceKey["normalization"],
			},
			memoryId: String(row.memory_id),
			revisionNo: Number(row.revision_no),
			scopeName: String(row.scope_name),
			principalId: String(row.principal_id),
			projectId: String(row.project_id),
			workspaceViewId: String(row.workspace_view_id),
			content: String(row.content),
			contentHash: String(row.content_hash),
			erasureEpochSeen: Number(row.erasure_epoch_seen),
			attempts: Number(row.attempts),
			status: row.status as MemoryEmbeddingJob["status"],
			lastError: row.last_error === null ? null : String(row.last_error),
		};
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.SESSION_CLOSED, "embedding 任务队列已关闭");
		}
	}
}

export interface EmbeddingJobRunContext {
	readonly store: VectorMemoryStore;
	readonly queue: MemoryEmbeddingJobQueue;
	readonly adapter: EmbeddingAdapter;
	/** 读取当前 erasure epoch 与被抑制记忆集合（由事实层/擦除层提供）。 */
	readonly readErasureState: () => Promise<{
		readonly erasureEpoch: number;
		readonly suppressedMemoryIds: readonly string[];
	}>;
	readonly owner: string;
}

export interface EmbeddingJobRunOutcome {
	readonly status: "completed" | "abandoned" | "failed" | "idle";
	readonly reason?: string;
	readonly jobId?: number;
}

/**
 * 执行一条 embedding job：lease → 生成向量 → 写入（写入点再拒 suppressed）
 * → 完成前复检 epoch/suppressed。适配器失败（模型未下载/加载取消）时任务
 * 标 failed 并返回明确状态，不向上抛穿。
 */
export async function runEmbeddingJob(context: EmbeddingJobRunContext): Promise<EmbeddingJobRunOutcome> {
	const job = context.queue.leaseNext(context.owner);
	if (job === null) {
		return { status: "idle" };
	}
	const space = vectorSpaceKeyOf(context.adapter.descriptor);
	if (
		job.space.modelId !== space.modelId ||
		job.space.modelRevision !== space.modelRevision ||
		job.space.dimension !== space.dimension ||
		job.space.normalization !== space.normalization
	) {
		// 领到的 job 属于其他向量空间（多模型并存）：放回并不处理。
		context.queue.fail(job.jobId, `job 属于其他向量空间（${job.space.modelId}@${job.space.modelRevision}）`);
		return { status: "failed", reason: "space-mismatch", jobId: job.jobId };
	}
	const erasure = await context.readErasureState();
	let vectors: readonly Float32Array[];
	try {
		vectors = await context.adapter.embed([job.content], "passage");
	} catch (error) {
		const message = error instanceof EmbeddingAdapterError ? `${error.code}: ${error.message}` : String(error);
		context.queue.fail(job.jobId, message);
		return { status: "failed", reason: message, jobId: job.jobId };
	}
	// 复检入队时 epoch 与当前 epoch：遗忘发生在生成期间也不能写回。
	const accepted = context.queue.complete(job.jobId, {
		erasureEpochSeen: job.erasureEpochSeen,
		currentEpoch: erasure.erasureEpoch,
		suppressedMemoryIds: erasure.suppressedMemoryIds,
	});
	if (!accepted) {
		return { status: "abandoned", reason: "erasure-or-suppression", jobId: job.jobId };
	}
	context.store.put(space, {
		memoryId: job.memoryId,
		revisionNo: job.revisionNo,
		scopeName: job.scopeName,
		principalId: job.principalId,
		projectId: job.projectId,
		workspaceViewId: job.workspaceViewId,
		vector: vectors[0] as Float32Array,
		erasureEpochSeen: erasure.erasureEpoch,
	});
	return { status: "completed", jobId: job.jobId };
}

/** 一次排空至多 maxJobs 条；返回各结局计数（供 worker 循环/测试使用）。 */
export async function drainEmbeddingJobs(
	context: EmbeddingJobRunContext,
	options: { readonly maxJobs: number },
): Promise<{ completed: number; abandoned: number; failed: number }> {
	const counts = { completed: 0, abandoned: 0, failed: 0 };
	for (let index = 0; index < options.maxJobs; index += 1) {
		const outcome = await runEmbeddingJob(context);
		if (outcome.status === "idle") break;
		if (outcome.status === "completed") counts.completed += 1;
		if (outcome.status === "abandoned") counts.abandoned += 1;
		if (outcome.status === "failed") counts.failed += 1;
	}
	return counts;
}
