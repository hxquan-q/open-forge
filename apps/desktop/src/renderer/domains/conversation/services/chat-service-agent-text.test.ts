// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	agentTextMatchesBlocks,
	joinAgentTextBlocks,
	resolveConversationAgentText,
} from "../../../shared/conversation";
import { appendTextDelta, fullHistoryToChat, historyToChat } from "./chat-service";

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
		expect(agent.text).toBeUndefined();
		expect(resolveConversationAgentText(agent)).toBe("working\ndone");
		expect(agentTextMatchesBlocks(agent)).toBe(true);
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
