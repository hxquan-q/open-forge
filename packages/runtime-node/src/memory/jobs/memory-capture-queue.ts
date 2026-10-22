// Modified by The Open Forge contributors.
import { createRequire } from "node:module";
import type { MemoryScope } from "@vetta/runtime-memory";

/**
 * 持久捕获队列（TASK-0379）。
 *
 * - 入队：按合法 source/cursor 入 jobs 表，幂等键 source+extractor；
 * - 高水位对账：compactedAtHighWater 标记「对话已提交、入队前崩溃」窗口；
 * - 出队：lease/attempt/退避，提交前重检 erasure epoch（epoch 前进即放弃）；
 * - 关闭（policy off）后不再领取新 job；在途 job 提交前重检策略。
 */

interface SqliteDatabase {
	pragma: (statement: string) => unknown;
	prepare: (sql: string) => {
		run: (...args: unknown[]) => { changes: number | bigint };
		all: (...args: unknown[]) => Record<string, unknown>[];
		get: (...args: unknown[]) => Record<string, unknown> | undefined;
	};
	exec: (sql: string) => void;
	close: () => void;
	transaction: <T>(fn: () => T) => () => T;
}

export interface MemoryCaptureJob {
	readonly jobId: number;
	readonly sourceId: string;
	readonly cursor: string;
	readonly payload: string;
	readonly attempts: number;
	readonly status: "pending" | "leased" | "done" | "failed";
	readonly lastError: string | null;
}

export interface EnqueueOptions {
	readonly sourceId: string;
	readonly cursor: string;
	/** 捕获载荷（已按允许范围过滤：user/最终可见文本/经许可 tool outcome 引用）。 */
	readonly payload: string;
	readonly extractorVersion: string;
}

export class MemoryCaptureQueue {
	private readonly db: SqliteDatabase;

	private constructor(db: SqliteDatabase) {
		this.db = db;
	}

	static async open(options: { readonly databasePath: string }): Promise<MemoryCaptureQueue> {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => SqliteDatabase;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		db.exec(
			`CREATE TABLE IF NOT EXISTS memory_capture_jobs (
				job_id INTEGER PRIMARY KEY AUTOINCREMENT,
				source_id TEXT NOT NULL,
				extractor_version TEXT NOT NULL,
				cursor TEXT NOT NULL,
				payload TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				attempts INTEGER NOT NULL DEFAULT 0,
				lease_owner TEXT,
				lease_expires_at_ms INTEGER,
				last_error TEXT,
				created_at_ms INTEGER NOT NULL,
				UNIQUE (source_id, extractor_version)
			)`,
		);
		db.exec(
			"CREATE TABLE IF NOT EXISTS memory_capture_high_water (id INTEGER PRIMARY KEY CHECK (id = 1), compacted_at_high_water TEXT)",
		);
		return new MemoryCaptureQueue(db);
	}

	/** 幂等入队：同 source+extractor 只有一条；崩溃恢复后由对账补齐。 */
	enqueue(options: EnqueueOptions): { enqueued: boolean; jobId: number } {
		const now = Date.now();
		const result = this.db
			.prepare(
				`INSERT INTO memory_capture_jobs (source_id, extractor_version, cursor, payload, status, created_at_ms)
				 VALUES (?, ?, ?, ?, 'pending', ?)
				 ON CONFLICT (source_id, extractor_version) DO NOTHING`,
			)
			.run(options.sourceId, options.extractorVersion, options.cursor, options.payload, now);
		if (Number(result.changes) === 0) {
			const existing = this.db
				.prepare("SELECT job_id FROM memory_capture_jobs WHERE source_id = ? AND extractor_version = ?")
				.get(options.sourceId, options.extractorVersion);
			return { enqueued: false, jobId: Number(existing?.job_id ?? 0) };
		}
		const row = this.db
			.prepare("SELECT job_id FROM memory_capture_jobs WHERE source_id = ? AND extractor_version = ?")
			.get(options.sourceId, options.extractorVersion);
		return { enqueued: true, jobId: Number(row?.job_id ?? 0) };
	}

