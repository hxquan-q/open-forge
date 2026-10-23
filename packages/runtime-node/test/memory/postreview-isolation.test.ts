// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import { LexicalMemoryIndex, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";

/**
 * BUG-0147 复核回归（VERIFY-0022 R1/R2）：完整身份隔离与按 memoryId
 * 授权。全部用临时目录 + 合成数据；A/B 同名 project scope 不同 projectId，
 * 复现复核报告的跨项目读改路径，另覆盖授权过滤前置于候选 limit 与旧行
 * （空身份）隔离。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VectorMemoryStore } from "../../src/memory/embedding/index.js";

let workDir: string;
let databasePath: string;

const PROJECT_A = FIXTURE_PROJECT_SCOPE;
const PROJECT_B = {
	name: "project" as const,
	identity: { ...FIXTURE_PROJECT_SCOPE.identity, projectId: "project-b" },
};

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-postreview-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("复核回归：完整身份隔离与按 ID 授权", () => {
	it("A 写入→关闭→仅授权 B 重开：B 不可读、改、删 A（复核精确复现）", async () => {
		let memoryId = "";
		{
			const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [PROJECT_A] });
			try {
				const written = await store.write(PROJECT_A, {
					action: "remember",
					content: "SYNTHETIC_PROJECT_A_ONLY",
					kind: "fact",
					scopeName: "project",
					validFrom: "2026-01-01T00:00:00Z",
				});
				memoryId = written.memoryId;
			} finally {
				await store.close();
			}
		}
		const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [PROJECT_B] });
		try {
			await expect(store.read(PROJECT_B, { asOf: "2030-01-01T00:00:00Z" })).resolves.toEqual([]);
			await expect(
				store.write(PROJECT_B, { action: "correct", memoryId, expectedRevision: 1, content: "CHANGED_FROM_B" }),
			).rejects.toMatchObject({ code: "SCOPE_NOT_ALLOWED" });
			await expect(store.listRevisions(memoryId, PROJECT_B)).resolves.toEqual([]);
			await expect(store.listSources(memoryId, PROJECT_B)).resolves.toEqual([]);
			await expect(store.write(PROJECT_B, { action: "forget", memoryId })).rejects.toMatchObject({
				code: "SCOPE_NOT_ALLOWED",
			});
		} finally {
			await store.close();
		}
		// A 重开仍完整可读：B 的尝试没有造成任何破坏。
		const reopen = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [PROJECT_A] });
		try {
			const rows = await reopen.read(PROJECT_A, { asOf: "2030-01-01T00:00:00Z" });
			expect(rows.map((row) => row.content)).toEqual(["SYNTHETIC_PROJECT_A_ONLY"]);
		} finally {
			await reopen.close();
		}
	});

	it("correct 保持原归属：授权的 user scope 不能把 project 记忆更正成全局", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_USER_SCOPE, PROJECT_A],
		});
		try {
			const written = await store.write(PROJECT_A, {
				action: "remember",
				content: "项目专属约定",
				kind: "convention",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
			});
			await expect(
				store.write(FIXTURE_USER_SCOPE, {
					action: "correct",
					memoryId: written.memoryId,
					expectedRevision: 1,
					content: "被提升为全局的约定",
				}),
			).rejects.toMatchObject({ code: "SCOPE_NOT_ALLOWED" });
			// 合法更正保持归属：user 读不到，project 读到新值。
			await store.write(PROJECT_A, {
				action: "correct",
				memoryId: written.memoryId,
				expectedRevision: 1,
				content: "更正后的项目专属约定",
			});
			await expect(store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).resolves.toEqual([]);
			const rows = await store.read(PROJECT_A, { asOf: "2030-01-01T00:00:00Z" });
			expect(rows.map((row) => row.content)).toEqual(["更正后的项目专属约定"]);
		} finally {
			await store.close();
		}
	});

	it("词法检索跨项目不可见；授权过滤发生在候选 limit 之前", async () => {
		const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [PROJECT_A, PROJECT_B] });
		try {
			await store.write(PROJECT_A, {
				action: "remember",
				content: "alpha 项目独有的部署手册 sharedterm",
				kind: "fact",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
			});
			// B 的同名 scope 放入大量同词行：若授权在 limit 之后过滤，A 的
			// 唯一命中行会被 B 的候选挤掉——必须仍能命中。
			for (let index = 0; index < 40; index += 1) {
				await store.write(PROJECT_B, {
					action: "remember",
					content: `beta 噪声 ${index} sharedterm`,
					kind: "fact",
					scopeName: "project",
					validFrom: "2026-01-01T00:00:00Z",
				});
			}
		} finally {
			await store.close();
		}
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const inA = index.search(PROJECT_A, "部署手册", { asOf: "2030-01-01T00:00:00Z" }, 5);
			expect(inA.entries.map((entry) => entry.content)).toEqual(["alpha 项目独有的部署手册 sharedterm"]);
			const sharedInA = index.search(PROJECT_A, "sharedterm", { asOf: "2030-01-01T00:00:00Z" }, 5);
			expect(sharedInA.entries).toHaveLength(1);
			expect(sharedInA.entries[0]?.content).toContain("alpha");
			const inB = index.search(PROJECT_B, "部署手册", { asOf: "2030-01-01T00:00:00Z" }, 5);
			expect(inB.entries).toEqual([]);
		} finally {
			index.close();
		}
	});

	it("旧行（空身份）明确隔离：不进入任何具名 scope 的读写结果", async () => {
		// 用 v1 形状直接落一行旧数据（模拟升级前的库），再走 v2 打开。
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (
			path: string,
		) => {
			exec: (sql: string) => void;
			prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
			close: () => void;
			pragma: (statement: string) => unknown;
		};
		const raw = new Database(databasePath);
		try {
			raw.pragma("journal_mode = WAL");
			raw.exec("CREATE TABLE memory_schema_version (version INTEGER NOT NULL)");
			raw.exec("INSERT INTO memory_schema_version (version) VALUES (1)");
			raw.exec(
				"CREATE TABLE memory_revisions (memory_id TEXT NOT NULL, revision_no INTEGER NOT NULL, revision_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, scope_name TEXT NOT NULL, visibility TEXT, status TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT NOT NULL DEFAULT '', recorded_at TEXT NOT NULL, supersedes TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at_ms INTEGER NOT NULL, PRIMARY KEY (memory_id, revision_no))",
			);
			raw.exec(
				"CREATE TABLE memory_sources (source_id TEXT NOT NULL, memory_id TEXT NOT NULL, revision_no INTEGER NOT NULL, role TEXT NOT NULL, content_hash TEXT, retains_excerpt INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (source_id, memory_id, revision_no))",
			);
			raw.exec(
				"CREATE TABLE memory_erasure (id INTEGER PRIMARY KEY CHECK (id = 1), erasure_epoch INTEGER NOT NULL)",
			);
			raw.exec("INSERT INTO memory_erasure (id, erasure_epoch) VALUES (1, 0)");
			raw.exec("CREATE TABLE memory_suppressed (memory_id TEXT PRIMARY KEY, suppressed_at_ms INTEGER NOT NULL)");
			raw.prepare(
				"INSERT INTO memory_revisions (memory_id, revision_no, revision_id, kind, content, scope_name, status, valid_from, valid_to, recorded_at, supersedes, evidence, pinned, created_at_ms) VALUES ('mem-legacy-1', 1, 'rev-legacy-1', 'fact', '旧库遗留事实', 'project', 'active', '2020-01-01T00:00:00Z', '', '2020-01-01T00:00:00Z', '', 'claimed', 0, 0)",
			).run();
		} finally {
			raw.close();
		}
		// v2 迁移补空身份列后：user/project 任何具名 scope 都读不到旧行。
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_USER_SCOPE, PROJECT_A, PROJECT_B],
		});
		try {
			expect(store.schemaVersion).toBe(2);
			await expect(store.read(PROJECT_A, { asOf: "2030-01-01T00:00:00Z" })).resolves.toEqual([]);
			await expect(store.read(PROJECT_B, { asOf: "2030-01-01T00:00:00Z" })).resolves.toEqual([]);
			await expect(store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).resolves.toEqual([]);
			await expect(store.listRevisions("mem-legacy-1", PROJECT_A)).resolves.toEqual([]);
		} finally {
			await store.close();
		}
	});

	it("向量检索同样按完整身份隔离（不同 projectId 不互见）", async () => {
		// 向量行派生自事实行（检索 JOIN 事实表取内容/时间），先落一条 A 项目事实。
		const factStore = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [PROJECT_A] });
		let memoryId = "";
		try {
			const written = await factStore.write(PROJECT_A, {
				action: "remember",
				content: "向量隔离事实",
				kind: "fact",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
			});
			memoryId = written.memoryId;
		} finally {
			await factStore.close();
		}
		const store = await VectorMemoryStore.open({ databasePath });
		try {
			const space = { modelId: "fixture-model", modelRevision: "v1", dimension: 4, normalization: "l2" as const };
			const vector = new Float32Array([1, 0, 0, 0]);
			store.put(space, {
				memoryId,
				revisionNo: 1,
				scopeName: "project",
				principalId: PROJECT_A.identity.principalId,
				projectId: PROJECT_A.identity.projectId ?? "",
				workspaceViewId: "",
				vector,
				erasureEpochSeen: 0,
			});
			expect(
				store.search(space, vector, {
					scopeName: "project",
					principalId: PROJECT_B.identity.principalId,
					projectId: PROJECT_B.identity.projectId ?? "",
					workspaceViewId: "",
					asOf: "2030-01-01T00:00:00Z",
					limit: 5,
				}),
			).toEqual([]);
			const inA = store.search(space, vector, {
				scopeName: "project",
				principalId: PROJECT_A.identity.principalId,
				projectId: PROJECT_A.identity.projectId ?? "",
				workspaceViewId: "",
				asOf: "2030-01-01T00:00:00Z",
				limit: 5,
			});
			expect(inA.map((hit) => hit.memoryId)).toEqual([memoryId]);
		} finally {
			store.close();
		}
	});
});
