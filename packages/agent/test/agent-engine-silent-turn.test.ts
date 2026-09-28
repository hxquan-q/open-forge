import {
	type AssistantMessage,
	LanguageModelStream,
	type Message,
	type ModelStreamResponse,
	type ToolCall,
} from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { runAgentTurn } from "../src/engine/run-agent-turn.js";
import type { AgentExecutionEvent, AgentTurnRequest } from "../src/engine/types.js";

const DEFAULT_LIMITS = {
	maxModelCalls: 10,
	maxToolCalls: 10,
	maxRecoveryAttempts: 2,
	checkpointTimeoutMs: 50,
} as const;

describe("runAgentTurn silent turn rerun", () => {
	it("reruns an empty reply once and emits a single assistant message", async () => {
		const callMessages: (readonly Message[])[] = [];
		const run = runAgentTurn(
			request(
				[successResponse(assistant([])), successResponse(assistant([{ type: "text", text: "Recovered" }]))],
				(context) => callMessages.push([...context.messages]),
			),
		);
		const events = await collect(run.events);
		const result = await run.result;

		expect(result.status).toBe("completed");
		expect(result.modelCalls).toBe(2);
		expect(result.messages).toHaveLength(2);
		const final = result.messages.at(-1) as AssistantMessage;
		expect(final.role).toBe("assistant");
		expect(final.content).toEqual([{ type: "text", text: "Recovered" }]);

		// 两次模型调用；重跑标记为延续既有 assistant 行。
		const starts = events.filter((e) => e.type === "model_call_start");
		expect(starts).toHaveLength(2);
		expect(starts[0].type === "model_call_start" && starts[0].continuesAssistant).toBeUndefined();
		expect(starts[1].type === "model_call_start" && starts[1].continuesAssistant).toBe(true);

		// 只落一条 assistant_message；没有空行，也没有额外终态事件。
		const assistantMessages = events.filter((e) => e.type === "assistant_message");
		expect(assistantMessages).toHaveLength(1);
		expect(events.filter((e) => e.type === "run_finish")).toHaveLength(1);

		// 重跑的模型视图里追加了恢复指令；会话消息本身不含它。
		expect(callMessages).toHaveLength(2);
		const nudge = callMessages[1].at(-1);
		expect(nudge?.role).toBe("user");
		expect(typeof nudge?.content === "string" ? nudge.content : "").toContain("<no_output_recovery>");
		expect(
			result.messages.some((m) => typeof m.content === "string" && m.content.includes("no_output_recovery")),
		).toBe(false);
	});

	it("turns a second empty reply into an explicit retriable EMPTY_MODEL_RESPONSE failure", async () => {
		const run = runAgentTurn(request([successResponse(assistant([])), successResponse(assistant([]))]));
		const events = await collect(run.events);
		const result = await run.result;

		expect(result.status).toBe("failed");
		expect(result.failure?.code).toBe("AI_EMPTY_MODEL_RESPONSE");
		expect(result.failure?.retryable).toBe(true);

		const assistantMessages = events.filter((e) => e.type === "assistant_message");
		expect(assistantMessages).toHaveLength(1);
		const emitted = assistantMessages[0];
		expect(emitted.type === "assistant_message" && emitted.message.stopReason).toBe("error");
		expect(emitted.type === "assistant_message" && emitted.failure?.code).toBe("AI_EMPTY_MODEL_RESPONSE");

		const last = result.lastAssistantMessage;
		expect(last?.stopReason).toBe("error");
		expect(last?.failure?.code).toBe("AI_EMPTY_MODEL_RESPONSE");
		expect(last?.failure?.retryable).toBe(true);
	});

	it("reruns a thinking-only reply that produced no visible text", async () => {
		const run = runAgentTurn(
			request([
				successResponse(assistant([{ type: "thinking", thinking: "done in my head" }])),
				successResponse(assistant([{ type: "text", text: "answer" }])),
			]),
		);
		await collect(run.events);
		const result = await run.result;

		expect(result.status).toBe("completed");
		expect(result.modelCalls).toBe(2);
	});

	it("does not rerun a tool-call completion", async () => {
		const run = runAgentTurn(
			request([
				successResponse(assistant([toolCall("call-1", "noop", {})], "toolUse")),
				successResponse(assistant([{ type: "text", text: "after tool" }])),
			]),
		);
		const events = await collect(run.events);
		const result = await run.result;

		expect(result.status).toBe("completed");
		expect(result.modelCalls).toBe(2);
		// 第二次调用是工具结果续跑，不带 continuesAssistant 标记。
		const starts = events.filter((e) => e.type === "model_call_start");
		expect(starts.every((e) => e.type === "model_call_start" && !e.continuesAssistant)).toBe(true);
	});

	it("does not rerun an aborted reply", async () => {
		const run = runAgentTurn(request([successResponse(assistant([], "aborted"))]));
		const events = await collect(run.events);
		const result = await run.result;

		expect(result.modelCalls).toBe(1);
		expect(events.filter((e) => e.type === "model_call_start")).toHaveLength(1);
	});

	it("respects allowSilentCompletion for intentionally silent runs", async () => {
		const run = runAgentTurn({ ...request([successResponse(assistant([]))]), allowSilentCompletion: true });
		const events = await collect(run.events);
		const result = await run.result;

		expect(result.status).toBe("completed");
		expect(result.modelCalls).toBe(1);
		expect(events.filter((e) => e.type === "model_call_start")).toHaveLength(1);
		expect(events.filter((e) => e.type === "assistant_message")).toHaveLength(1);
	});
});

function request(
	responses: readonly ModelStreamResponse[],
	onCall?: (context: Parameters<AgentTurnRequest["resolveModelCall"]>[0]) => void,
): AgentTurnRequest {
	return {
		messages: [{ role: "user", content: "start", timestamp: 1 }],
		resolveModelCall: scriptedResolver(responses, onCall),
		resolveTools: async () => [],
		toolPolicy: { authorize: async () => undefined },
		limits: DEFAULT_LIMITS,
		signal: new AbortController().signal,
	};
}

function scriptedResolver(
	responses: readonly ModelStreamResponse[],
	onCall?: (context: Parameters<AgentTurnRequest["resolveModelCall"]>[0]) => void,
): AgentTurnRequest["resolveModelCall"] {
	let index = 0;
	return async (context) => {
		onCall?.(context);
		const response = responses[index];
		if (!response) throw new Error(`No response at index ${index}`);
		index += 1;
		return { callId: `call-${index}`, snapshotId: `snapshot-${index}`, response };
	};
}

function successResponse(message: AssistantMessage): ModelStreamResponse {
	const stream = new LanguageModelStream();
	stream.push({ type: "start", partial: message });
	stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message });
	return { events: stream, result: stream.result() };
}

function assistant(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "test-api",
		provider: "test-provider",
		model: "test-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: 1,
	};
}

function toolCall(id: string, name: string, argumentsValue: Record<string, unknown>): ToolCall {
	return { type: "toolCall", id, name, arguments: argumentsValue };
}

async function collect(events: AsyncIterable<AgentExecutionEvent>): Promise<AgentExecutionEvent[]> {
	const collected: AgentExecutionEvent[] = [];
	for await (const event of events) collected.push(event);
	return collected;
}
