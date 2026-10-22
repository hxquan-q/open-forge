// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLegacyMemoryDocument } from "@vetta/coding-agent/memory";
import { FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import {
	exportMemories,
	importLegacyEntries,
	SqliteMemoryErasure,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0378 导入/导出合同（真实 SQLite）：幂等（重复导入跳过）、
 * 已撤销来源不重生、导出仅授权 scope 且版本化。
 */

let workDir: string;
let databasePath: string;
let store: SqliteMemoryWorkerStore;
let erasure: SqliteMemoryErasure;

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-import-export-"));
	databasePath = join(workDir, "memory.sqlite");
	store = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_USER_SCOPE],
	});
	erasure = await SqliteMemoryErasure.open({ databasePath });
});

afterEach(async () => {
	erasure.close();
	await store.close();
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("legacy 导入", () => {
	it("同输入重复导入幂等：第二次全部跳过为重复", async () => {
		const document = parseLegacyMemoryDocument("Uses Bun\n---\nUses TypeScript");
		const first = await importLegacyEntries({ store, scope: FIXTURE_USER_SCOPE, entries: document.entries });
		expect(first).toEqual({ imported: 2, skippedDuplicates: 0, skippedSuppressed: 0 });
		const second = await importLegacyEntries({ store, scope: FIXTURE_USER_SCOPE, entries: document.entries });
		expect(second).toEqual({ imported: 0, skippedDuplicates: 2, skippedSuppressed: 0 });
		const memories = await store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
		expect(memories).toHaveLength(2);
		// 导入项 validFrom 显式 unknown（不猜测），来源 role=legacy-import。
		expect(memories.every((memory) => memory.validFrom === "")).toBe(true);
		const sources = await store.listSources(memories[0]?.memoryId ?? "", FIXTURE_USER_SCOPE);
		expect(sources[0]?.role).toBe("legacy-import");
	});

	it("文件变更后 hash 不同 → 不算重复（新条目导入）", async () => {
		const first = parseLegacyMemoryDocument("Uses Bun");
		await importLegacyEntries({ store, scope: FIXTURE_USER_SCOPE, entries: first.entries });
		const changed = parseLegacyMemoryDocument("Uses Bun\n---\nnew fact");
		const second = await importLegacyEntries({ store, scope: FIXTURE_USER_SCOPE, entries: changed.entries });
		expect(second.imported).toBe(2);
	});

	it("已撤销来源不因再导入重生", async () => {
		const document = parseLegacyMemoryDocument("sensitive");
		const first = await importLegacyEntries({ store, scope: FIXTURE_USER_SCOPE, entries: document.entries });
		expect(first.imported).toBe(1);
		const memories = await store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
		erasure.forgetMemoryFamily({ memoryId: memories[0]?.memoryId ?? "" });
		const again = await importLegacyEntries({
			store,
			scope: FIXTURE_USER_SCOPE,
			entries: document.entries,
			isSourceSuppressed: (sourceId) => erasure.isSourceSuppressed(sourceId),
		});
		// 来源于抑制表：再导入被拒绝 → 计入 suppressed 跳过，不重生。
		expect(again.imported).toBe(0);
		expect(again.skippedSuppressed).toBe(1);
		expect(await store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).toEqual([]);
	});
});

describe("记忆导出", () => {
	it("仅导出授权 scope 当前有效记忆；带版本与时间标记", async () => {
		await store.write(FIXTURE_USER_SCOPE, {
			action: "remember",
			content: "导出条目",
			kind: "preference",
			scopeName: "user",
		});
		const result = await exportMemories({
			store,
			scope: FIXTURE_USER_SCOPE,
			now: () => "2026-10-22T00:00:00Z",
		});
		expect(result.count).toBe(1);
		expect(result.markdown).toContain("open-forge memory export v1 exportedAt=2026-10-22T00:00:00Z");
		expect(result.markdown).toContain("导出条目");

		const forgotten = await store.write(FIXTURE_USER_SCOPE, {
			action: "remember",
			content: "已遗忘不导出",
			kind: "fact",
			scopeName: "user",
		});
		erasure.forgetMemoryFamily({ memoryId: forgotten.memoryId });
		const afterForget = await exportMemories({
			store,
			scope: FIXTURE_USER_SCOPE,
			now: () => "2026-10-22T00:00:00Z",
		});
		expect(afterForget.markdown.includes("已遗忘不导出")).toBe(false);
	});
});
