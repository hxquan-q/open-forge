// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import type { SubagentTask } from "./subagents-atoms";
import { MAX_SUBAGENT_SESSIONS, rememberSubagentsForSession } from "./subagents-atoms";

function task(id: string, finalText = "done"): SubagentTask {
	return {
		id,
		taskName: id,
		path: `C:/subagents/${id}`,
		agentType: "general",
		status: "completed",
		task: "Do the thing",
		parentSessionId: "parent",
		startedAt: 1,
		finalText,
		generation: 1,
	};
}

describe("rememberSubagentsForSession 有界写入", () => {
	it("超过 128 会话时淘汰最旧会话的快照", () => {
		let map = new Map<string, SubagentTask[]>();
		for (let index = 0; index <= MAX_SUBAGENT_SESSIONS; index += 1) {
			map = rememberSubagentsForSession(map, `session-${index}`, [task(`t-${index}`)]);
		}
		expect(map.size).toBe(MAX_SUBAGENT_SESSIONS);
		expect(map.has("session-0")).toBe(false);
		expect(map.get(`session-${MAX_SUBAGENT_SESSIONS}`)?.[0]?.id).toBe(`t-${MAX_SUBAGENT_SESSIONS}`);
	});

	it("重写同一会话刷新新近度，不被后续淘汰", () => {
		let map = new Map<string, SubagentTask[]>();
		for (let index = 0; index < MAX_SUBAGENT_SESSIONS; index += 1) {
			map = rememberSubagentsForSession(map, `session-${index}`, [task(`t-${index}`)]);
		}
		map = rememberSubagentsForSession(map, "session-0", [task("t-0-refreshed")]);
		map = rememberSubagentsForSession(map, "session-new", [task("t-new")]);
		expect(map.size).toBe(MAX_SUBAGENT_SESSIONS);
		expect(map.has("session-0")).toBe(true);
		expect(map.get("session-0")?.[0]?.id).toBe("t-0-refreshed");
		expect(map.has("session-1")).toBe(false);
	});

	it("空快照删除该会话键，键不存在时返回原引用", () => {
		const map = rememberSubagentsForSession(new Map(), "session-a", [task("t-a")]);
		const emptied = rememberSubagentsForSession(map, "session-a", []);
		expect(emptied.has("session-a")).toBe(false);
		expect(rememberSubagentsForSession(emptied, "session-a", [])).toBe(emptied);
	});
});
