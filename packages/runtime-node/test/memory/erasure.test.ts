// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE } from "@vetta/runtime-memory/fixtures";
import { LexicalMemoryIndex, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0373 遗忘屏障合同（真实 SQLite）：全版本清除、来源抑制、epoch 推进、
 * 无正文审计、不自动恢复 parent、FTS 不复活、撤销更正与遗忘区分。
 */

let workDir: string;
let databasePath: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-erasure-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("事务性遗忘屏障", () => {
	it("全版本清除+来源抑制+epoch 推进+无正文审计；同源重写被拒", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		let memoryId = "";
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "第一版内容",
				kind: "fact",
				scopeName: "project",
				sources: [{ sourceId: "session/s1/turn/9/entry/1", role: "user-input" }],
			});
			memoryId = written.memoryId;
			await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "correct",
				memoryId,
				expectedRevision: 1,
				content: "第二版内容",
			});
		} finally {
			await store.close();
		}

		const erasure = await SqliteMemoryErasure.open({ databasePath });
		try {
			const before = erasure.readErasureState();
			const outcome = erasure.forgetMemoryFamily({ memoryId, reason: "user-forget" });
			expect(outcome.removedRevisions).toBe(2);
			expect(outcome.erasureEpoch).toBe(before.erasureEpoch + 1);
			expect(outcome.suppressedSourceIds).toEqual(["session/s1/turn/9/entry/1"]);
			expect(erasure.isSourceSuppressed("session/s1/turn/9/entry/1")).toBe(true);

			const audit = erasure.listAudit();
			expect(audit).toHaveLength(1);
			expect(JSON.stringify(audit)).not.toContain("第一版内容");
			expect(JSON.stringify(audit)).not.toContain("第二版内容");

			await expect(
				(async () => {
					const reopen = await SqliteMemoryWorkerStore.open({
						databasePath,
						allowedScopes: [FIXTURE_PROJECT_SCOPE],
					});
					try {
						return await reopen.write(FIXTURE_PROJECT_SCOPE, {
							action: "correct",
							memoryId,
							expectedRevision: 1,
							content: "复活尝试",
						});
					} finally {
						await reopen.close();
					}
				})(),
			).rejects.toMatchObject({ code: "MEMORY_SUPPRESSED" });
		} finally {
			erasure.close();
		}
	});

	it("FTS 派生索引遗忘后不复活（含重建路径）", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		let memoryId = "";
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "唯一锚点短语用于遗忘验证",
				kind: "fact",
				scopeName: "project",
			});
			memoryId = written.memoryId;
		} finally {
			await store.close();
		}
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		try {
			erasure.forgetMemoryFamily({ memoryId });
		} finally {
			erasure.close();
		}
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			index.refresh();
			const result = index.search(FIXTURE_PROJECT_SCOPE, "遗忘验证", { asOf: "2030-01-01T00:00:00Z" });
			expect(result.entries).toEqual([]);
		} finally {
			index.close();
		}
	});

	it("撤销一次更正：恢复上一版为新的显式修订，不触碰遗忘状态", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		let memoryId = "";
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "原始约定",
				kind: "convention",
				scopeName: "project",
			});
			memoryId = written.memoryId;
			await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "correct",
				memoryId,
				expectedRevision: 1,
				content: "被撤销的更正",
			});
		} finally {
			await store.close();
		}
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		try {
			const stateBefore = erasure.readErasureState();
			const undo = erasure.undoLastCorrection({ memoryId, expectedRevision: 2 });
			expect(undo.restoredContent).toBe("原始约定");
			expect(undo.restoredRevision).toBe(3);
			expect(erasure.readErasureState().erasureEpoch).toBe(stateBefore.erasureEpoch);
			expect(erasure.readErasureState().suppressedMemoryIds).not.toContain(memoryId);

			expect(() => erasure.undoLastCorrection({ memoryId, expectedRevision: 2 })).toThrowError(/expectedRevision/);
		} finally {
			erasure.close();
		}
		const verify = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		try {
			const revisions = await verify.listRevisions(memoryId, FIXTURE_PROJECT_SCOPE);
			expect(revisions).toHaveLength(3);
			const current = await verify.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
			expect(current.map((revision) => revision.content)).toEqual(["原始约定"]);
		} finally {
			await verify.close();
		}
	});

	it("派生消费者提交前 epoch 重检：落后纪元拒绝、当前纪元放行", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		let memoryId = "";
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "待遗忘锚点",
				kind: "fact",
				scopeName: "project",
			});
			memoryId = written.memoryId;
		} finally {
			await store.close();
		}
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		try {
			const seen = erasure.readErasureState().erasureEpoch;
			expect(() => erasure.assertCommitAllowed(seen)).not.toThrow();
			erasure.forgetMemoryFamily({ memoryId });
			expect(() => erasure.assertCommitAllowed(seen)).toThrowError(/erasure epoch 已前进/);
			expect(() => erasure.assertCommitAllowed(erasure.readErasureState().erasureEpoch)).not.toThrow();
		} finally {
			erasure.close();
		}
	});
});
