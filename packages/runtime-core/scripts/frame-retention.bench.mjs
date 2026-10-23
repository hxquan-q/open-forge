// Copyright The Open Forge contributors.
/**
 * Measures heap retained by a *live* Turn, not a completed one.
 *
 * The engine keeps a per-turn map of resolved ModelCallFrames. A frame owns a
 * deep copy of every tool schema (freezeTool), so long tool loops hold one copy
 * per model call until the turn ends. This harness pauses inside the final model
 * call — when every earlier frame is definitely still reachable — forces a GC and
 * reports the live set.
 *
 * Run with `--expose-gc`. Numbers are only comparable within one machine/run set.
 */
import { tsImport } from "tsx/esm/api";

const ai = await import("@vetta/ai");
const kernel = await tsImport("../src/kernel/index.ts", import.meta.url);
const { AssistantMessageEventStream } = ai;
const { SessionInputQueue, AgentCoreTurnEngine: StatelessAgentCoreTurnEngine } = kernel;

/** A schema with `depth` nested objects — expensive enough that copies are visible. */
function nestedSchema(depth) {
	let schema = { type: "string" };
	for (let level = 0; level < depth; level += 1) {
		schema = {
			type: "object",
			properties: { value: schema, sibling: { type: "number" }, label: { type: "string" } },
			required: ["value"],
		};
	}
	return schema;
}

function assistant(content, stopReason = "stop") {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "bench-model",
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

function streamOf(message) {
	const stream = new AssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message });
	});
	return stream;
}

function snapshot(toolCount, schemaDepth) {
	const tools = Array.from({ length: toolCount }, (_, index) => ({
		name: `tool-${index}`,
		label: `Tool ${index}`,
		description: `Tool number ${index}`,
		inputSchema: nestedSchema(schemaDepth),
		async execute() {
			return { content: [{ type: "text", text: "ok" }] };
		},
	}));
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

async function measure({ rounds, toolCount, schemaDepth }) {
	if (typeof globalThis.gc !== "function") throw new Error("Run with node --expose-gc");
	const responses = Array.from({ length: rounds }, (_, index) =>
		assistant([{ type: "toolCall", id: `call-${index + 1}`, name: "tool-0", arguments: {} }], "toolUse"),
	);
	responses.push(assistant([{ type: "text", text: "done" }]));
	let index = 0;
	let sampled = 0;
	const engine = new StatelessAgentCoreTurnEngine({
		model: { api: "openai-responses", provider: "openai", id: "bench-model" },
		streamFn: () => {
			const message = responses[index];
			if (!message) throw new Error(`missing response ${index}`);
			index += 1;
			// Sample on the *last* model call: every earlier frame is still held then.
			if (index === responses.length) {
				globalThis.gc();
				sampled = process.memoryUsage().heapUsed;
			}
			return streamOf(message);
		},
	});
	const events = [];
	for await (const event of engine.execute({
		sessionId: "session-1",
		turnId: "turn-1",
		snapshot: snapshot(toolCount, schemaDepth),
		messages: [{ role: "user", content: "go", timestamp: 1 }],
		signal: new AbortController().signal,
		inputQueue: new SessionInputQueue(),
	})) {
		events.push(event);
	}
	if (!events.some((event) => event.type === "completed")) throw new Error("turn did not complete");
	return sampled;
}

/**
 * Each scenario is paired with a control that runs the identical toolset and
 * schema through a single model call. The difference is the live heap the
 * history frames add, with process/runtime baseline subtracted.
 */
const scenarios = [
	{ name: "short", rounds: 8, toolCount: 4, schemaDepth: 2 },
	{ name: "loop", rounds: 40, toolCount: 24, schemaDepth: 4 },
	{ name: "long", rounds: 101, toolCount: 64, schemaDepth: 5 },
];

async function medianRetained(scenario, repeats = 5) {
	const runs = [];
	for (let repeat = 0; repeat < repeats; repeat += 1) runs.push(await measure(scenario));
	runs.sort((left, right) => left - right);
	return { median: runs[Math.floor(runs.length / 2)], runs };
}

const results = [];
for (const scenario of scenarios) {
	const control = await medianRetained({ ...scenario, rounds: 1 });
	const measured = await medianRetained(scenario);
	results.push({
		...scenario,
		controlBytes: control.median,
		measuredBytes: measured.median,
		deltaBytes: Math.max(0, measured.median - control.median),
		spreadPct: ((Math.max(...measured.runs) - Math.min(...measured.runs)) / measured.median) * 100,
	});
}

const megabyte = 1024 * 1024;
const report = {
	version: 1,
	runtime: process.version,
	scenarios: results.map((result) => ({
		name: result.name,
		rounds: result.rounds,
		toolCount: result.toolCount,
		schemaDepth: result.schemaDepth,
		measuredMb: Number((result.measuredBytes / megabyte).toFixed(3)),
		controlMb: Number((result.controlBytes / megabyte).toFixed(3)),
		retainedMb: Number((result.deltaBytes / megabyte).toFixed(3)),
		spreadPct: Number(result.spreadPct.toFixed(1)),
	})),
};
report.totalMb = Number(report.scenarios.reduce((sum, item) => sum + item.retainedMb, 0).toFixed(3));
console.log(JSON.stringify(report, null, 2));
console.log(`METRIC frame_retained_mb=${report.totalMb}`);
for (const scenario of report.scenarios) console.log(`METRIC ${scenario.name}_mb=${scenario.retainedMb}`);
