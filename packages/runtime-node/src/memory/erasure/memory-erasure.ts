// Modified by The Open Forge contributors.
import { createRequire } from "node:module";
import { assertErasureEpochFresh, type MemoryErasureState } from "@vetta/runtime-memory";

/**
 * 事务性遗忘屏障（TASK-0373）。
 *
 * 遗忘是家族级事务：单一 BEGIN IMMEDIATE 内 ①提高 erasure epoch
 * ②登记家族与来源抑制（不含正文）③清除全部版本修订、来源引用与派生
 * FTS 行 ④写入无正文审计行。绝不自动恢复 parent 为当前值；「撤销一次
 * 更正」是独立显式操作（undoLastCorrection）。
 *
 * 边界如实说明（REQ-0027）：逻辑不可召回 ≠ 物理清除——SQLite WAL、
 * 用户自建备份、用户另行导出的副本不受本操作影响；处理原始对话来源
 * 是独立入口（alsoProcessSources），不在遗忘事务内伪装完成。
 */

interface SqliteDatabase {
	pragma: (statement: string) => unknown;
	prepare: (sql: string) => {
		run: (...args: unknown[]) => unknown;
		all: (...args: unknown[]) => unknown[];
		get: (...args: unknown[]) => unknown;
	};
	exec: (sql: string) => void;
	close: () => void;
	transaction: <T>(fn: () => T) => () => T;
}

export interface ErasureAuditEntry {
	readonly memoryId: string;
	readonly erasedAtMs: number;
	readonly erasureEpoch: number;
	readonly reason: string;
}

export interface MemoryErasureOutcome {
	readonly memoryId: string;
	readonly erasureEpoch: number;
	readonly removedRevisions: number;
	readonly suppressedSourceIds: readonly string[];
}

export class SqliteMemoryErasure {
	private readonly db: SqliteDatabase;

	private constructor(db: SqliteDatabase) {
		this.db = db;
	}

	static async open(options: { readonly databasePath: string }): Promise<SqliteMemoryErasure> {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => SqliteDatabase;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		db.exec(
			"CREATE TABLE IF NOT EXISTS memory_suppressed_sources (source_id TEXT PRIMARY KEY, suppressed_at_ms INTEGER NOT NULL)",
		);
		db.exec(
			"CREATE TABLE IF NOT EXISTS memory_erasure_audit (memory_id TEXT NOT NULL, erased_at_ms INTEGER NOT NULL, erasure_epoch INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (memory_id, erased_at_ms))",
		);
		// 词法层拥有的 FTS 表：同 DDL 幂等创建（与 LexicalMemoryIndex 一致），
		// 保证遗忘事务总能清除派生行。
		db.exec(
			"CREATE VIRTUAL TABLE IF NOT EXISTS memory_lexical_tri USING fts5(content, tokenize = 'trigram', memoryId UNINDEXED, revisionNo UNINDEXED, scopeName UNINDEXED)",
		);
		return new SqliteMemoryErasure(db);
	}

	readErasureState(): MemoryErasureState {
		const row = this.db.prepare("SELECT erasure_epoch FROM memory_erasure WHERE id = 1").get() as
			| { erasure_epoch: number }
			| undefined;
		return {
			erasureEpoch: row?.erasure_epoch ?? 0,
			suppressedMemoryIds: (
				this.db.prepare("SELECT memory_id FROM memory_suppressed").all() as { memory_id: string }[]
			).map((entry) => entry.memory_id),
		};
	}

	isSourceSuppressed(sourceId: string): boolean {
		return (
			this.db.prepare("SELECT 1 AS hit FROM memory_suppressed_sources WHERE source_id = ?").get(sourceId) !==
			undefined
		);
	}

