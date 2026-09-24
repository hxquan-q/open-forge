import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolResultReview } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it } from "vitest";
import type { WriteToolDetails } from "../../../src/coding/index.js";
import { createWriteTool, type WritePathPolicy } from "../../../src/coding/index.js";
import { createNodeReviewSnapshotStore } from "../../../src/host/review-snapshot-store.js";

const temporaryDirectories: string[] = [];
const permissivePathPolicy: WritePathPolicy = {
	getRejectionReason: () => undefined,
};

afterEach(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
	temporaryDirectories.length = 0;
});

function createTemporaryDirectory(label: string): string {
	const directory = mkdtempSync(join(tmpdir(), `vetta-write-review-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

function runtimeRequest(input: { readonly path: string; readonly content: string }) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "write-review",
		input,
		signal: new AbortController().signal,
	};
}

function reviewOf(details: unknown): ToolResultReview {
	const review = (details as WriteToolDetails | undefined)?.review;
	expect(review).toBeDefined();
	return review!;
}

describe("write tool review snapshots", () => {
	it("emits review metadata and a restorable snapshot for a new file", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createWriteTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(runtimeRequest({ path: "notes/a.md", content: "line1\nline2\n" }));
		const review = reviewOf(result.details);
		expect(review).toMatchObject({
			relativePath: "notes/a.md",
			operation: "write",
			status: "added",
			state: "active",
			rollbackable: true,
		});
		expect(review.addedLines).toBe(2);
		expect(review.removedLines).toBe(0);

		// 审查事实不依赖工作区 git 状态：外部删文件后 hash 守卫判冲突而不是盲建。
		const outcome = await store.rollback("session-1", review.snapshotId);
		expect(outcome.kind).toBe("restored");
		expect(() => readFileSync(join(cwd, "notes/a.md"))).toThrow();
	});

	it("captures the exact before bytes for an overwrite and rolls them back", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const target = join(cwd, "config.json");
		writeFileSync(target, '{"v":1}\n');
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createWriteTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(runtimeRequest({ path: "config.json", content: '{"v":2}\n' }));
		const review = reviewOf(result.details);
		expect(review).toMatchObject({ status: "modified", addedLines: 1, removedLines: 1, rollbackable: true });

		const outcome = await store.rollback("session-1", review.snapshotId);
		expect(outcome.kind).toBe("restored");
		expect(readFileSync(target, "utf8")).toBe('{"v":1}\n');
	});

	it("conflicts instead of overwriting when the file changed after the write", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const target = join(cwd, "config.json");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createWriteTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
		});
		const result = await runtime.execute(runtimeRequest({ path: "config.json", content: "first\n" }));
		const review = reviewOf(result.details);
		writeFileSync(target, "external change\n");
		const outcome = await store.rollback("session-1", review.snapshotId);
		expect(outcome.kind).toBe("conflict");
		expect(readFileSync(target, "utf8")).toBe("external change\n");
	});

	it("keeps details undefined when no snapshot binding is injected", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const runtime = createWriteTool(cwd, { pathPolicy: permissivePathPolicy });
		const result = await runtime.execute(runtimeRequest({ path: "a.txt", content: "x" }));
		expect(result.details).toBeUndefined();
	});

	it("discards the snapshot directory when the write fails", async () => {
		const cwd = createTemporaryDirectory("cwd");
		const snapshotRoot = createTemporaryDirectory("snapshots");
		const store = createNodeReviewSnapshotStore(snapshotRoot);
		const runtime = createWriteTool(cwd, {
			pathPolicy: permissivePathPolicy,
			reviewSnapshots: { store, sessionId: "session-1" },
			operations: {
				mkdir: async () => {},
				writeFile: async () => {
					throw new Error("disk full");
				},
			},
		});
		await expect(runtime.execute(runtimeRequest({ path: "a.txt", content: "x" }))).rejects.toThrow("disk full");
		// prepare 已建目录，discard 必须连会话目录一起清干净。
		expect(readdirSync(snapshotRoot)).toHaveLength(0);
	});
});
