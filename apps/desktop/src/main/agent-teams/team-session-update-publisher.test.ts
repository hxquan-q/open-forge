// Copyright The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSessionUpdatePublisher } from "./team-session-update-publisher.js";

function session(id: string, revision: number): TeamSessionDocument {
	return { id, revision } as TeamSessionDocument;
}

function createHarness(overrides?: { readonly coalesceMs?: number }) {
	const published: TeamSessionDocument[] = [];
	const state = new Map<string, TeamSessionDocument>();
	const publisher = new TeamSessionUpdatePublisher({
		getSession: (sessionId) => state.get(sessionId),
		hasSubscribers: (sessionId) => subscribers.has(sessionId),
		publish: (current) => published.push(current),
		...(overrides?.coalesceMs !== undefined ? { coalesceMs: overrides.coalesceMs } : {}),
	});
	const subscribers = new Set<string>();
	return {
		published,
		state,
		subscribers,
		publisher,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("TeamSessionUpdatePublisher", () => {
	it("coalesces a burst into a single publish carrying the latest session", () => {
		const { published, state, subscribers, publisher } = createHarness();
		state.set("team-1", session("team-1", 3));
		subscribers.add("team-1");

		publisher.request(session("team-1", 1));
		publisher.request(session("team-1", 2));
		publisher.request(session("team-1", 3));
		expect(published).toHaveLength(0); // 窗口内不发布中间帧

		vi.advanceTimersByTime(32);
		expect(published).toHaveLength(1);
		// flush 取内存中的最新状态，而非请求时的中间版本。
		expect(published[0]).toMatchObject({ id: "team-1", revision: 3 });
	});

	it("keeps pending requests across windows independent per session", () => {
		const { published, state, subscribers, publisher } = createHarness();
		state.set("team-1", session("team-1", 1));
		state.set("team-2", session("team-2", 1));
		subscribers.add("team-1");
		subscribers.add("team-2");

		publisher.request(session("team-1", 1));
		vi.advanceTimersByTime(32);
		publisher.request(session("team-2", 1));
		expect(published).toHaveLength(1);

		vi.advanceTimersByTime(32);
		expect(published.map(({ id }) => id)).toEqual(["team-1", "team-2"]);
	});

	it("skips the snapshot build and publish entirely without subscribers", () => {
		const { published, state, publisher } = createHarness();
		state.set("team-1", session("team-1", 1));

		publisher.request(session("team-1", 1));
		vi.advanceTimersByTime(32);
		expect(published).toHaveLength(0);

		// 后来的订阅者由 subscribe 的初始 session-snapshot 补齐，不依赖本通道。
	});

	it("does not publish a stale snapshot after the session left memory", () => {
		const { published, state, subscribers, publisher } = createHarness();
		state.set("team-1", session("team-1", 1));
		subscribers.add("team-1");

		publisher.request(session("team-1", 1));
		// 会话在窗口内被逐出/删除且未走 drop（竞态兜底）。
		state.delete("team-1");
		vi.advanceTimersByTime(32);
		expect(published).toHaveLength(0);
	});

	it("cancels pending flushes on drop", () => {
		const { published, state, subscribers, publisher } = createHarness();
		state.set("team-1", session("team-1", 1));
		subscribers.add("team-1");

		publisher.request(session("team-1", 1));
		publisher.drop("team-1");
		vi.advanceTimersByTime(32);
		expect(published).toHaveLength(0);
	});
});
