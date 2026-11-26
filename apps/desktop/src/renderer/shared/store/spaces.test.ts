// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	assignSpace,
	forgetSpace,
	INITIAL_SPACES,
	isSpaceEmoji,
	MAIN_SPACE,
	readSpaces,
	reorderSpace,
	type SpaceState,
	selectSpace,
	spaceOf,
} from "./spaces";

const workSpace = { id: "work", name: "Work", icon: { kind: "solar" as const, value: "code" as const } };
const designSpace = { id: "design", name: "Design", icon: { kind: "solar" as const, value: "palette" as const } };

function stateWith(overrides: Partial<SpaceState>): SpaceState {
	return { ...INITIAL_SPACES, spaces: [workSpace, designSpace], ...overrides };
}

describe("readSpaces", () => {
	it("returns initial state for non-record values", () => {
		expect(readSpaces(null)).toEqual(INITIAL_SPACES);
		expect(readSpaces("garbage")).toEqual(INITIAL_SPACES);
		expect(readSpaces([])).toEqual(INITIAL_SPACES);
	});

	it("keeps valid spaces and drops malformed entries", () => {
		const state = readSpaces({
			spaces: [
				workSpace,
				{ id: "", name: "Empty id", icon: { kind: "solar", value: "code" } },
				{ id: "work", name: "Duplicate", icon: { kind: "solar", value: "code" } },
				{ id: MAIN_SPACE, name: "Shadow main", icon: { kind: "solar", value: "code" } },
				{ id: "badicon", name: "Bad icon", icon: { kind: "solar", value: "not-a-real-icon" } },
				{ id: "noname", name: "  ", icon: { kind: "solar", value: "code" } },
				{ id: "emoji", name: "Emoji", icon: { kind: "emoji", value: "🚀" } },
				{ id: "emoji-long", name: "Long emoji", icon: { kind: "emoji", value: "abc" } },
			],
		});
		expect(state.spaces.map((space) => space.id)).toEqual(["work", "emoji"]);
	});

	it("drops memberships and locations pointing at unknown spaces", () => {
		const state = readSpaces({
			spaces: [workSpace],
			selected: "ghost",
			projects: { "/p/a": "work", "/p/b": "ghost", "/p/c": MAIN_SPACE },
			conversations: { "/c/1.jsonl": "work", "/c/2.jsonl": "ghost" },
			locations: {
				work: { kind: "project", cwd: "/p/a" },
				ghost: { kind: "project", cwd: "/p/b" },
				invalid: { kind: "not-a-kind" },
			},
		});
		expect(state.selected).toBe(MAIN_SPACE);
		expect(state.projects).toEqual({ "/p/a": "work" });
		expect(state.conversations).toEqual({ "/c/1.jsonl": "work" });
		expect(state.locations).toEqual({ work: { kind: "project", cwd: "/p/a" } });
	});

	it("rejects team locations left over from other versions", () => {
		const state = readSpaces({
			spaces: [workSpace],
			locations: { work: { kind: "team", teamId: "t1", sessionId: "s1" } },
		});
		expect(state.locations).toEqual({});
	});
});

describe("spaceOf / assignSpace", () => {
	it("defaults items without membership to the main space", () => {
		const state = stateWith({});
		expect(spaceOf(state, { kind: "project", key: "/p/a" })).toBe(MAIN_SPACE);
	});

	it("assigns a project to a custom space and clears membership when moved back", () => {
		let state = stateWith({});
		state = assignSpace(state, { kind: "project", key: "/p/a" }, "work");
		expect(spaceOf(state, { kind: "project", key: "/p/a" })).toBe("work");
		expect(state.projects["/p/a"]).toBe("work");
		state = assignSpace(state, { kind: "project", key: "/p/a" }, MAIN_SPACE);
		expect(Object.hasOwn(state.projects, "/p/a")).toBe(false);
	});

	it("treats assignment to an unknown space as the main space", () => {
		let state = stateWith({});
		state = assignSpace(state, { kind: "conversation", key: "/c/1.jsonl" }, "ghost");
		expect(Object.hasOwn(state.conversations, "/c/1.jsonl")).toBe(false);
	});

	it("returns the same state object when nothing changes", () => {
		const state = stateWith({ projects: { "/p/a": "work" } });
		expect(assignSpace(state, { kind: "project", key: "/p/a" }, "work")).toBe(state);
	});
});

describe("selectSpace", () => {
	it("switches to an existing space and ignores unknown ids", () => {
		const state = stateWith({});
		expect(selectSpace(state, "work").selected).toBe("work");
		expect(selectSpace(state, "ghost")).toBe(state);
	});
});

describe("reorderSpace", () => {
	it("moves the source before the target position", () => {
		const state = stateWith({});
		expect(reorderSpace(state, "design", "work").spaces.map((space) => space.id)).toEqual(["design", "work"]);
		expect(reorderSpace(state, "work", "ghost")).toBe(state);
	});
});

describe("forgetSpace", () => {
	it("removes the space, its memberships and its location", () => {
		const state = stateWith({
			projects: { "/p/a": "work", "/p/b": "design" },
			conversations: { "/c/1.jsonl": "work" },
			locations: { work: { kind: "project", cwd: "/p/a" }, design: { kind: "project", cwd: "/p/b" } },
		});
		const next = forgetSpace(state, "work");
		expect(next.spaces.map((space) => space.id)).toEqual(["design"]);
		expect(next.projects).toEqual({ "/p/b": "design" });
		expect(next.conversations).toEqual({});
		expect(Object.hasOwn(next.locations, "work")).toBe(false);
	});

	it("hands the removed space's location to main when it was selected", () => {
		const state = stateWith({
			selected: "work",
			locations: { work: { kind: "project", cwd: "/p/a" } },
		});
		const next = forgetSpace(state, "work");
		expect(next.selected).toBe(MAIN_SPACE);
		expect(next.locations[MAIN_SPACE]).toEqual({ kind: "project", cwd: "/p/a" });
	});

	it("never forgets the main space", () => {
		const state = stateWith({});
		expect(forgetSpace(state, MAIN_SPACE)).toBe(state);
	});
});

describe("isSpaceEmoji", () => {
	it("accepts single emoji graphemes and rejects plain text", () => {
		expect(isSpaceEmoji("🚀")).toBe(true);
		expect(isSpaceEmoji("abc")).toBe(false);
		expect(isSpaceEmoji("🚀🚀")).toBe(false);
	});
});
