import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { REVIEW_SNAPSHOT_MAX_BYTES } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeReviewSnapshotStore } from "../../src/host/review-snapshot-store.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
	temporaryDirectories.length = 0;
});

function createTemporaryDirectory(label: string): string {
	const directory = mkdtempSync(join(tmpdir(), `vetta-review-store-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

async function captureSnapshot(
	root: string,
	input: {
		readonly sessionId?: string;
		readonly snapshotId?: string;
		readonly target: string;
		readonly before?: string;
	},
	after: { readonly status?: "added" | "modified" | "deleted"; readonly content?: string } = {},
) {
	const store = createNodeReviewSnapshotStore(root);
	const sessionId = input.sessionId ?? "session-1";
	const snapshotId = input.snapshotId ?? "snap-1";
	const prepared = await store.prepare({
		sessionId,
		snapshotId,
		path: "file.txt",
		absolutePath: input.target,
		operation: "write",
		...(input.before !== undefined ? { before: Buffer.from(input.before, "utf8") } : {}),
	});
	const meta = await store.finalize(prepared, {
		status: after.status ?? (input.before === undefined ? "added" : "modified"),
		...(after.content !== undefined ? { after: Buffer.from(after.content, "utf8") } : {}),
		addedLines: 1,
		removedLines: 0,
	});
	return { store, meta, sessionId, snapshotId };
}

describe("NodeReviewSnapshotStore", () => {
	it("persists before bytes and meta under session-scoped directories", async () => {
		const root = createTemporaryDirectory("root");
		const target = join(createTemporaryDirectory("ws"), "file.txt");
		const { meta } = await captureSnapshot(root, { target, before: "old content" }, { content: "new content" });
		expect(meta).toMatchObject({
			sessionId: "session-1",
			snapshotId: "snap-1",
			beforeExists: true,
			afterExists: true,
			reversible: true,
			state: "active",
		});
		const sessionDirs = readdirSync(root);
		expect(sessionDirs).toHaveLength(1);
		const snapshotDirs = readdirSync(join(root, sessionDirs[0]!));
		expect(snapshotDirs).toHaveLength(1);
		expect(readFileSync(join(root, sessionDirs[0]!, snapshotDirs[0]!, "before"), "utf8")).toBe("old content");
	});

	it("restores the exact before bytes when the current file matches the after hash", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		writeFileSync(target, "new content");
		const { store, sessionId, snapshotId } = await captureSnapshot(
			root,
			{ target, before: "old content" },
			{ content: "new content" },
		);
		const outcome = await store.rollback(sessionId, snapshotId);
		expect(outcome).toEqual({ kind: "restored", path: "file.txt" });
		expect(readFileSync(target, "utf8")).toBe("old content");
	});

	it("removes a file the tool created when rolling back", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "created.txt");
		writeFileSync(target, "created content");
		const { store, sessionId, snapshotId } = await captureSnapshot(root, { target }, { content: "created content" });
		const outcome = await store.rollback(sessionId, snapshotId);
		expect(outcome).toEqual({ kind: "restored", path: "file.txt" });
		expect(() => readFileSync(target)).toThrow();
	});

	it("refuses to overwrite a file modified externally after the tool ran", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		const { store, sessionId, snapshotId } = await captureSnapshot(
			root,
			{ target, before: "old content" },
			{ content: "new content" },
		);
		writeFileSync(target, "external edit");
		const outcome = await store.rollback(sessionId, snapshotId);
		expect(outcome).toEqual({ kind: "conflict", path: "file.txt" });
		expect(readFileSync(target, "utf8")).toBe("external edit");
	});

	it("refuses to recreate a file deleted externally after the tool ran", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		const { store, sessionId, snapshotId } = await captureSnapshot(
			root,
			{ target, before: "old content" },
			{ content: "new content" },
		);
		writeFileSync(target, "new content");
		rmSync(target);
		const outcome = await store.rollback(sessionId, snapshotId);
		expect(outcome).toEqual({ kind: "conflict", path: "file.txt" });
		expect(() => readFileSync(target)).toThrow();
	});

	it("reports already-rolled-back on a second rollback attempt", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		writeFileSync(target, "new content");
		const { store, sessionId, snapshotId } = await captureSnapshot(
			root,
			{ target, before: "old content" },
			{ content: "new content" },
		);
		expect((await store.rollback(sessionId, snapshotId)).kind).toBe("restored");
		expect(await store.rollback(sessionId, snapshotId)).toEqual({ kind: "already-rolled-back", path: "file.txt" });
	});

	it("marks oversized before snapshots non-reversible and keeps metadata", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		writeFileSync(target, "new content");
		const oversized = Buffer.alloc(REVIEW_SNAPSHOT_MAX_BYTES + 1, 0x61);
		const store = createNodeReviewSnapshotStore(root);
		const prepared = await store.prepare({
			sessionId: "session-1",
			snapshotId: "snap-big",
			path: "file.txt",
			absolutePath: target,
			operation: "edit",
			before: oversized,
		});
		const meta = await store.finalize(prepared, {
			status: "modified",
			after: Buffer.from("new content", "utf8"),
			addedLines: 0,
			removedLines: 0,
		});
		expect(meta.reversible).toBe(false);
		expect(await store.rollback("session-1", "snap-big")).toEqual({ kind: "unavailable" });
		expect(readFileSync(target, "utf8")).toBe("new content");
	});

	it("returns unavailable for unknown snapshots and tolerates corrupt meta", async () => {
		const root = createTemporaryDirectory("root");
		const store = createNodeReviewSnapshotStore(root);
		expect(await store.rollback("session-1", "missing")).toEqual({ kind: "unavailable" });
		const { meta, sessionId } = await captureSnapshot(root, {
			target: join(createTemporaryDirectory("ws"), "file.txt"),
			before: "x",
		});
		const sessionDir = readdirSync(root)[0]!;
		const snapshotDir = join(root, sessionDir, readdirSync(join(root, sessionDir))[0]!);
		writeFileSync(join(snapshotDir, "meta.json"), "{not json");
		expect(await store.rollback(sessionId, meta.snapshotId)).toEqual({ kind: "unavailable" });
	});

	it("discards prepared snapshots without leaving directories", async () => {
		const root = createTemporaryDirectory("root");
		const store = createNodeReviewSnapshotStore(root);
		const prepared = await store.prepare({
			sessionId: "session-1",
			snapshotId: "snap-drop",
			path: "file.txt",
			absolutePath: join(createTemporaryDirectory("ws"), "file.txt"),
			operation: "write",
			before: Buffer.from("old", "utf8"),
		});
		await store.discard(prepared);
		// 最后一个快照被丢弃时会话目录一并收掉，root 恢复为空。
		expect(readdirSync(root)).toHaveLength(0);
	});

	it("cleans a whole session without touching other sessions", async () => {
		const root = createTemporaryDirectory("root");
		await captureSnapshot(root, { sessionId: "session-1", target: join(createTemporaryDirectory("ws"), "a.txt") });
		const other = await captureSnapshot(root, {
			sessionId: "session-2",
			target: join(createTemporaryDirectory("ws"), "b.txt"),
		});
		const store = createNodeReviewSnapshotStore(root);
		await store.deleteSessionArtifacts("session-1");
		expect(readdirSync(root)).toHaveLength(1);
		const loaded = await store.load(other.sessionId, other.snapshotId);
		expect(loaded?.meta.snapshotId).toBe(other.snapshotId);
	});

	it("never lets hostile session or snapshot ids escape the root", async () => {
		const root = createTemporaryDirectory("root");
		const workspace = createTemporaryDirectory("ws");
		const target = join(workspace, "file.txt");
		writeFileSync(target, "content");
		const store = createNodeReviewSnapshotStore(root);
		const prepared = await store.prepare({
			sessionId: "../../escape",
			snapshotId: "../escape2",
			path: "file.txt",
			absolutePath: target,
			operation: "write",
		});
		await store.finalize(prepared, {
			status: "added",
			after: Buffer.from("content", "utf8"),
			addedLines: 0,
			removedLines: 0,
		});
		// 清洗后的段名是单个目录字面量：不含分隔符，也不可能等于 "." / ".."。
		const sessionEntries = readdirSync(root);
		expect(sessionEntries.length).toBeGreaterThan(0);
		for (const entry of sessionEntries) {
			expect(entry).not.toBe(".");
			expect(entry).not.toBe("..");
			expect(entry.includes("/") || entry.includes("\\")).toBe(false);
			expect(resolve(join(root, entry)).startsWith(root)).toBe(true);
		}
		// root 之外不产生任何文件；敌意 id 仍能按原值取回快照。
		expect(readdirSync(workspace)).toEqual(["file.txt"]);
		const loaded = await store.load("../../escape", "../escape2");
		expect(loaded?.meta.snapshotId).toBe("../escape2");
	});
});
