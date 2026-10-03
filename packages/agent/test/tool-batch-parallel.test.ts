// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import type { ToolCall, ToolResultMessage, UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { executeRuntimeToolCalls } from "../src/engine/tool-executor.js";
import type { AgentExecutionEvent, RuntimeToolDefinition, RuntimeToolResult } from "../src/engine/types.js";

function gate() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function tool(
	name: string,
	execute: RuntimeToolDefinition["execute"],
	mode: RuntimeToolDefinition["executionMode"] = "parallel-safe",
): RuntimeToolDefinition {
	return { name, description: name, inputSchema: Type.Object({}), executionMode: mode, execute };
}
function output(text: string): RuntimeToolResult {
	return { content: [{ type: "text", text }], details: {} };
}
function call(name: string): ToolCall {
	return { type: "toolCall", id: name, name, arguments: {} };
}
type BatchRequest = Parameters<typeof executeRuntimeToolCalls>[0];
function run(tools: RuntimeToolDefinition[], overrides: Partial<BatchRequest> = {}) {
	return executeRuntimeToolCalls({
		calls: tools.map(({ name }) => call(name)),
		tools,
		messages: [],
		modelCallIndex: 0,
		signal: new AbortController().signal,
		maxParallelToolCalls: 2,
		policy: { authorize: async () => undefined },
		emit: () => undefined,
		...overrides,
	});
}
function ids(results: readonly ToolResultMessage[]) {
	return results.map((result) => result.toolCallId);
}

