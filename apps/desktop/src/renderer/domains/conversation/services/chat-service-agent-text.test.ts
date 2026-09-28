// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	agentTextMatchesBlocks,
	joinAgentTextBlocks,
	resolveConversationAgentText,
} from "../../../shared/conversation";
import { appendTextDelta, fullHistoryToChat, historyToChat } from "./chat-service";

const TEST_USAGE = {
	input: 1,
	output: 1,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 2,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("assistant history text derivation", () => {
	it("keeps history replay text derived from blocks instead of duplicating storage", () => {
		const messages = historyToChat([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: [{ type: "text", text: "working" }] },
			{ role: "assistant", content: [{ type: "text", text: "done" }] },
		]);
		const agent = messages[1];
		expect(agent?.kind).toBe("agent");
		if (agent?.kind !== "agent") return;
		// 历史回放只保留 blocks：正文由 blocks 派生，不再驻留第二份整段字符串。
		expect(agent.text).toBeUndefined();
		expect(resolveConversationAgentText(agent)).toBe("working\ndone");
		expect(agentTextMatchesBlocks(agent)).toBe(true);
	});

	it("derives multi-part assistant turns exactly like the blocks join", () => {
		const messages = fullHistoryToChat([
			{
				type: "message",
				entryId: "assistant-1",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "part A" },
						{ type: "text", text: "part B" },
					],
					api: "openai-responses",
					provider: "openai",
					model: "test",
					usage: TEST_USAGE,
					stopReason: "stop",
					timestamp: 2,
				},
			},
		]);
		const agent = messages[0];
		expect(agent?.kind).toBe("agent");
		if (agent?.kind !== "agent") return;
		// 预拼文本会把同一条消息内的多个 text part 直接相连（"part Apart B"），
		// 与 blocks 派生值分叉；派生路径必须与 joinAgentTextBlocks 逐字一致。
		expect(joinAgentTextBlocks(agent.blocks)).toBe("part A\npart B");
		expect(resolveConversationAgentText(agent)).toBe("part A\npart B");
		expect(agent.text).toBeUndefined();
		expect(agentTextMatchesBlocks(agent)).toBe(true);
	});

	it("falls back to the provider error text only when blocks carry no plain text", () => {
		const messages = fullHistoryToChat([
			{
				type: "message",
				entryId: "assistant-1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "partial answer" }],
					api: "openai-responses",
					provider: "openai",
					model: "test",
					usage: TEST_USAGE,
					stopReason: "error",
					errorMessage: "provider 404",
					timestamp: 2,
				},
			},
			{ type: "message", entryId: "user-1", message: { role: "user", content: "retry", timestamp: 3 } },
			{
				type: "message",
				entryId: "assistant-2",
				message: {
					role: "assistant",
					content: [],
					api: "openai-responses",
					provider: "openai",
					model: "test",
					usage: TEST_USAGE,
					stopReason: "error",
					errorMessage: "provider 500",
					timestamp: 4,
				},
			},
		]);
		const withText = messages[0];
		const errorOnly = messages[2];
		expect(withText?.kind).toBe("agent");
		expect(errorOnly?.kind).toBe("agent");
		if (withText?.kind !== "agent" || errorOnly?.kind !== "agent") return;
		// 有正文时错误文本不再顶替派生值；只有没有任何正文时才用错误消息兜底。
		expect(withText.text).toBeUndefined();
		expect(resolveConversationAgentText(withText)).toBe("partial answer");
		expect(errorOnly.text).toBe("provider 500");
		expect(resolveConversationAgentText(errorOnly)).toBe("provider 500");
	});

	it("matches fullHistoryToChat export text with block joins", () => {
		const messages = fullHistoryToChat([
			{ type: "message", entryId: "user-1", message: { role: "user", content: "hello", timestamp: 1 } },
			{
				type: "message",
				entryId: "assistant-1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "alpha" }],
					api: "openai-responses",
					provider: "openai",
					model: "test",
					usage: {
						input: 1,
						output: 1,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 2,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: 2,
				},
			},
		]);
		const agent = messages[1];
		expect(agent?.kind).toBe("agent");
		if (agent?.kind !== "agent") return;
		expect(agent.text).toBeUndefined();
		expect(resolveConversationAgentText(agent)).toBe("alpha");
	});

	it("preserves live streaming incremental text storage", () => {
		const user = {
			kind: "user" as const,
			role: "user" as const,
			id: "u1",
			turnId: "t1",
			authorId: "user",
			deliveryPhase: "completed" as const,
			text: "hi",
		};
		const streamed = appendTextDelta([user], "hel");
		const agent = streamed[1];
		expect(agent?.kind).toBe("agent");
		if (agent?.kind !== "agent") return;
		expect(agent.text).toBe("hel");
		expect(joinAgentTextBlocks(agent.blocks)).toBe("hel");
	});
});
