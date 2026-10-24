// Copyright The Open Forge contributors.
import { type AssistantMessage, AssistantMessageEventStream, type Message, type UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { AgentCoreTurnEngine } from "../../src/kernel/agent-core-turn-engine.js";
import type {
	RuntimeSnapshot,
	RuntimeToolDefinition,
	TurnEngineEvent,
	TurnEnginePort,
} from "../../src/kernel/index.js";

/**
 * Each resolved ModelCallFrame owns frozen copies of every tool schema. The engine
 * previously kept one frame per model call for the whole turn. These tests pin the
 * externally visible behaviour that must survive releasing a frame after its call.
 */

function assistant(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
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
		timestamp: 2,
	};
}

function streamOf(message: AssistantMessage): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();
	queueMicrotask(() =>
		stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message }),
	);
	return stream;
}

function user(content: string): UserMessage {
	return { role: "user", content, timestamp: 1 };
}

function snapshot(tools: readonly RuntimeToolDefinition[]): RuntimeSnapshot {
	return {
		id: "snapshot-1",
		instructions: [{ id: "base", content: "Base instruction", priority: 0 }],
		tools: new Map(tools.map((tool) => [tool.name, tool])),
		contextProviders: [],
		contextStrategy: {
			async prepare(input) {
				return { messages: input.messages, estimatedTokens: 0 };
			},
		},
		toolPolicy: { authorize: async () => true },
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
		observers: [],
	};
}

async function run(
	engine: TurnEnginePort,
	runtimeSnapshot: RuntimeSnapshot,
	messages: Message[] = [user("hello")],
	signal: AbortSignal = new AbortController().signal,
): Promise<TurnEngineEvent[]> {
	const events: TurnEngineEvent[] = [];
	for await (const event of engine.execute({
		sessionId: "session-1",
		turnId: "turn-1",
		snapshot: runtimeSnapshot,
		messages,
		signal,
	})) {
		events.push(event);
	}
	return events;
}

function toolLoopEngine(rounds: number, onCall: (index: number) => void) {
	const responses = Array.from({ length: rounds }, (_, index) =>
		assistant(
			[{ type: "toolCall", id: `call-${index + 1}`, name: "echo", arguments: { value: String(index) } }],
			"toolUse",
		),
	);
	responses.push(assistant([{ type: "text", text: "done" }]));
	let index = 0;
	return new AgentCoreTurnEngine({
		model: { api: "openai-responses", provider: "openai", id: "test-model" } as never,
		streamFn: () => {
			onCall(index);
			const message = responses[index];
			if (!message) throw new Error(`missing response ${index}`);
			index += 1;
			return streamOf(message);
		},
	});
}

const echoTool: RuntimeToolDefinition = {
	name: "echo",
	label: "Echo",
	description: "Echo a value",
	inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
	async execute({ input }) {
		return { content: [{ type: "text", text: String((input as { value: unknown }).value) }] };
	},
};

describe("AgentCoreTurnEngine frame handoff", () => {
	it("keeps a long tool loop producing every result in order after frames are released", async () => {
		const executions: string[] = [];
		const tool: RuntimeToolDefinition = {
			...echoTool,
			async execute({ input }) {
				const value = String((input as { value: unknown }).value);
				executions.push(value);
				return { content: [{ type: "text", text: value }] };
			},
		};
		const events = await run(
			toolLoopEngine(30, () => undefined),
			snapshot([tool]),
		);
		expect(executions).toEqual(Array.from({ length: 30 }, (_, index) => String(index)));
		const results = events.flatMap((event) =>
			event.type === "message" && event.message.role === "toolResult" ? [event.message] : [],
		);
		expect(results.map((message) => (message.content[0]?.type === "text" ? message.content[0].text : ""))).toEqual(
			executions,
		);
		expect(events.at(-1)).toMatchObject({ type: "completed", stopReason: "stop" });
	});

	it("resolves a fresh, distinct frame for every model call instead of reusing one", async () => {
		const responses = Array.from({ length: 3 }, (_, index) =>
			assistant(
				[{ type: "toolCall", id: `call-${index + 1}`, name: "echo", arguments: { value: String(index) } }],
				"toolUse",
			),
		);
		responses.push(assistant([{ type: "text", text: "done" }]));
		let responseIndex = 0;
		const composed = 0;
		const prompts: string[] = [];
		let composeCount = composed;
		const engine = new AgentCoreTurnEngine({
			model: { api: "openai-responses", provider: "openai", id: "test-model" } as never,
			streamFn: ((...args: unknown[]) => {
				prompts.push((args[1] as { systemPrompt: string }).systemPrompt);
				const message = responses[responseIndex];
				if (!message) throw new Error(`missing response ${responseIndex}`);
				responseIndex += 1;
				return streamOf(message);
			}) as never,
		});
		const base = snapshot([echoTool]);
		const runtimeSnapshot: RuntimeSnapshot = {
			...base,
			modelCallFrameComposer: {
				async compose() {
					composeCount += 1;
					return {
						instructions: [{ id: "call", content: `Prompt ${composeCount}`, priority: 0 }],
						tools: new Map([["echo", echoTool]]),
					};
				},
			} as never,
		};
		const events = await run(engine, runtimeSnapshot);
		expect(composeCount).toBe(4);
		expect(prompts).toEqual(["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4"]);
		expect(events.at(-1)).toMatchObject({ type: "completed", stopReason: "stop" });
	});

	it("completes a tool-free turn without needing a resolved frame", async () => {
		const engine = new AgentCoreTurnEngine({
			model: { api: "openai-responses", provider: "openai", id: "test-model" } as never,
			streamFn: () => streamOf(assistant([{ type: "text", text: "done" }])),
		});
		// No tools and no composer: the frame resolution path must still hand off cleanly.
		const events = await run(engine, { ...snapshot([]), modelCallProviders: [] });
		expect(events.at(-1)).toMatchObject({ type: "completed" });
	});
});