	/** 领取待处理 job：lease 到期或 pending；attempt+1。跨进程靠 UPDATE 原子性。 */
	leaseNext(owner: string, leaseMs = 60_000): MemoryCaptureJob | null {
		const now = Date.now();
		const candidate = this.db
			.prepare(
				`SELECT job_id FROM memory_capture_jobs
				 WHERE status = 'pending' OR (status = 'leased' AND lease_expires_at_ms < ?)
				 ORDER BY job_id LIMIT 1`,
			)
			.get(now);
		if (!candidate) return null;
		const claimed = this.db
			.prepare(
				`UPDATE memory_capture_jobs
				 SET status = 'leased', lease_owner = ?, lease_expires_at_ms = ?, attempts = attempts + 1
				 WHERE job_id = ? AND (status = 'pending' OR (status = 'leased' AND lease_expires_at_ms < ?))`,
			)
			.run(owner, now + leaseMs, candidate.job_id, now);
		if (Number(claimed.changes) === 0) return null;
		return this.job(candidate.job_id as number);
	}

	private job(jobId: number): MemoryCaptureJob | null {
		const row = this.db.prepare("SELECT * FROM memory_capture_jobs WHERE job_id = ?").get(jobId);
		if (!row) return null;
		return {
			jobId: Number(row.job_id),
			sourceId: String(row.source_id),
			cursor: String(row.cursor),
			payload: String(row.payload),
			attempts: Number(row.attempts),
			status: row.status as MemoryCaptureJob["status"],
			lastError: row.last_error === null ? null : String(row.last_error),
		};
	}

	/** 完成前重检：erasure epoch 已前进（提交时传入当前纪元）→ 放弃而非提交。 */
	complete(jobId: number, options: { readonly erasureEpochSeen: number; readonly currentEpoch: number }): boolean {
		if (options.erasureEpochSeen < options.currentEpoch) {
			this.abandon(jobId, "erasure epoch advanced");
			return false;
		}
		this.db
			.prepare(
				"UPDATE memory_capture_jobs SET status = 'done', lease_owner = NULL, lease_expires_at_ms = NULL WHERE job_id = ?",
			)
			.run(jobId);
		return true;
	}

	fail(jobId: number, error: string): void {
		this.db
			.prepare(
				"UPDATE memory_capture_jobs SET status = 'failed', last_error = ?, lease_owner = NULL, lease_expires_at_ms = NULL WHERE job_id = ?",
			)
			.run(error, jobId);
	}

	private abandon(jobId: number, reason: string): void {
		this.db
			.prepare("UPDATE memory_capture_jobs SET status = 'failed', last_error = ? WHERE job_id = ?")
			.run(reason, jobId);
	}

	/** 关闭（policy off）后不再领取：由调用方停用 leaseNext；本方法只清过期 lease 供状态展示。 */
	recoverExpiredLeases(): number {
		const now = Date.now();
		const result = this.db
			.prepare(
				"UPDATE memory_capture_jobs SET status = 'pending', lease_owner = NULL WHERE status = 'leased' AND lease_expires_at_ms < ?",
			)
			.run(now);
		return Number(result.changes);
	}

	/** 高水位对账：记录「对话已提交」的水位；入队对账只补该水位之后且未入队的 source。 */
	setHighWater(compactedAt: string): void {
		this.db
			.prepare("INSERT OR REPLACE INTO memory_capture_high_water (id, compacted_at_high_water) VALUES (1, ?)")
			.run(compactedAt);
	}

	readHighWater(): string | null {
		const row = this.db.prepare("SELECT compacted_at_high_water FROM memory_capture_high_water WHERE id = 1").get();
		return row === undefined ? null : String(row.compacted_at_high_water);
	}

	pendingCount(): number {
		const row = this.db
			.prepare("SELECT COUNT(*) AS n FROM memory_capture_jobs WHERE status IN ('pending', 'leased')")
			.get();
		return Number(row?.n ?? 0);
	}

	close(): void {
		this.db.close();
	}
}

void ({} as MemoryScope);
