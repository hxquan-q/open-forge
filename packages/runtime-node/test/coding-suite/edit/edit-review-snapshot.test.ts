import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createEditTool,
	type EditPathPolicy,
	type EditToolDetails,
	type EditToolInput,
} from "../../../src/coding/index.js";
import { anchorLineHash } from "../../../src/coding/shared/anchors.js";
import { createNodeReviewSnapshotStore } from "../../../src/host/review-snapshot-store.js";

const temporaryDirectories: string[] = [];
const permissivePathPolicy: EditPathPolicy = {
	getRejectionReason: () => undefined,
};

afterEach(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
	temporaryDirectories.length = 0;
});

function createTemporaryDirectory(label: string): string {
	const directory = mkdtempSync(join(tmpdir(), `vetta-edit-review-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

function runtimeRequest(input: EditToolInput) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "edit-review",
		input,
		signal: new AbortController().signal,
	};
}

describe("edit tool review snapshots", () => {
	it("merges review metadata into the existing diff details (exact-text mode)", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const target = join(cwd, "app.ts");
		writeFileSync(target, "const a = 1;\nconst b = 2;\n");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createEditTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(
			runtimeRequest({ path: "app.ts", oldText: "const b = 2;", newText: "const b = 3;" }),
		);
		const details = result.details as EditToolDetails;
		expect(details.diff).toContain("-2 const b = 2;");
		expect(details.review).toMatchObject({
			relativePath: "app.ts",
			operation: "edit",
			status: "modified",
			state: "active",
			addedLines: 1,
			removedLines: 1,
			rollbackable: true,
		});

		// 外部 git commit / 修改后 hash 守卫判冲突；未动时还原 before 字节。
		const outcome = await store.rollback("session-1", details.review!.snapshotId);
		expect(outcome.kind).toBe("restored");
		expect(readFileSync(target, "utf8")).toBe("const a = 1;\nconst b = 2;\n");
	});

	it("captures review metadata for anchor mode edits", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const target = join(cwd, "app.ts");
		writeFileSync(target, "line one\nline two\n");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createEditTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(
			runtimeRequest({
				path: "app.ts",
				edits: [{ anchor: `2:${anchorLineHash("line two")}`, new_text: "line two updated" }],
			}),
		);
		const details = result.details as EditToolDetails;
		expect(details.review).toMatchObject({
			operation: "edit",
			status: "modified",
			rollbackable: true,
		});
		expect(details.review!.addedLines).toBeGreaterThanOrEqual(1);
		const outcome = await store.rollback("session-1", details.review!.snapshotId);
		expect(outcome.kind).toBe("restored");
		expect(readFileSync(target, "utf8")).toBe("line one\nline two\n");
	});

	it("conflicts rather than overwriting when the file changed after the edit", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const target = join(cwd, "app.ts");
		writeFileSync(target, "v1\n");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createEditTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(runtimeRequest({ path: "app.ts", oldText: "v1", newText: "v2" }));
		const details = result.details as EditToolDetails;
		writeFileSync(target, "committed elsewhere\n");
		const outcome = await store.rollback("session-1", details.review!.snapshotId);
		expect(outcome.kind).toBe("conflict");
		expect(readFileSync(target, "utf8")).toBe("committed elsewhere\n");
	});

	it("produces no review when editing fails before the write", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		writeFileSync(join(cwd, "app.ts"), "unchanged\n");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createEditTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		await expect(
			runtime.execute(runtimeRequest({ path: "app.ts", oldText: "not present", newText: "x" })),
		).rejects.toThrow("Could not find the exact text");
		expect(readFileSync(join(cwd, "app.ts"), "utf8")).toBe("unchanged\n");
	});

	it("keeps details review-free when no snapshot binding is injected", async () => {
		const cwd = createTemporaryDirectory("cwd");
		writeFileSync(join(cwd, "app.ts"), "v1\n");
		const runtime = createEditTool(cwd, { pathPolicy: permissivePathPolicy });
		const result = await runtime.execute(runtimeRequest({ path: "app.ts", oldText: "v1", newText: "v2" }));
		const details = result.details as EditToolDetails;
		expect(details.diff).toBeTruthy();
		expect(details.review).toBeUndefined();
	});
});
