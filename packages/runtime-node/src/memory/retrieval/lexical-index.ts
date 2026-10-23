// Modified by The Open Forge contributors.
import { createRequire } from "node:module";
import type { MemoryScope, TemporalSelector } from "@vetta/runtime-memory";
import { planLexicalQuery } from "./lexical-query.js";

/**
 * 有作用域的词法检索索引（TASK-0372；BUG-0147/R1 修订）。
 *
 * 独立连接同一 SQLite 库（WAL 支持与存储 worker 并存；写入仅限本层自有的
 * FTS 索引表）。索引表可由事实表（memory_revisions）完全重建：refresh()
 * 幂等同步，重复重建结果一致。授权过滤（完整身份：principal/project/
 * workspaceView）发生在候选 limit 之前的 SQL 内——绝不「全库召回后屏蔽」，
 * 也不允许未授权行占掉候选名额。
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

interface IdentityFilter {
	readonly principalId: string;
	readonly projectId: string;
	readonly workspaceViewId: string;
}

function identityFilterOf(scope: MemoryScope): IdentityFilter {
	return {
		principalId: scope.identity.principalId,
		projectId: scope.identity.projectId ?? "",
		workspaceViewId: scope.identity.workspaceViewId ?? "",
	};
}

export class LexicalMemoryIndex {
	private readonly db: BetterSqlite3Database;
	private closed = false;

	private constructor(db: BetterSqlite3Database) {
		this.db = db;
	}

	/**
	 * 同步打开：底层 better-sqlite3 全部是同步 API，此前 async 包装只是让宿主
	 * 必须在异步上下文里装配；Desktop 的 createExplicitMemoryRuntime 是同步工厂，
	 * 同步化后 `await open(...)` 依旧成立（await 非 Promise 值合法），调用点零改动。
	 */
	static open(options: { readonly databasePath: string }): LexicalMemoryIndex {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => BetterSqlite3Database;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		// BUG-0147：旧形状（无身份列）是纯派生表——丢弃重建，不动事实层。
		const columns = db.prepare("PRAGMA table_info(memory_lexical_tri)").all() as unknown as { name: string }[];
		const hasIdentity =
			columns.some((column) => column.name === "principalId") &&
			columns.some((column) => column.name === "projectId") &&
			columns.some((column) => column.name === "workspaceViewId");
		if (columns.length > 0 && !hasIdentity) {
			db.exec("DROP TABLE memory_lexical_tri");
		}
		db.exec(
			"CREATE VIRTUAL TABLE IF NOT EXISTS memory_lexical_tri USING fts5(content, tokenize = 'trigram', memoryId UNINDEXED, revisionNo UNINDEXED, scopeName UNINDEXED, principalId UNINDEXED, projectId UNINDEXED, workspaceViewId UNINDEXED)",
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
					"SELECT memory_id, revision_no, revision_id, content, scope_name, principal_id, project_id, workspace_view_id FROM memory_revisions WHERE memory_id NOT IN (SELECT memory_id FROM memory_suppressed)",
				)
				.all() as unknown as (LexicalRow & {
				principal_id: string;
				project_id: string;
				workspace_view_id: string;
			})[];
			const insert = this.db.prepare(
				"INSERT INTO memory_lexical_tri (content, memoryId, revisionNo, scopeName, principalId, projectId, workspaceViewId) VALUES (?, ?, ?, ?, ?, ?, ?)",
			);
			for (const row of rows) {
				insert.run(
					row.content,
					row.memory_id,
					row.revision_no,
					row.scope_name,
					row.principal_id,
					row.project_id,
					row.workspace_view_id,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	/**
	 * 作用域词法检索：完整身份 + 未遗忘 + 有效时间全部在候选 limit 之前
	 * 约束；短词走参数化 instr 回退（同样先过滤授权再 limit）；FTS 输入
	 * 一律字面量转义。
	 */
	search(scope: MemoryScope, query: string, selector: TemporalSelector, limit = 20): LexicalSearchResult {
		const plan = planLexicalQuery(query, { limit });
		this.refresh();
		const identity = identityFilterOf(scope);
		const effective = (row: Pick<LexicalRow, "valid_from" | "valid_to">) => this.isEffectiveAt(row, selector.asOf);

		if (plan.matchKind === "trigram") {
			const hits = this.db
				.prepare(
					`SELECT memoryId, revisionNo FROM memory_lexical_tri
					 WHERE memory_lexical_tri MATCH ?
					   AND principalId = ? AND projectId = ? AND workspaceViewId = ?
					 LIMIT ?`,
				)
				.all(
					plan.ftsLiteral,
					identity.principalId,
					identity.projectId,
					identity.workspaceViewId,
					plan.limit,
				) as unknown as {
				memoryId: string;
				revisionNo: number;
			}[];
			const entries: LexicalSearchEntry[] = [];
			for (const hit of hits) {
				const row = this.db
					.prepare(
						`SELECT memory_id, revision_no, revision_id, content, scope_name, valid_from, valid_to, recorded_at
						 FROM memory_revisions
						 WHERE memory_id = ? AND revision_no = ?
						   AND memory_id NOT IN (SELECT memory_id FROM memory_suppressed)`,
					)
					.get(hit.memoryId, hit.revisionNo) as unknown as LexicalRow | undefined;
				if (row === undefined || row.scope_name !== scope.name || !effective(row)) continue;
				entries.push(this.toEntry(row, "trigram"));
			}
			return { entries, matchKind: "trigram", degraded: false, usedFallback: false };
		}

		const term = plan.instrTerm ?? "";
		const rows = this.db
			.prepare(
				`SELECT memory_id, revision_no, revision_id, content, scope_name, valid_from, valid_to, recorded_at
				 FROM memory_revisions
				 WHERE scope_name = ? AND principal_id = ? AND project_id = ? AND workspace_view_id = ?
				   AND memory_id NOT IN (SELECT memory_id FROM memory_suppressed)
				   AND instr(content, ?) > 0
				 LIMIT ?`,
			)
			.all(
				scope.name,
				identity.principalId,
				identity.projectId,
				identity.workspaceViewId,
				term,
				plan.limit,
			) as unknown as LexicalRow[];
		return {
			entries: rows.filter(effective).map((row) => this.toEntry(row, "instr-fallback")),
			matchKind: "instr-fallback",
			degraded: true,
			usedFallback: true,
		};
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
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
