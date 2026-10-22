// Modified by The Open Forge contributors.
import { createRequire } from "node:module";
import type { MemoryScope, TemporalSelector } from "@vetta/runtime-memory";
import { planLexicalQuery } from "./lexical-query.js";

/**
 * 有作用域的词法检索索引（TASK-0372）。
 *
 * 独立连接同一 SQLite 库（WAL 支持与存储 worker 并存；写入仅限本层自有的
 * FTS 索引表）。索引表可由事实表（memory_revisions）完全重建：refresh()
 * 幂等同步，重复重建结果一致；检索前先按宿主 scope/有效时间过滤行，
 * 绝不靠“全库召回后屏蔽”。
 */

interface LexicalRow {
	readonly memory_id: string;
	readonly revision_no: number;
	readonly revision_id: string;
	readonly content: string;
	readonly scope_name: string;
	readonly valid_from: string;
	readonly valid_to: string;
	readonly recorded_at: string;
}

export interface LexicalSearchEntry {
	readonly memoryId: string;
	readonly revisionId: string;
	readonly content: string;
	readonly validFrom: string;
	readonly recordedAt: string;
	readonly matchKind: "trigram" | "instr-fallback";
}

export interface LexicalSearchResult {
	readonly entries: readonly LexicalSearchEntry[];
	readonly matchKind: "trigram" | "instr-fallback";
	readonly degraded: boolean;
	/** 命中行是否来自降级回退（短词）——UI/调用方需要区分显示。 */
	readonly usedFallback: boolean;
}

interface BetterSqlite3Database {
	pragma: (statement: string) => unknown;
	prepare: (sql: string) => {
		run: (...args: unknown[]) => unknown;
		all: (...args: unknown[]) => unknown[];
		get: (...args: unknown[]) => unknown;
	};
	exec: (sql: string) => void;
	close: () => void;
}

export class LexicalMemoryIndex {
	private readonly db: BetterSqlite3Database;

	private constructor(db: BetterSqlite3Database) {
		this.db = db;
	}

	static async open(options: { readonly databasePath: string }): Promise<LexicalMemoryIndex> {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => BetterSqlite3Database;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		db.exec(
			"CREATE VIRTUAL TABLE IF NOT EXISTS memory_lexical_tri USING fts5(content, tokenize = 'trigram', memoryId UNINDEXED, revisionNo UNINDEXED, scopeName UNINDEXED)",
		);
		return new LexicalMemoryIndex(db);
	}

	/** 幂等重建：索引行与事实表（当前未遗忘修订）完全一致；可重复执行。 */
	refresh(): void {
		this.db.exec("BEGIN");
		try {
			this.db.exec("DELETE FROM memory_lexical_tri");
			const rows = this.db
				.prepare(
					"SELECT memory_id, revision_no, revision_id, content, scope_name FROM memory_revisions WHERE memory_id NOT IN (SELECT memory_id FROM memory_suppressed)",
				)
				.all() as unknown as LexicalRow[];
			const insert = this.db.prepare(
				"INSERT INTO memory_lexical_tri (content, memoryId, revisionNo, scopeName) VALUES (?, ?, ?, ?)",
			);
			for (const row of rows) {
				insert.run(row.content, row.memory_id, row.revision_no, row.scope_name);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	/**
	 * 作用域词法检索：先过滤授权 scope 与有效时间，再匹配。
	 * 短词走参数化 instr 回退（有界 limit）；FTS 输入一律字面量转义。
	 */
	search(scope: MemoryScope, query: string, selector: TemporalSelector, limit = 20): LexicalSearchResult {
		const plan = planLexicalQuery(query, { limit });
		this.refresh();
		const baseRows = this.db
			.prepare(
				`SELECT memory_id, revision_no, revision_id, content, scope_name, valid_from, valid_to, recorded_at
				 FROM memory_revisions
				 WHERE memory_id NOT IN (SELECT memory_id FROM memory_suppressed)`,
			)
			.all() as unknown as LexicalRow[];
		const allowed = baseRows.filter((row) => row.scope_name === scope.name && this.isEffectiveAt(row, selector.asOf));
		const byKey = (rows: readonly { memoryId: string; revisionNo: number }[]) => {
			const keys = new Set(rows.map((row) => `${row.memoryId}#${row.revisionNo}`));
			return allowed.filter((row) => keys.has(`${row.memory_id}#${row.revision_no}`));
		};

		if (plan.matchKind === "trigram") {
			const hits = this.db
				.prepare("SELECT memoryId, revisionNo FROM memory_lexical_tri WHERE memory_lexical_tri MATCH ? LIMIT ?")
				.all(plan.ftsLiteral, plan.limit * 4) as unknown as { memoryId: string; revisionNo: number }[];
			const entries = byKey(hits)
				.slice(0, plan.limit)
				.map((row) => this.toEntry(row, "trigram"));
			return { entries, matchKind: "trigram", degraded: false, usedFallback: false };
		}

		const term = plan.instrTerm ?? "";
		const instr = this.db.prepare(
			`SELECT memory_id, revision_no FROM memory_revisions
			 WHERE memory_id NOT IN (SELECT memory_id FROM memory_suppressed)
			 AND instr(content, ?) > 0 LIMIT ?`,
		);
		const hits = instr.all(term, plan.limit * 4) as unknown as { memory_id: string; revision_no: number }[];
		const entries = byKey(hits.map((row) => ({ memoryId: row.memory_id, revisionNo: row.revision_no })))
			.slice(0, plan.limit)
			.map((row) => this.toEntry(row, "instr-fallback"));
		return { entries, matchKind: "instr-fallback", degraded: true, usedFallback: true };
	}

	close(): void {
		this.db.close();
	}

	private isEffectiveAt(row: Pick<LexicalRow, "valid_from" | "valid_to">, asOf: string): boolean {
		if (row.valid_from === "unknown" || row.valid_to === "unknown") {
			return false;
		}
		if (row.valid_from > asOf) {
			return false;
		}
		return row.valid_to === "" || row.valid_to > asOf;
	}

	private toEntry(row: LexicalRow, matchKind: "trigram" | "instr-fallback"): LexicalSearchEntry {
		return {
			memoryId: row.memory_id,
			revisionId: row.revision_id,
			content: row.content,
			validFrom: row.valid_from,
			recordedAt: row.recorded_at,
			matchKind,
		};
	}
}
