// Copyright The Open Forge contributors.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArchivedSessionsFile } from "../../shared/archived-sessions.js";
import {
	archiveSession,
	forgetArchivedSessions,
	listArchivedSessions,
	onArchivedSessionsChanged,
	resetArchivedSessionsCache,
	unarchiveSession,
} from "./archived-sessions-store.js";

const roots: string[] = [];

function tempFile(): string {
	const root = mkdtempSync(join(tmpdir(), "vetta-archived-"));
	roots.push(root);
	resetArchivedSessionsCache();
	return join(root, "archived-sessions.json");
}

function onDisk(filePath: string): ReturnType<typeof parseArchivedSessionsFile> {
	return parseArchivedSessionsFile(JSON.parse(readFileSync(filePath, "utf-8")) as unknown);
}

afterEach(() => {
	resetArchivedSessionsCache();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("archived sessions store", () => {
	it("persists an archived session with its label snapshot and cwd", () => {
		const filePath = tempFile();
		const snapshot = archiveSession({ path: "/a.jsonl", label: "修复登录", cwd: "/repo" }, filePath);
		expect(snapshot.sessions).toEqual([
			{ path: "/a.jsonl", label: "修复登录", cwd: "/repo", archivedAt: expect.any(Number) },
		]);
		expect(onDisk(filePath)).toEqual(snapshot);
	});

	it("keeps sequential archive and unarchive from clobbering each other on disk", () => {
		const filePath = tempFile();
		archiveSession({ path: "/a.jsonl", label: "甲" }, filePath);
		archiveSession({ path: "/b.jsonl", label: "乙" }, filePath);
		unarchiveSession("/a.jsonl", filePath);

		const stored = onDisk(filePath);
		expect(stored.sessions.map((entry) => entry.path)).toEqual(["/b.jsonl"]);
	});

	it("persists the team identity of an archived team conversation", () => {
		const filePath = tempFile();
		const snapshot = archiveSession(
			{ path: "/team.jsonl", label: "团队任务", teamId: "team", teamSessionId: "session" },
			filePath,
		);
		expect(snapshot.sessions[0]?.team).toEqual({ teamId: "team", teamSessionId: "session" });
		expect(onDisk(filePath).sessions[0]?.team).toEqual({ teamId: "team", teamSessionId: "session" });
	});

	it("reloads the persisted snapshot after the cache is dropped", () => {
		const filePath = tempFile();
		archiveSession({ path: "/a.jsonl", label: "修复登录" }, filePath);
		resetArchivedSessionsCache();
		expect(listArchivedSessions(filePath).sessions[0]?.label).toBe("修复登录");
	});

	it("falls back to an empty snapshot when the file is corrupt", () => {
		const filePath = tempFile();
		writeFileSync(filePath, "{ not json");
		expect(listArchivedSessions(filePath)).toEqual({ sessions: [] });
	});

	it("clears the flag for every deleted session at once", () => {
		const filePath = tempFile();
		archiveSession({ path: "/a.jsonl", label: "甲" }, filePath);
		archiveSession({ path: "/b.jsonl", label: "乙" }, filePath);

		expect(forgetArchivedSessions(["/a.jsonl"], filePath).sessions.map((entry) => entry.path)).toEqual(["/b.jsonl"]);
		expect(forgetArchivedSessions(["/b.jsonl"], filePath)).toEqual({ sessions: [] });
		expect(onDisk(filePath)).toEqual({ sessions: [] });
	});

	it("notifies subscribers only when a mutation actually changed something", () => {
		const filePath = tempFile();
		const seen: number[] = [];
		const unsubscribe = onArchivedSessionsChanged((snapshot) => seen.push(snapshot.sessions.length));

		archiveSession({ path: "/a.jsonl", label: "甲" }, filePath);
		archiveSession({ path: "/a.jsonl", label: "重复归档" }, filePath);
		unarchiveSession("/ghost.jsonl", filePath);
		forgetArchivedSessions([], filePath);
		unsubscribe();
		archiveSession({ path: "/b.jsonl", label: "乙" }, filePath);

		expect(seen).toEqual([1]);
	});

	it("keeps the newest archive first even when the clock does not advance", () => {
		const filePath = tempFile();
		archiveSession({ path: "/a.jsonl", label: "先归档", archivedAt: Date.now() + 60_000 }, filePath);
		const snapshot = archiveSession({ path: "/b.jsonl", label: "后归档" }, filePath);
		expect(snapshot.sessions.map((entry) => entry.label)).toEqual(["后归档", "先归档"]);
	});
});
