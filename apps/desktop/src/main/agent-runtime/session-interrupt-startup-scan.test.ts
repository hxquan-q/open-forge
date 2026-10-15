// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	type InterruptedStartupCandidate,
	readQueuedEntryCount,
	type SessionInterruptStartupScanPorts,
	scanInterruptedSessionsOnStartup,
} from "./session-interrupt-startup-scan.js";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function candidate(overrides: Partial<InterruptedStartupCandidate> = {}): InterruptedStartupCandidate {
	return {
		sessionId: "session-1",
		sessionPath: "/sessions/session-1.conversation.jsonl",
		cwd: "/workspace",
		modifiedAt: NOW - 60_000,
		...overrides,
	};
}

function ports(overrides: Partial<SessionInterruptStartupScanPorts>): SessionInterruptStartupScanPorts {
	return {
		listCandidates: async () => [],
		assessTurn: async () => "ready",
		readQueueSnapshot: async () => ({ paused: false, entries: [] }),
		nowMs: () => NOW,
		...overrides,
	};
}

describe("scanInterruptedSessionsOnStartup", () => {
	it("未闭合 Turn 的会话被报告，正常完成的会话不报", async () => {
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [
					candidate({ sessionId: "crashed", sessionPath: "/s/crashed.conversation.jsonl", name: "崩了的" }),
					candidate({ sessionId: "fine", sessionPath: "/s/fine.conversation.jsonl" }),
				],
				assessTurn: async (sessionId) => (sessionId === "crashed" ? "interrupted" : "ready"),
			}),
		);

		expect(result).toEqual([
			{
				sessionId: "crashed",
				sessionPath: "/s/crashed.conversation.jsonl",
				cwd: "/workspace",
				name: "崩了的",
				turnInterrupted: true,
				queuedCount: 0,
			},
		]);
	});

	it("Turn 已闭合但队列 sidecar 仍有待发条目的会话也被报告", async () => {
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [candidate()],
				readQueueSnapshot: async () => ({ paused: true, entries: [{ id: "q1" }, { id: "q2" }] }),
			}),
		);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ turnInterrupted: false, queuedCount: 2 });
	});

	it("超出最近窗口的旧会话不扫描：assess 不应被调用", async () => {
		let assessCalls = 0;
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [candidate({ modifiedAt: NOW - 30 * DAY })],
				assessTurn: async () => {
					assessCalls += 1;
					return "interrupted";
				},
			}),
		);

		expect(result).toEqual([]);
		expect(assessCalls).toBe(0);
	});

	it("候选超过上限时只评估 modifiedAt 最新的前 N 个", async () => {
		const assessed: string[] = [];
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				maxCandidates: 2,
				listCandidates: async () => [
					candidate({ sessionId: "oldest", modifiedAt: NOW - 3_000 }),
					candidate({ sessionId: "newest", modifiedAt: NOW - 1_000 }),
					candidate({ sessionId: "middle", modifiedAt: NOW - 2_000 }),
				],
				assessTurn: async (sessionId) => {
					assessed.push(sessionId);
					return "interrupted";
				},
			}),
		);

		expect(assessed.sort()).toEqual(["middle", "newest"]);
		expect(result.map((session) => session.sessionId)).toEqual(["newest", "middle"]);
	});

	it("单个候选评估失败/文件 unreadable 不影响其余候选", async () => {
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [
					candidate({ sessionId: "broken" }),
					candidate({ sessionId: "throws" }),
					candidate({ sessionId: "crashed" }),
				],
				assessTurn: async (sessionId) => {
					if (sessionId === "broken") return "unreadable";
					if (sessionId === "throws") throw new Error("io error");
					return "interrupted";
				},
			}),
		);

		expect(result.map((session) => session.sessionId)).toEqual(["crashed"]);
	});

	it("sidecar 读取失败按 0 条处理，不扼杀 turn 中断的报告", async () => {
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [candidate()],
				assessTurn: async () => "interrupted",
				readQueueSnapshot: async () => {
					throw new Error("sidecar corrupt");
				},
			}),
		);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ turnInterrupted: true, queuedCount: 0 });
	});

	it("Turn 闭合且队列空 → 报告为空，不打扰用户", async () => {
		const result = await scanInterruptedSessionsOnStartup(
			ports({
				listCandidates: async () => [candidate(), candidate({ sessionId: "s2" })],
			}),
		);

		expect(result).toEqual([]);
	});
});

describe("readQueuedEntryCount", () => {
	it.each([
		["标准快照", { paused: true, entries: [{ id: "a" }] }, 1],
		["空队列", { paused: false, entries: [] }, 0],
		["缺 entries 字段", { paused: true }, 0],
		["entries 非数组", { entries: "junk" }, 0],
		["非对象", "junk", 0],
		["null", null, 0],
	])("%s → %d", (_name, snapshot, expected) => {
		expect(readQueuedEntryCount(snapshot)).toBe(expected);
	});
});