describe("bounded runtime tool batches", () => {
	it("overlaps safe bodies but commits finish/results in source order", async () => {
		const releaseFirst = gate();
		const secondStarted = gate();
		const events: AgentExecutionEvent[] = [];
		const starts: string[] = [];
		const authorizations: string[] = [];
		const tools = [
			tool("first", async () => {
				starts.push("first");
				await releaseFirst.promise;
				return output("first");
			}),
			tool("second", async () => {
				starts.push("second");
				secondStarted.resolve();
				return output("second");
			}),
		];
		const pending = run(tools, {
			policy: {
				authorize: async ({ call: current }) => {
					authorizations.push(current.id);
				},
			},
			emit: (event) => events.push(event),
		});
		await secondStarted.promise;
		expect(starts).toEqual(["first", "second"]);
		expect(authorizations).toEqual(starts);
		expect(events.filter((event) => event.type === "tool_execution_finish")).toEqual([]);
		releaseFirst.resolve();
		const batch = await pending;
		expect(ids(batch.results)).toEqual(starts);
		expect(events.filter((event) => event.type === "tool_execution_finish").map((event) => event.call.id)).toEqual(
			starts,
		);
	}, 1500);

	it.each([undefined, "exclusive"] as const)("treats %s tools as barriers", async (mode) => {
		const order: string[] = [];
		let active = 0;
		let peak = 0;
		const tools = ["before", "barrier", "after"].map((name) => {
			const entry = tool(name, async () => {
				active += 1;
				peak = Math.max(peak, active);
				order.push(name);
				await Promise.resolve();
				active -= 1;
				return output(name);
			});
			return name === "barrier" ? { ...entry, executionMode: mode } : entry;
		});
		const batch = await run(tools);
		expect(peak).toBe(1);
		expect(order).toEqual(["before", "barrier", "after"]);
		expect(ids(batch.results)).toEqual(order);
	});

	it("bounds in-flight work and does not cross an exclusive barrier", async () => {
		const release = gate();
		const pairStarted = gate();
		const starts: string[] = [];
		let active = 0;
		let peak = 0;
		const tools = ["a", "b", "c", "exclusive", "d"].map((name) =>
			tool(
				name,
				async () => {
					starts.push(name);
					active += 1;
					peak = Math.max(peak, active);
					if (name === "b") pairStarted.resolve();
					if (name === "a" || name === "b") await release.promise;
					if (name === "exclusive") expect(active).toBe(1);
					active -= 1;
					return output(name);
				},
				name === "exclusive" ? "exclusive" : "parallel-safe",
			),
		);
		const pending = run(tools);
		await pairStarted.promise;
		expect(starts).toEqual(["a", "b"]);
		release.resolve();
		await pending;
		expect(peak).toBe(2);
		expect(starts).toEqual(tools.map(({ name }) => name));
	});

	it("supports disabling overlap with a limit of one", async () => {
		let active = 0;
		let peak = 0;
		await run(
			["a", "b"].map((name) =>
				tool(name, async () => {
					active += 1;
					peak = Math.max(peak, active);
					await Promise.resolve();
					active -= 1;
					return output(name);
				}),
			),
			{ maxParallelToolCalls: 1 },
		);
		expect(peak).toBe(1);
	});

	it.each([0, -1, 1.5, Infinity, NaN])("rejects an unsafe concurrency limit %s", async (limit) => {
		await expect(run([], { maxParallelToolCalls: limit })).rejects.toThrow("positive safe integer");
	});

	it("keeps validation/denial/unknown-tool failures without invoking their bodies", async () => {
		const bodies: string[] = [];
		const authorizations: string[] = [];
		const tools = ["invalid", "denied", "allowed"].map((name) =>
			tool(name, async () => {
				bodies.push(name);
				return output(name);
			}),
		);
		tools[0] = { ...tools[0], inputSchema: Type.Object({ required: Type.String() }) };
		const batch = await run(tools, {
			calls: [call("invalid"), call("denied"), call("missing"), call("allowed")],
			policy: {
				authorize: async ({ call: current }) => {
					authorizations.push(current.name);
					if (current.name === "denied") throw new Error("policy denied");
				},
			},
		});
		expect(bodies).toEqual(["allowed"]);
		expect(authorizations).toEqual(["denied", "allowed"]);
		expect(batch.results.map((result) => result.isError)).toEqual([true, true, true, false]);
		expect(ids(batch.results)).toEqual(["invalid", "denied", "missing", "allowed"]);
	});

	it("preserves a failed result alongside a successful parallel result", async () => {
		const batch = await run([
			tool("fails", async () => {
				throw new Error("body failed");
			}),
			tool("ok", async () => output("ok")),
		]);
		expect(batch.results.map((result) => result.isError)).toEqual([true, false]);
		expect(batch.results[0].content).toEqual([{ type: "text", text: "body failed" }]);
	});

	it("drains started results before steering skips only unstarted calls", async () => {
		const starts: string[] = [];
		const steering: UserMessage = { role: "user", content: "change direction", timestamp: 10 };
		const tools = ["a", "b", "c"].map((name) =>
			tool(name, async () => {
				starts.push(name);
				return output(name);
			}),
		);
		const batch = await run(tools, {
			takeSteeringMessages: async ({ messages }) => {
				expect(messages.filter((message) => message.role === "toolResult")).toHaveLength(2);
				return [steering];
			},
		});
		expect(starts).toEqual(["a", "b"]);
		expect(batch.steeringMessages).toEqual([steering]);
		expect(batch.results.map((result) => result.isError)).toEqual([false, false, true]);
		expect(batch.results[2].content).toEqual([{ type: "text", text: "Skipped due to queued user message." }]);
	});

	it("cancels during authorization without dispatching a body or later window", async () => {
		const controller = new AbortController();
		const starts: string[] = [];
		const tools = ["a", "b", "c"].map((name) =>
			tool(name, async () => {
				starts.push(name);
				return output(name);
			}),
		);
		await expect(
			run(tools, {
				signal: controller.signal,
				policy: {
					authorize: async () => {
						controller.abort(new Error("cancelled"));
					},
				},
			}),
		).rejects.toThrow("cancelled");
		expect(starts).toEqual([]);
	});

	it("stops after cancellation of an in-flight window without dispatching the remaining call", async () => {
		const controller = new AbortController();
		const release = gate();
		const pairStarted = gate();
		const starts: string[] = [];
		const events: AgentExecutionEvent[] = [];
		const tools = ["a", "b", "c"].map((name) =>
			tool(name, async (_input, context) => {
				starts.push(name);
				if (name === "b") pairStarted.resolve();
				await release.promise;
				context.onUpdate(output("after cancellation"));
				return output(name);
			}),
		);
		const pending = run(tools, { signal: controller.signal, emit: (event) => events.push(event) });
		const rejected = expect(pending).rejects.toThrow("cancel window");
		await pairStarted.promise;
		controller.abort(new Error("cancel window"));
		release.resolve();
		await rejected;
		expect(starts).toEqual(["a", "b"]);
		expect(events.filter((event) => event.type === "tool_execution_update")).toEqual([]);
	});

	it("does not emit skipped calls if cancellation happens while collecting steering", async () => {
		const controller = new AbortController();
		const events: AgentExecutionEvent[] = [];
		const tools = ["a", "b", "c"].map((name) => tool(name, async () => output(name)));
		await expect(
			run(tools, {
				signal: controller.signal,
				emit: (event) => events.push(event),
				takeSteeringMessages: async () => {
					controller.abort(new Error("cancel while steering"));
					return [{ role: "user", content: "steer", timestamp: 1 }];
				},
			}),
		).rejects.toThrow("cancel while steering");
		expect(events.filter((event) => event.type === "tool_execution_start").map((event) => event.call.id)).toEqual([
			"a",
			"b",
		]);
	});

	it("ignores updates from completed or cancelled tool executions", async () => {
		const controller = new AbortController();
		const events: AgentExecutionEvent[] = [];
		let late = () => {};
		await run(
			[
				tool("a", async (_input, context) => {
					late = () => {
						context.onUpdate(output("late"));
						context.reportPhase("late");
					};
					context.onUpdate(output("valid"));
					return output("done");
				}),
			],
			{ signal: controller.signal, emit: (event) => events.push(event) },
		);
		const before = [...events];
		late();
		controller.abort();
		late();
		expect(events).toEqual(before);
		expect(events.filter((event) => event.type === "tool_execution_update")).toHaveLength(1);
	});
});
