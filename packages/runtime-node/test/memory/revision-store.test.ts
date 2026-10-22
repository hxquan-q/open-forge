// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryContractError, type MemoryRevision } from "@vetta/runtime-memory";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import {
	MEMORY_SCHEMA_VERSION,
	MEMORY_STORE_ERROR_CODES,
	type SqliteMemoryStoreOptions,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0371 合同测试：真实临时 SQLite 库 + 真实 worker_threads。
 * 覆盖：修订链与来源、并发更正冲突、作用域授权、遗忘屏障、重启一致性、
 * 备份恢复、schema 版本拒绝与初始化失败回收。
 */

let workDir: string;
let databasePath: string;

async function openStore(overrides: Partial<SqliteMemoryStoreOptions> = {}) {
	return await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
		...overrides,
	});
}

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-memory-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后，留系统临时目录回收 */
	}
});

describe("SQLite 事实修订存储（真实 worker + 临时库）", () => {
	it("remember→read→sources：内容/时间/来源一致", async () => {
		const store = await openStore();
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "项目 A 使用 pnpm workspace",
				kind: "convention",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
				sources: [
					{
						sourceId: "session/s1/turn/1/entry/2",
						role: "user-input",
						contentHash: "hash-1",
						retainsExcerpt: false,
					},
				],
			});
			expect(written.status).toBe("saved");
			expect(written.revision).toBe(1);

			const effective = await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2026-06-01T00:00:00Z" });
			expect(effective).toHaveLength(1);
			const revision = effective[0] as MemoryRevision;
			expect(revision.memoryId).toBe(written.memoryId);
			expect(revision.content).toBe("项目 A 使用 pnpm workspace");
			expect(revision.validFrom).toBe("2026-01-01T00:00:00Z");
			expect(revision.evidence).toBe("claimed");

			const sources = await store.listSources(written.memoryId, FIXTURE_PROJECT_SCOPE);
			expect(sources).toEqual([
				{ sourceId: "session/s1/turn/1/entry/2", role: "user-input", contentHash: "hash-1", retainsExcerpt: false },
			]);
		} finally {
			await store.close();
		}
	});

	it("并发更正：两个连接竞争，仅合法版本提交，另一方 REVISION_CONFLICT", async () => {
		const storeA = await openStore();
		const storeB = await openStore();
		try {
			const written = await storeA.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "初始事实",
				kind: "fact",
				scopeName: "project",
			});
			const winner = await storeA.write(FIXTURE_PROJECT_SCOPE, {
				action: "correct",
				memoryId: written.memoryId,
				expectedRevision: 1,
				content: "窗口A的更正",
			});
			expect(winner.revision).toBe(2);
			await expect(
				storeB.write(FIXTURE_PROJECT_SCOPE, {
					action: "correct",
					memoryId: written.memoryId,
					expectedRevision: 1,
					content: "窗口B的更正",
				}),
			).rejects.toMatchObject({ code: "REVISION_CONFLICT" });

			const revisions = await storeB.listRevisions(written.memoryId, FIXTURE_PROJECT_SCOPE);
			expect(revisions).toHaveLength(2);
			expect(revisions[1]?.content).toBe("窗口A的更正");
		} finally {
			await storeA.close();
			await storeB.close();
		}
	});

	it("correct 关闭旧区间：历史 asOf 读旧值，当前 asOf 读新值", async () => {
		const store = await openStore();
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "旧约定",
				kind: "convention",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			const corrected = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "correct",
				memoryId: written.memoryId,
				expectedRevision: 1,
				content: "新约定",
			});
			expect(corrected.revision).toBe(2);

			const before = await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2026-01-02T00:00:00Z" });
			const after = await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
			expect(before.map((revision) => revision.content)).toEqual(["旧约定"]);
			expect(after.map((revision) => revision.content)).toEqual(["新约定"]);
		} finally {
			await store.close();
		}
	});

	it("遗忘：家族内容与来源清除，旧来源不可重写，listRevisions 为空", async () => {
		const store = await openStore();
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "将被遗忘",
				kind: "fact",
				scopeName: "project",
				sources: [{ sourceId: "session/s2/turn/1/entry/1", role: "user-input" }],
			});
			await store.write(FIXTURE_PROJECT_SCOPE, { action: "forget", memoryId: written.memoryId });

			expect(await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).toEqual([]);
			expect(await store.listRevisions(written.memoryId, FIXTURE_PROJECT_SCOPE)).toEqual([]);
			expect(await store.listSources(written.memoryId, FIXTURE_PROJECT_SCOPE)).toEqual([]);
			await expect(
				store.write(FIXTURE_PROJECT_SCOPE, {
					action: "correct",
					memoryId: written.memoryId,
					expectedRevision: 1,
					content: "复活尝试",
				}),
			).rejects.toMatchObject({ code: "MEMORY_SUPPRESSED" });
		} finally {
			await store.close();
		}
	});

	it("未授权作用域：read/write 均拒绝 SCOPE_NOT_ALLOWED", async () => {
		const store = await openStore();
		try {
			const foreignScope = {
				name: "user" as const,
				identity: { principalId: "principal-other" },
			};
			await expect(store.read(foreignScope, { asOf: "2026-06-01T00:00:00Z" })).rejects.toMatchObject({
				code: "SCOPE_NOT_ALLOWED",
			});
			await expect(
				store.write(foreignScope, { action: "remember", content: "x", kind: "fact", scopeName: "user" }),
			).rejects.toMatchObject({ code: "SCOPE_NOT_ALLOWED" });
		} finally {
			await store.close();
		}
	});

	it("重启一致性：关闭后重开，内容/时间/来源一致；备份可恢复", async () => {
		{
			const store = await openStore();
			await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "跨重启事实",
				kind: "fact",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
				sources: [{ sourceId: "session/s3/turn/1/entry/1", role: "user-input", contentHash: "h" }],
			});
			await store.backup(join(workDir, "backup.sqlite"));
			await store.close();
		}
		{
			const store = await openStore();
			try {
				const effective = await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2026-06-01T00:00:00Z" });
				expect(effective.map((revision) => revision.content)).toEqual(["跨重启事实"]);
				expect(effective[0]?.validFrom).toBe("2026-01-01T00:00:00Z");
			} finally {
				await store.close();
			}
		}
		{
			const store = await SqliteMemoryWorkerStore.open({
				databasePath: join(workDir, "backup.sqlite"),
				allowedScopes: [FIXTURE_PROJECT_SCOPE],
			});
			try {
				const restored = await store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2026-06-01T00:00:00Z" });
				expect(restored.map((revision) => revision.content)).toEqual(["跨重启事实"]);
			} finally {
				await store.close();
			}
		}
	});

	it("schema 版本高于实现：拒绝打开且不重建空库", async () => {
		{
			const store = await openStore();
			await store.close();
		}
		// 直接用驱动把版本表抬到未来版本，模拟“旧客户端遇新库”。
		const { createRequire } = await import("node:module");
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (
			path: string,
		) => {
			prepare: (sql: string) => { run: (...args: unknown[]) => unknown; get: () => unknown };
			close: () => void;
		};
		const raw = new Database(databasePath);
		raw.prepare("INSERT INTO memory_schema_version (version) VALUES (999)").run();
		raw.close();

		try {
			await openStore();
			expect.unreachable("应当抛 SCHEMA_INCOMPATIBLE");
		} catch (error) {
			expect(error).toBeInstanceOf(MemoryContractError);
			expect((error as MemoryContractError).code).toBe(MEMORY_STORE_ERROR_CODES.SCHEMA_INCOMPATIBLE);
		}
		// 原库未被破坏：版本记录仍在。
		const verify = new Database(databasePath);
		const versions = verify.prepare("SELECT COUNT(*) AS n FROM memory_schema_version").get() as { n: number };
		verify.close();
		expect(versions.n).toBeGreaterThanOrEqual(2);
	});

	it("open 报告 schema/sqlite 版本；实现声明与迁移清单一致", async () => {
		const store = await openStore();
		try {
			expect(store.schemaVersion).toBe(MEMORY_SCHEMA_VERSION);
			expect(store.sqliteVersion).toMatch(/^\d+\.\d+\.\d+$/);
		} finally {
			await store.close();
		}
	});
});
