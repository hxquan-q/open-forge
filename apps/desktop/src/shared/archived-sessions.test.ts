// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	ARCHIVED_SESSIONS_SCHEMA_VERSION,
	archivedSessionPaths,
	archiveSession,
	emptyArchivedSessions,
	parseArchivedSessionsFile,
	removeArchivedSessions,
	serializeArchivedSessions,
	unarchiveSession,
} from "./archived-sessions";

const A = { path: "/a.jsonl", label: "修复登录", cwd: "/repo", archivedAt: 10 };
const B = { path: "/b.jsonl", label: "重构侧栏", cwd: "/repo", archivedAt: 20 };

function withBoth(): ReturnType<typeof archiveSession> {
	return archiveSession(archiveSession(emptyArchivedSessions(), A), B);
}

describe("archived session mutations", () => {
	it("archives a session and keeps the most recently archived one first", () => {
		const snapshot = withBoth();
		expect(snapshot.sessions.map((entry) => entry.path)).toEqual(["/b.jsonl", "/a.jsonl"]);
	});

	it("ignores a repeat archive of the same path", () => {
		const once = archiveSession(emptyArchivedSessions(), A);
		expect(archiveSession(once, { ...A, label: "改名", archivedAt: 99 })).toBe(once);
	});

	it("rejects an entry without a usable path", () => {
		expect(archiveSession(emptyArchivedSessions(), { ...A, path: "   " })).toEqual({ sessions: [] });
	});

	it("unarchives only the named session and stays referentially stable otherwise", () => {
		const both = withBoth();
		expect(unarchiveSession(both, "/a.jsonl").sessions.map((entry) => entry.path)).toEqual(["/b.jsonl"]);
		expect(unarchiveSession(both, "/ghost.jsonl")).toBe(both);
		expect(unarchiveSession(both, "  ")).toBe(both);
	});

	it("forgets several paths at once for the delete-session cleanup", () => {
		const both = withBoth();
		expect(removeArchivedSessions(both, ["/a.jsonl", "/ghost.jsonl"]).sessions.map((e) => e.path)).toEqual([
			"/b.jsonl",
		]);
		expect(removeArchivedSessions(both, [])).toBe(both);
	});

	it("exposes the archived paths the sidebar filters on", () => {
		expect([...archivedSessionPaths(withBoth())].sort()).toEqual(["/a.jsonl", "/b.jsonl"]);
		expect(archivedSessionPaths(emptyArchivedSessions()).size).toBe(0);
	});
});

describe("archived session persistence shape", () => {
	it("round-trips a snapshot through serialize and parse", () => {
		const both = withBoth();
		expect(parseArchivedSessionsFile(serializeArchivedSessions(both))).toEqual(both);
	});

	it("drops corrupt entries instead of voiding the whole file", () => {
		const parsed = parseArchivedSessionsFile({
			version: ARCHIVED_SESSIONS_SCHEMA_VERSION,
			sessions: [
				A,
				{ path: "   " },
				{ path: "/unlabeled.jsonl", label: 7, cwd: null, archivedAt: Number.NaN },
				{ path: "/a.jsonl", label: "重复条目" },
				null,
				"nope",
			],
		});
		expect(parsed.sessions).toEqual([
			{ path: "/a.jsonl", label: "修复登录", cwd: "/repo", archivedAt: 10 },
			{ path: "/unlabeled.jsonl", label: "", cwd: "", archivedAt: 0 },
		]);
	});

	it("treats a foreign schema version and non-object payloads as empty", () => {
		expect(parseArchivedSessionsFile({ version: ARCHIVED_SESSIONS_SCHEMA_VERSION + 1, sessions: [A] })).toEqual({
			sessions: [],
		});
		expect(parseArchivedSessionsFile({ sessions: [A] })).toEqual({ sessions: [] });
		expect(parseArchivedSessionsFile(null)).toEqual({ sessions: [] });
		expect(parseArchivedSessionsFile([A])).toEqual({ sessions: [] });
	});
});
