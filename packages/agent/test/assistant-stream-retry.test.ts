import type { AssistantMessage, AssistantMessageEvent } from "@vetta/ai";
import { AI_ERROR_CODES, AIError, getAIErrorDetails } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { agentLoopContinue } from "../src/agent-loop.js";
import type { AgentContext, AgentEvent, AgentLoopConfig } from "../src/types.js";
import {
	createAssistantMessage,
	createModel,
	createUserMessage,
	identityConverter,
	MockAssistantStream,
} from "./support/agent-loop-fixtures.js";

function createContext(): AgentContext {
	return {
		systemPrompt: "test",
		messages: [createUserMessage("start")],
		tools: [],
	};
}

function createConfig(): AgentLoopConfig {
	return { model: createModel(), convertToLlm: identityConverter };
}

function scriptedStream(events: readonly AssistantMessageEvent[]): MockAssistantStream {
	const stream = new MockAssistantStream();
	queueMicrotask(() => {
		for (const event of events) stream.push(event);
	});
	return stream;
}

async function collect(stream: AsyncIterable<AgentEvent>) {
	const events: AgentEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("assistant stream provider retries", () => {
	it("surfaces retry activity on the same assistant bubble without a second message row", async () => {
		const partial = createAssistantMessage([]);
		const finalMessage = createAssistantMessage([{ type: "text", text: "hello" }]);
		const failure = getAIErrorDetails(
			new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", { retryable: true, statusCode: 429 }),
		);
		const stream = scriptedStream([
			{ type: "start", partial },
			{ type: "text_delta", contentIndex: 0, delta: "he", partial },
			{
				type: "retry",
				reason: "rate_limit",
				attempt: 1,
				maxAttempts: 10,
				delayMs: 2_000,
				errorMessage: "Rate limit reached",
				failure,
			},
			{ type: "text_delta", contentIndex: 0, delta: "llo", partial },
			{ type: "done", reason: "stop", message: finalMessage },
		]);
		const context = createContext();
		const events = await collect(agentLoopContinue(context, createConfig(), undefined, () => stream));

		expect(events.filter((event) => event.type === "message_start")).toHaveLength(1);
		const retryUpdate = events.find(
			(event) => event.type === "message_update" && event.assistantMessageEvent.type === "retry",
		);
		expect(retryUpdate).toBeDefined();
		expect(events.filter((event) => event.type === "message_end")).toHaveLength(1);
		const assistantMessages = context.messages.filter((message) => message.role === "assistant");
		expect(assistantMessages).toHaveLength(1);
		expect(assistantMessages[0]).toBe(finalMessage);
	});

	it("reuses the bubble when a retry-aware stream restarts with a second start event", async () => {
		const firstPartial: AssistantMessage = createAssistantMessage([]);
		const secondPartial: AssistantMessage = createAssistantMessage([]);
		const finalMessage = createAssistantMessage([{ type: "text", text: "recovered" }]);
		const stream = scriptedStream([
			{ type: "start", partial: firstPartial },
			{ type: "text_delta", contentIndex: 0, delta: "partial", partial: firstPartial },
			{ type: "start", partial: secondPartial },
			{ type: "text_delta", contentIndex: 0, delta: "recovered", partial: secondPartial },
			{ type: "done", reason: "stop", message: finalMessage },
		]);
		const context = createContext();
		const events = await collect(agentLoopContinue(context, createConfig(), undefined, () => stream));

		expect(events.filter((event) => event.type === "message_start")).toHaveLength(1);
		expect(context.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
	});
});
