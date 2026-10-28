// Modified by The Open Forge contributors.
import type { Api, Message, Model } from "@vetta/ai";
import { emptyHookDispatchOutcome } from "@vetta/ecosystem-adapter";
import { createRuntimeObservationPublisher, type RuntimeObservationRecord } from "@vetta/runtime-core";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import { describe, expect, it } from "vitest";
import { createCodingAgentSubagentSessionAssembly } from "../../src/composition/subagent/session-assembly.js";

describe("Subagent admission observation production assembly", () => {
	it("routes a normal spawn and completion to the safe publisher without private task fields", async () => {
		const records: RuntimeObservationRecord[] = [];
		const released = deferred<void>();
		const publisher = createRuntimeObservationPublisher({
			context: { sessionId: "parent" },
			port: {
				record: (record) => {
					records.push(record);
					const payload = record.payload;
					if (
						record.token.id === "coding-agent.subagent.scheduling" &&
						typeof payload === "object" &&
						payload !== null &&
						"phase" in payload &&
						payload.phase === "released"
					)
						released.resolve();
				},
			},
		});
		const runtime = createCodingAgentSubagentSessionAssembly({
			enabled: true,
			cwd: "C:\\private-workspace",
			scenario: "cli",
			readParentSessionId: () => "parent",
			readParentSessionPath: () => "C:\\private-history\\parent.jsonl",
			readParentMessages: async (): Promise<readonly Message[]> => [],
			readModel: () => MODEL,
			readThinkingLevel: () => "off",
			readInheritedMcpView: async () => ({ tools: [] }) as McpRuntimeToolView,
			createChildComposition: async () => {
				throw new Error("unexpected host composition");
			},
			assessChildSessionPath: async () => "valid",
			hookRuntime: {
				runSubagentStart: async () => emptyHookDispatchOutcome(),
				runSubagentStop: async () => emptyHookDispatchOutcome(),
				recordAdditionalContexts: async () => {},
			},
			resourceContext: { deliverAsyncContext: async () => {}, reportObservation: async () => {} },
			observationPublisher: publisher,
			createChildFactory: () => ({
				create: async () => ({
					sessionId: "child-session",
					prompt: async () => {},
					sendMessage: async () => {},
					followUp: async () => {},
					abort() {},
					waitForIdle: async () => {},
					isStreaming: () => false,
					getLastAssistantText: () => "private result",
					dispose() {},
					subscribe: () => () => {},
				}),
			}),
		});
		if (!runtime) throw new Error("Expected subagent runtime");
		try {
			const tool = runtime.readTools().find(({ name }) => name === "spawn_agent");
			if (!tool) throw new Error("Expected spawn tool");
			await tool.execute({
				sessionId: "parent",
				turnId: "turn",
				toolCallId: "call",
				signal: new AbortController().signal,
				input: { task_name: "private_task", message: "private objective", agent_type: "general" },
			});
			await released.promise;
			await publisher.flush();
			const scheduling = records.filter(({ token }) => token.id === "coding-agent.subagent.scheduling");
			expect(scheduling).toHaveLength(2);
			expect(scheduling.map(({ context }) => context.sessionId)).toEqual(["parent", "parent"]);
			expect(scheduling[0]?.payload).toMatchObject({ phase: "admitted", activeCount: 1, generation: 0 });
			expect(scheduling[1]?.payload).toMatchObject({
				phase: "released",
				childSessionId: "child-session",
				reason: "completed",
				generation: 1,
			});
			const serialized = JSON.stringify(scheduling);
			for (const value of [
				"private_task",
				"private objective",
				"private result",
				"private-workspace",
				"private-history",
			])
				expect(serialized).not.toContain(value);
		} finally {
			await runtime.dispose();
		}
	});
});

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const MODEL: Model<Api> = {
	id: "fake",
	name: "Fake",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