	/**
	 * 事务性遗忘：清除整个家族（全部版本+来源+派生 FTS 行），登记来源抑制
	 * 与无正文审计行，推进 epoch。家族不存在时仍登记抑制并推进（幂等防线）。
	 */
	forgetMemoryFamily(options: { readonly memoryId: string; readonly reason?: string }): MemoryErasureOutcome {
		return this.db.transaction(() => {
			const state = this.readErasureState();
			const nextEpoch = state.erasureEpoch + 1;
			const now = Date.now();
			const sourceRows = this.db
				.prepare("SELECT DISTINCT source_id FROM memory_sources WHERE memory_id = ?")
				.all(options.memoryId) as { source_id: string }[];
			for (const row of sourceRows) {
				this.db
					.prepare("INSERT OR REPLACE INTO memory_suppressed_sources (source_id, suppressed_at_ms) VALUES (?, ?)")
					.run(row.source_id, now);
			}
			const revisionCount = this.db
				.prepare("SELECT COUNT(*) AS n FROM memory_revisions WHERE memory_id = ?")
				.get(options.memoryId) as { n: number };
			this.db.prepare("DELETE FROM memory_revisions WHERE memory_id = ?").run(options.memoryId);
			this.db.prepare("DELETE FROM memory_sources WHERE memory_id = ?").run(options.memoryId);
			this.db.prepare("DELETE FROM memory_lexical_tri WHERE memoryId = ?").run(options.memoryId);
			this.db
				.prepare("INSERT OR REPLACE INTO memory_suppressed (memory_id, suppressed_at_ms) VALUES (?, ?)")
				.run(options.memoryId, now);
			this.db.prepare("UPDATE memory_erasure SET erasure_epoch = ? WHERE id = 1").run(nextEpoch);
			this.db
				.prepare(
					"INSERT OR REPLACE INTO memory_erasure_audit (memory_id, erased_at_ms, erasure_epoch, reason) VALUES (?, ?, ?, ?)",
				)
				.run(options.memoryId, now, nextEpoch, options.reason ?? "user-forget");
			return {
				memoryId: options.memoryId,
				erasureEpoch: nextEpoch,
				removedRevisions: revisionCount?.n ?? 0,
				suppressedSourceIds: sourceRows.map((row) => row.source_id),
			};
		})();
	}

	/**
	 * 撤销最近一次更正（显式用户操作，非遗忘副作用）：从修订历史取上一版
	 * 内容追加新修订恢复，绝不改写历史、绝不绕过 expectedRevision。
	 */
	undoLastCorrection(options: { readonly memoryId: string; readonly expectedRevision: number }): {
		readonly restoredRevision: number;
		readonly restoredContent: string;
	} {
		return this.db.transaction(() => {
			const current = this.db
				.prepare("SELECT MAX(revision_no) AS n FROM memory_revisions WHERE memory_id = ?")
				.get(options.memoryId) as { n: number | null };
			const currentRevision = current?.n ?? 0;
			if (currentRevision === 0) {
				throw new Error(`记忆 ${options.memoryId} 不存在或已遗忘，无法撤销更正`);
			}
			if (options.expectedRevision !== currentRevision) {
				throw new Error(
					`expectedRevision ${options.expectedRevision} 与当前修订 ${currentRevision} 不符（REVISION_CONFLICT 语义，撤销前请重读）`,
				);
			}
			const rows = this.db
				.prepare(
					"SELECT revision_no, content FROM memory_revisions WHERE memory_id = ? ORDER BY revision_no DESC LIMIT 2",
				)
				.all(options.memoryId) as { revision_no: number; content: string }[];
			const previous = rows[1];
			if (!previous) {
				throw new Error(`记忆 ${options.memoryId} 没有可撤销的历史修订`);
			}
			const now = new Date().toISOString();
			const next = currentRevision + 1;
			this.db
				.prepare(
					"UPDATE memory_revisions SET status = 'superseded', valid_to = ? WHERE memory_id = ? AND revision_no = ?",
				)
				.run(now, options.memoryId, currentRevision);
			this.db
				.prepare(
					`INSERT INTO memory_revisions
						(memory_id, revision_no, revision_id, kind, content, scope_name, visibility, status,
						valid_from, valid_to, recorded_at, supersedes, evidence, pinned, created_at_ms)
					VALUES (?, ?, ?, 'fact', ?, (SELECT scope_name FROM memory_revisions WHERE memory_id = ? AND revision_no = ?), NULL, 'active', ?, '', ?, ?, 'user-confirmed', 0, ?)`,
				)
				.run(
					options.memoryId,
					next,
					`rev-undo-${next}-${Date.now()}`,
					previous.content,
					options.memoryId,
					currentRevision,
					now,
					now,
					`rev-of-${currentRevision}`,
					Date.now(),
				);
			return { restoredRevision: next, restoredContent: previous.content };
		})();
	}

	/** 无正文审计（隐私例外下的最低标识）。 */
	listAudit(): readonly ErasureAuditEntry[] {
		return this.db
			.prepare(
				"SELECT memory_id, erased_at_ms, erasure_epoch, reason FROM memory_erasure_audit ORDER BY erased_at_ms",
			)
			.all() as ErasureAuditEntry[];
	}

	/** 派生消费者（FTS/向量/摘要/待处理 job）提交前重检：所见纪元落后即拒绝。 */
	assertCommitAllowed(seenEpoch: number): void {
		assertErasureEpochFresh(seenEpoch, this.readErasureState());
	}

	close(): void {
		this.db.close();
	}
}
