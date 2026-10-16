// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { describe, expect, it } from "vitest";
import {
	agentNameOfSession,
	applyStreamEvent,
	formatSessionTime,
	sortSessionsByRecency,
	toChatMessages,
	type WeKnoraChatMessage,
} from "./atoms";

const REQUEST_ID = "r1";

function streamingAssistant(): WeKnoraChatMessage[] {
	return [{ id: "a1", role: "assistant", text: "", thinking: "", status: "streaming" }];
}

function apply(messages: WeKnoraChatMessage[], event: WeKnoraStreamEvent): WeKnoraChatMessage[] {
	return applyStreamEvent(messages, event, REQUEST_ID);
}

describe("applyStreamEvent · AC-25 思考/回答分区", () => {
	it("流式期间 delta 即时累积到 text（不缓冲）", () => {
		const after = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "进行中" });
		expect(after[0]?.text).toBe("进行中");
		expect(after[0]?.thinking).toBe("");
	});

	it("answer.promoted：尾段留作正式回答，前缀切到 thinking", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "旁白。" });
		messages = apply(messages, { type: "answer.delta", requestId: REQUEST_ID, text: "正式回答" });
		messages = apply(messages, {
			type: "answer.promoted",
			requestId: REQUEST_ID,
			promotedLength: "正式回答".length,
		});
		expect(messages[0]?.thinking).toBe("旁白。");
		expect(messages[0]?.text).toBe("正式回答");
	});

	it("未调工具的直答：promotedLength = 全文 → thinking 为空", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "直答" });
		messages = apply(messages, { type: "answer.promoted", requestId: REQUEST_ID, promotedLength: 2 });
		expect(messages[0]?.thinking).toBe("");
		expect(messages[0]?.text).toBe("直答");
	});

	it("整段都是旁白（promotedLength = 0）→ 全部归 thinking", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "只是旁白。" });
		messages = apply(messages, { type: "answer.promoted", requestId: REQUEST_ID, promotedLength: 0 });
		expect(messages[0]?.thinking).toBe("只是旁白。");
		expect(messages[0]?.text).toBe("");
	});

	it("requestId 不匹配的 promoted 被丢弃，不串台", () => {
		const messages = apply(streamingAssistant(), { type: "answer.promoted", requestId: "other", promotedLength: 0 });
		expect(messages[0]?.thinking).toBe("");
	});
});

const AGENTS: WeKnoraAgent[] = [
	{ id: "A", name: "客服一号" },
	{ id: "B", name: "客服二号" },
];

describe("历史会话工具 · AC-13 / AC-14 / AC-20", () => {
	it("agentNameOfSession：agent_id 能映射 → 返回 agent 名", () => {
		const session: WeKnoraSession = { id: "s1", last_request_state: { agent_id: "A" } };
		expect(agentNameOfSession(AGENTS, session)).toBe("客服一号");
	});

	it("agentNameOfSession：agent_id 映射不到 → 返回 null（不崩溃）", () => {
		const session: WeKnoraSession = { id: "s1", last_request_state: { agent_id: "ghost" } };
		expect(agentNameOfSession(AGENTS, session)).toBeNull();
	});

	it("agentNameOfSession：last_request_state 整个缺失 → 返回 null（不崩溃）", () => {
		expect(agentNameOfSession(AGENTS, { id: "s1" })).toBeNull();
	});

	it("agentNameOfSession：agent_id 非字符串 → 返回 null（不崩溃）", () => {
		const session: WeKnoraSession = { id: "s1", last_request_state: { agent_id: undefined } };
		expect(agentNameOfSession(AGENTS, session)).toBeNull();
	});

	it("toChatMessages：保留 user/assistant、跳过 system，顺序不变", () => {
		const loaded: WeKnoraMessage[] = [
			{ id: "m1", role: "system", content: "系统提示" },
			{ id: "m2", role: "user", content: "提问" },
			{ id: "m3", role: "assistant", content: "回答" },
		];
		expect(toChatMessages(loaded)).toEqual([
			{ id: "m2", role: "user", text: "提问", thinking: "", status: "complete" },
			{ id: "m3", role: "assistant", text: "回答", thinking: "", status: "complete" },
		]);
	});

	it("sortSessionsByRecency：按 updated_at 倒序", () => {
		const sessions: WeKnoraSession[] = [
			{ id: "old", updated_at: "2026-01-01T00:00:00.000Z" },
			{ id: "new", updated_at: "2026-02-01T00:00:00.000Z" },
		];
		expect(sortSessionsByRecency(sessions).map((session) => session.id)).toEqual(["new", "old"]);
	});

	it("sortSessionsByRecency：时间缺失时保持相对顺序（稳定排序）", () => {
		const sessions: WeKnoraSession[] = [{ id: "x" }, { id: "y" }];
		expect(sortSessionsByRecency(sessions).map((session) => session.id)).toEqual(["x", "y"]);
	});

	it("formatSessionTime：固定 YYYY-MM-DD HH:mm；缺失 / 非法返回空串", () => {
		expect(formatSessionTime("2026-10-16T09:30:00")).toBe("2026-10-16 09:30");
		expect(formatSessionTime(undefined)).toBe("");
		expect(formatSessionTime("not-a-date")).toBe("");
	});
});
