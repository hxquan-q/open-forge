import type { AssistantMessage, Context } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { agentLoop } from "../src/agent-loop.js";
import type { AgentContext, AgentEvent, AgentLoopConfig } from "../src/types.js";
import {
	createAssistantMessage,
	createModel,
	createUserMessage,
	identityConverter,
	MockAssistantStream,
} from "./support/agent-loop-fixtures.js";

function scriptedStreamFn(responses: readonly AssistantMessage[]): {
	contexts: Context[];
	streamFn: (model: unknown, ctx: Context) => MockAssistantStream;
} {
	const contexts: Context[] = [];
	let index = 0;
	return {
		contexts,
		streamFn: (_model: unknown, ctx: Context) => {
			contexts.push({ ...ctx, messages: [...ctx.messages] });
			const stream = new MockAssistantStream();
			const message = responses[index] ?? responses[responses.length - 1];
			index += 1;
			queueMicrotask(() => {
				stream.push({ type: "start", partial: { ...message, content: [] } });
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		},
	};
}

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

function assistantRowEvents(events: AgentEvent[], type: "message_start" | "message_end"): AgentEvent[] {
	return events.filter((e) => e.type === type && e.message.role === "assistant");
}

function textMessage(text: string): AssistantMessage {
	return createAssistantMessage([{ type: "text", text }]);
}

function emptyMessage(): AssistantMessage {
	return createAssistantMessage([]);
}

describe("agentLoop silent turn rerun", () => {
	it("reruns an empty reply once and lands the text in the same assistant bubble", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const { streamFn, contexts } = scriptedStreamFn([emptyMessage(), textMessage("Recovered answer")]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		const events = await collect(stream);
		const messages = await stream.result();

		// 同一 assistant 行：一次 message_start，一次 message_end。
		expect(assistantRowEvents(events, "message_start")).toHaveLength(1);
		expect(assistantRowEvents(events, "message_end")).toHaveLength(1);
		// 没有中间 turn/agent 边界。
		expect(events.filter((e) => e.type === "turn_start")).toHaveLength(1);
		expect(events.filter((e) => e.type === "turn_end")).toHaveLength(1);
		expect(events.filter((e) => e.type === "agent_start")).toHaveLength(1);
		expect(events.filter((e) => e.type === "agent_end")).toHaveLength(1);

		// 结果中没有空 assistant 行，只有一个带正文的回复。
		expect(messages).toHaveLength(2);
		const assistant = messages[1] as AssistantMessage;
		expect(assistant.role).toBe("assistant");
		expect(assistant.stopReason).toBe("stop");
		expect(assistant.content).toEqual([{ type: "text", text: "Recovered answer" }]);

		// 两次模型调用：第二次携带恢复指令作为模型视图中的尾随 user 消息。
		expect(contexts).toHaveLength(2);
		const nudge = contexts[1].messages.at(-1);
		expect(nudge?.role).toBe("user");
		expect(typeof nudge?.content === "string" ? nudge.content : "").toContain("<no_output_recovery>");
		// nudge 不进入会话上下文。
		expect(
			context.messages.some(
				(m) =>
					(m.role === "user" || m.role === "assistant") &&
					typeof m.content === "string" &&
					m.content.includes("no_output_recovery"),
			),
		).toBe(false);
	});

	it("turns a second empty reply into an explicit retriable EMPTY_MODEL_RESPONSE failure", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const { streamFn, contexts } = scriptedStreamFn([emptyMessage(), emptyMessage()]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		const events = await collect(stream);
		const messages = await stream.result();

		expect(contexts).toHaveLength(2);
		expect(assistantRowEvents(events, "message_start")).toHaveLength(1);
		expect(assistantRowEvents(events, "message_end")).toHaveLength(1);
		expect(events.filter((e) => e.type === "turn_end")).toHaveLength(1);
		expect(events.filter((e) => e.type === "agent_end")).toHaveLength(1);

		const assistant = messages.at(-1) as AssistantMessage;
		expect(assistant.role).toBe("assistant");
		expect(assistant.stopReason).toBe("error");
		expect(assistant.failure?.code).toBe("AI_EMPTY_MODEL_RESPONSE");
		expect(assistant.failure?.retryable).toBe(true);

		const turnEnd = events.find((e) => e.type === "turn_end");
		expect(turnEnd?.type === "turn_end" && (turnEnd.message as AssistantMessage).stopReason).toBe("error");
	});

	it("reruns a thinking-only reply that left no visible text", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const thinkingOnly = createAssistantMessage([
			{ type: "thinking", thinking: "worked it out silently", thinkingSignature: "" },
		]);
		const { streamFn, contexts } = scriptedStreamFn([thinkingOnly, textMessage("Here it is")]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		await collect(stream);
		const messages = await stream.result();

		expect(contexts).toHaveLength(2);
		expect((messages.at(-1) as AssistantMessage).content).toEqual([{ type: "text", text: "Here it is" }]);
	});

	it("does not rerun when the model finishes with a tool call", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const toolUse = createAssistantMessage(
			[{ type: "toolCall", id: "call-1", name: "missing_tool", arguments: {} }],
			"toolUse",
		);
		const { streamFn, contexts } = scriptedStreamFn([toolUse, textMessage("done")]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		const events = await collect(stream);
		await stream.result();

		// 第二次模型调用是工具结果后的正常续跑：尾随消息是 toolResult 而非 nudge，
		// 且产生了正常的新一轮 turn 边界。
		expect(contexts).toHaveLength(2);
		expect(contexts[1].messages.at(-1)?.role).toBe("toolResult");
		expect(
			contexts[1].messages.some((m) => typeof m.content === "string" && m.content.includes("no_output_recovery")),
		).toBe(false);
		expect(events.filter((e) => e.type === "turn_end")).toHaveLength(2);
	});

	it("does not rerun after an aborted reply", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const aborted = createAssistantMessage([], "aborted");
		const { streamFn, contexts } = scriptedStreamFn([aborted]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		await collect(stream);
		const messages = await stream.result();

		expect(contexts).toHaveLength(1);
		expect((messages.at(-1) as AssistantMessage).stopReason).toBe("aborted");
	});

	it("respects allowSilentCompletion for intentionally silent runs", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
			allowSilentCompletion: true,
		};
		const { streamFn, contexts } = scriptedStreamFn([emptyMessage()]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		const events = await collect(stream);
		const messages = await stream.result();

		expect(contexts).toHaveLength(1);
		const assistant = messages.at(-1) as AssistantMessage;
		expect(assistant.stopReason).toBe("stop");
		expect(assistant.content).toEqual([]);
		expect(assistantRowEvents(events, "message_start")).toHaveLength(1);
		expect(assistantRowEvents(events, "message_end")).toHaveLength(1);
		expect(events.filter((e) => e.type === "turn_end")).toHaveLength(1);
	});

	it("keeps a whitespace-only reply on the rerun path", async () => {
		const context: AgentContext = { systemPrompt: "sys", messages: [], tools: [] };
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };
		const whitespace = createAssistantMessage([{ type: "text", text: "   \n  " }]);
		const { streamFn, contexts } = scriptedStreamFn([whitespace, textMessage("Recovered")]);

		const stream = agentLoop([createUserMessage("Hello")], context, config, undefined, streamFn);
		await collect(stream);
		await stream.result();

		expect(contexts).toHaveLength(2);
	});
});
