import { type AssistantMessage, AssistantMessageEventStream, type Model, type UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	RUNTIME_CONTEXT_STABILITY_OBSERVATION,
	type RuntimeContextStabilityObservation,
	type RuntimeSnapshot,
	type RuntimeToolDefinition,
	type TurnEngineEvent,
} from "../../src/kernel/index.js";
import { StatelessAgentCoreTurnEngine } from "../../src/kernel/stateless-agent-core-turn-engine.js";
import type { RuntimeObservationPublisher } from "../../src/observation/contracts.js";

describe("runtime.context stability observation", () => {
	it("publishes append-only growth for a tool loop with per-call model call ids", async () => {
		const records: StabilityRecord[] = [];

		const events = await run(engine(), {
			...snapshot([echoTool()]),
			observationPublisher: stabilityProbe(records),
		});

		expect(events.at(-1)).toMatchObject({ type: "completed", stopReason: "stop" });
		expect(records).toHaveLength(2);
		expect(records[0]).toEqual({
			payload: {
				phase: "compared",
				kind: "first",
				previousMessageCount: 0,
				currentMessageCount: 1,
				stablePrefixMessageCount: 0,
				contentFallbackCount: 0,
			},
			context: { sessionId: "session-1", turnId: "turn-1", modelCallId: "turn-1:model-call:1" },
		});
		expect(records[1]).toEqual({
			payload: {
				phase: "compared",
				kind: "append_only",
				previousMessageCount: 1,
				currentMessageCount: 3,
				stablePrefixMessageCount: 1,
				contentFallbackCount: 0,
			},
			context: { sessionId: "session-1", turnId: "turn-1", modelCallId: "turn-1:model-call:2" },
		});
		// 隐私合同：payload 只含计数与分类，不携带任何消息正文。
		for (const record of records) {
			expect(Object.keys(record.payload).every((key) => PAYLOAD_KEYS.has(key))).toBe(true);
			expect(JSON.stringify(record.payload)).not.toContain("hello");
		}
	});

	it("reports prefix rewrite when a transformer rewrites settled history", async () => {
		const records: StabilityRecord[] = [];
		let transformCalls = 0;

		const events = await run(engine(), {
			...snapshot([echoTool()]),
			observationPublisher: stabilityProbe(records),
			modelCallContextTransformer: {
				async transform(input) {
					transformCalls += 1;
					return input.messages.map((message, index) =>
						index === 0 && message.role === "user" && typeof message.content === "string"
							? { ...message, content: `${message.content}#${transformCalls}` }
							: message,
					);
				},
			},
		});

		expect(transformCalls).toBe(2);
		expect(events.at(-1)).toMatchObject({ type: "completed", stopReason: "stop" });
		expect(records[1]?.payload).toEqual({
			phase: "compared",
			kind: "prefix_rewrite",
			previousMessageCount: 1,
			currentMessageCount: 3,
			stablePrefixMessageCount: 0,
			firstDivergenceIndex: 0,
			contentFallbackCount: 0,
		});
	});

	it("keeps the model call unaffected when the stability channel throws", async () => {
		const events = await run(engine(), {
			...snapshot([echoTool()]),
			observationPublisher: stabilityProbe([], { throwOnStability: true }),
		});

		expect(events.at(-1)).toMatchObject({ type: "completed", stopReason: "stop" });
	});
});

interface StabilityRecord {
	readonly payload: RuntimeContextStabilityObservation;
	readonly context: {
		readonly sessionId?: string;
		readonly turnId?: string;
		readonly modelCallId?: string;
	};
}

const PAYLOAD_KEYS = new Set([
	"phase",
	"kind",
	"previousMessageCount",
	"currentMessageCount",
	"stablePrefixMessageCount",
	"firstDivergenceIndex",
	"contentFallbackCount",
]);

/**
 * 完整合同的最小探针 Publisher：只记录稳定性观测，其余通道静默；
 * scope 出的子 Publisher 继续写入同一探针，flush 无副作用。
 */
function stabilityProbe(
	records: StabilityRecord[],
	options: { throwOnStability?: boolean } = {},
): RuntimeObservationPublisher {
	return {
		record(token, payload, context) {
			if (token.id !== RUNTIME_CONTEXT_STABILITY_OBSERVATION.id) return;
			if (options.throwOnStability) throw new Error("stability channel violated its contract");
			records.push({
				payload: payload as RuntimeContextStabilityObservation,
				context: {
					sessionId: context?.sessionId,
					turnId: context?.turnId,
					modelCallId: context?.modelCallId,
				},
			});
		},
		forward() {},
		scope: () => stabilityProbe(records, options),
		async flush() {},
	};
}

function engine(): StatelessAgentCoreTurnEngine {
	const responses = [
		assistant([{ type: "toolCall", id: "call-1", name: "echo", arguments: { value: "hi" } }], "toolUse"),
		assistant([{ type: "text", text: "done" }]),
	];
	let index = 0;
	return new StatelessAgentCoreTurnEngine({
		model: model(),
		streamFn: () => {
			const response = responses[index];
			if (!response) throw new Error(`Missing response at index ${index}`);
			index += 1;
			return recordedStream(response);
		},
	});
}

function echoTool(): RuntimeToolDefinition {
	return {
		name: "echo",
		label: "Echo",
		description: "Echo",
		inputSchema: { type: "object" },
		async execute() {
			return { content: [{ type: "text", text: "echoed" }] };
		},
	};
}

function recordedStream(message: AssistantMessage): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({
			type: "done",
			reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
			message,
		});
	});
	return stream;
}

function model(): Model<"openai-responses"> {
	return {
		id: "recorded-model",
		name: "Recorded Model",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8_000,
		maxTokens: 1_000,
	};
}

function snapshot(tools: readonly RuntimeToolDefinition[] = []): RuntimeSnapshot {
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

function user(content: string): UserMessage {
	return { role: "user", content, timestamp: 1 };
}

function assistant(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "recorded-model",
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

async function run(
	engineInstance: StatelessAgentCoreTurnEngine,
	runtimeSnapshot: RuntimeSnapshot,
): Promise<TurnEngineEvent[]> {
	const events: TurnEngineEvent[] = [];
	for await (const event of engineInstance.execute({
		sessionId: "session-1",
		turnId: "turn-1",
		snapshot: runtimeSnapshot,
		messages: [user("hello")],
		signal: new AbortController().signal,
	})) {
		events.push(event);
	}
	return events;
}
