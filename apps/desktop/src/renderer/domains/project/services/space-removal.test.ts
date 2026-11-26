// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { INITIAL_SPACES } from "@shared/store/spaces";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpaceRemovalContents } from "./space-removal";
import { readSpaceRemoval, runningSpaceConversations } from "./space-removal";

function removalSession(path: string, extra: Partial<{ name: string; firstMessage: string }> = {}) {
	return {
		id: path,
		path,
		cwd: "/chat",
		firstMessage: "",
		modifiedAt: 1,
		access: { readHistory: true, resume: true, rename: true, delete: true },
		...extra,
	};
}

function contentsOf(sessions: ReturnType<typeof removalSession>[]): SpaceRemovalContents {
	return { projects: [], archived: [], sessions };
}

function installVetta({
	projects = [],
	archivedProjects = [],
	sessions = [],
	running = [],
}: {
	projects?: { path: string }[];
	archivedProjects?: { path: string }[];
	sessions?: { path: string; name?: string; firstMessage?: string }[];
	running?: string[];
}): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			config: {
				get: vi.fn(async () => ({ projects, archivedProjects })),
			},
			session: {
				listSessions: vi.fn(async () => sessions),
				listRunning: vi.fn(async () => running),
			},
		},
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("readSpaceRemoval", () => {
	it("filters registered, archived projects and standalone sessions by membership", async () => {
		installVetta({
			projects: [{ path: "/in" }, { path: "/out" }],
			archivedProjects: [{ path: "/archived-in" }, { path: "/archived-out" }],
			sessions: [{ path: "/s/in.jsonl" }, { path: "/s/out.jsonl" }],
		});
		const state = {
			...INITIAL_SPACES,
			projects: { "/in": "work", "/archived-in": "work" },
			conversations: { "/s/in.jsonl": "work" },
		};

		const contents = await readSpaceRemoval(state, "work", "/chat");
		expect(contents.projects.map(({ path }) => path)).toEqual(["/in"]);
		expect(contents.archived.map(({ path }) => path)).toEqual(["/archived-in"]);
		expect(contents.sessions.map(({ path }) => path)).toEqual(["/s/in.jsonl"]);
	});

	it("counts archived projects into the impact without treating them as registered projects", async () => {
		installVetta({
			projects: [],
			archivedProjects: [{ path: "/archived-in" }],
		});
		const state = { ...INITIAL_SPACES, projects: { "/archived-in": "work" } };

		const contents = await readSpaceRemoval(state, "work", "/chat");
		expect(contents.projects).toEqual([]);
		expect(contents.archived.map(({ path }) => path)).toEqual(["/archived-in"]);
	});

	it("lists no sessions when the default conversation cwd is not ready", async () => {
		installVetta({ sessions: [{ path: "/s/in.jsonl" }] });
		const state = { ...INITIAL_SPACES, conversations: { "/s/in.jsonl": "work" } };

		const contents = await readSpaceRemoval(state, "work", "");
		expect(contents.sessions).toEqual([]);
		expect((window.vetta.session.listSessions as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
	});

	it("treats items without membership as belonging to the main workspace", async () => {
		installVetta({
			projects: [{ path: "/unassigned" }],
			sessions: [{ path: "/s/unassigned.jsonl" }],
		});

		const contents = await readSpaceRemoval(INITIAL_SPACES, "work", "/chat");
		expect(contents.projects).toEqual([]);
		expect(contents.sessions).toEqual([]);
	});
});

describe("runningSpaceConversations", () => {
	it("returns display names of the space sessions that are still running", async () => {
		installVetta({ running: ["/s/b.jsonl"] });
		const contents = contentsOf([
			removalSession("/s/a.jsonl", { name: "Idle", firstMessage: "hello" }),
			removalSession("/s/b.jsonl", { firstMessage: "Fix the flaky test" }),
			removalSession("/s/c.jsonl"),
		]);

		// b 在跑：回落到 firstMessage；c 没在跑，即使只剩路径也不出现。
		expect(await runningSpaceConversations(contents)).toEqual(["Fix the flaky test"]);
	});

	it("falls back to the session path when nothing displayable exists", async () => {
		installVetta({ running: ["/s/raw.jsonl"] });

		expect(await runningSpaceConversations(contentsOf([removalSession("/s/raw.jsonl")]))).toEqual(["/s/raw.jsonl"]);
	});
});
