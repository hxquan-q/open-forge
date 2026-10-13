// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { transformMessages } from "../src/providers/transform-messages.js";
import type { AssistantMessage, Message, Model, ToolResultMessage } from "../src/types.js";

const model: Model<"openai-completions"> = {
	id: "target",
	name: "Target model",
	api: "openai-completions",
	provider: "openai",
	baseUrl: "https://provider.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 10000,
	maxTokens: 1000,
};

function assistantWithToolCalls(
	ids: string[],
	stopReason: AssistantMessage["stopReason"] = "toolUse",
): AssistantMessage {
	return {
		role: "assistant",
		api: "openai-completions",
		provider: "openai",
		model: "source",
		content: ids.map((id) => ({ type: "toolCall" as const, id, name: "read", arguments: {} })),
		stopReason,
		timestamp: Date.now(),
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
}

function toolResult(id: string): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: "read",
		content: [{ type: "text", text: "done" }],
		isError: false,
		timestamp: Date.now(),
	};
}

describe("orphaned tool calls", () => {
	it("appends a synthetic result for a trailing tool call that has no result", () => {
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 1 }, assistantWithToolCalls(["call_1"])];

		const result = transformMessages(messages, model);

		expect(result).toHaveLength(3);
		const tail = result[2] as ToolResultMessage;
		expect(tail.role).toBe("toolResult");
		expect(tail.toolCallId).toBe("call_1");
		expect(tail.toolName).toBe("read");
		expect(tail.isError).toBe(true);
	});

	it("only synthesizes results for the trailing calls that lack one", () => {
		const messages: Message[] = [
			{ role: "user", content: "go", timestamp: 1 },
			assistantWithToolCalls(["call_1", "call_2"]),
			toolResult("call_1"),
		];

		const result = transformMessages(messages, model);

		const results = result.filter((message) => message.role === "toolResult") as ToolResultMessage[];
		expect(results.map((message) => message.toolCallId)).toEqual(["call_1", "call_2"]);
		expect(results[0]?.isError).toBe(false);
		expect(results[1]?.isError).toBe(true);
	});

	it("still repairs orphaned calls mid-list before a following user message", () => {
		const messages: Message[] = [
			{ role: "user", content: "go", timestamp: 1 },
			assistantWithToolCalls(["call_1"]),
			{ role: "user", content: "again", timestamp: 3 },
		];

		const result = transformMessages(messages, model);

		expect(result[1]?.role).toBe("assistant");
		expect(result[2]?.role).toBe("toolResult");
		expect(result[3]?.role).toBe("user");
	});

	it("does not synthesize results for trailing assistant messages marked aborted", () => {
		const messages: Message[] = [
			{ role: "user", content: "go", timestamp: 1 },
			assistantWithToolCalls(["call_1"], "aborted"),
		];

		const result = transformMessages(messages, model);

		expect(result).toHaveLength(1);
		expect(result[0]?.role).toBe("user");
	});
});
