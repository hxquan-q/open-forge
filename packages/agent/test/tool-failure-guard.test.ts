// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import {
	type AssistantMessage,
	LanguageModelStream,
	type Message,
	type ModelStreamResponse,
	type ToolCall,
} from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { runAgentTurn } from "../src/engine/run-agent-turn.js";
import { executeRuntimeToolCalls } from "../src/engine/tool-executor.js";
import {
	AGENT_TOOL_CALL_STOPPED,
	canonicalToolArguments,
	createToolFailureGuard,
	ToolFailureGuard,
} from "../src/engine/tool-failure-guard.js";
import type {
	AgentExecutionEvent,
	AgentTurnRequest,
	ResolvedModelCall,
	RuntimeToolDefinition,
	RuntimeToolResult,
} from "../src/engine/types.js";

const brokenInput = { action: "click", elementRef: "e1" };

function fail(guard: ToolFailureGuard, times: number, code = "invalid_input", args: unknown = brokenInput): void {
	for (let index = 0; index < times; index += 1) {
		guard.recordResult("browser_tab", args, { isError: true, code });
	}
}

describe("ToolFailureGuard", () => {
	it("相同工具 + 相同参数 + 相同确定性错误连续 3 次后止损", () => {
		const guard = createToolFailureGuard();
		fail(guard, 2);
		expect(guard.check("browser_tab", brokenInput)).toEqual({ blocked: false });

		fail(guard, 1);
		const verdict = guard.check("browser_tab", brokenInput);
		expect(verdict.blocked).toBe(true);
		if (!verdict.blocked) return;
		expect(verdict.attempts).toBe(3);
		expect(verdict.code).toBe("invalid_input");
		expect(verdict.message).toContain("failed 3 times in a row");
	});

	it("改参数即恢复：只有完全相同的调用才被止损", () => {
		const guard = createToolFailureGuard();
		fail(guard, 3);
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(true);
		expect(guard.check("browser_tab", { action: "snapshot" }).blocked).toBe(false);
		expect(guard.check("browser_tab", { action: "click", elementRef: "v1:3:e1" }).blocked).toBe(false);
		expect(guard.check("other_tool", brokenInput).blocked).toBe(false);
	});

	it("参数键顺序不影响判定", () => {
		const guard = createToolFailureGuard();
		fail(guard, 3, "invalid_input", { action: "fill", elementRef: "e1", value: "hi" });
		expect(guard.check("browser_tab", { value: "hi", elementRef: "e1", action: "fill" }).blocked).toBe(true);
		expect(canonicalToolArguments({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe('{"a":[2,{"c":3,"d":4}],"b":1}');
	});

	it("成功与非确定性错误清空连续计数", () => {
		const success = createToolFailureGuard();
		fail(success, 2);
		success.recordResult("browser_tab", brokenInput, { isError: false });
		fail(success, 2);
		expect(success.check("browser_tab", brokenInput).blocked).toBe(false);

		const transient = createToolFailureGuard();
		fail(transient, 2);
		transient.recordResult("browser_tab", brokenInput, { isError: true, code: "stale_reference" });
		fail(transient, 2);
		expect(transient.check("browser_tab", brokenInput).blocked).toBe(false);
	});

	it("错误码变化重新计数，止损结果本身不清账", () => {
		const guard = createToolFailureGuard();
		fail(guard, 2, "invalid_input");
		fail(guard, 1, "policy_denied");
		fail(guard, 1, "invalid_input");
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(false);

		fail(guard, 2);
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(true);
		guard.recordResult("browser_tab", brokenInput, { isError: true, code: AGENT_TOOL_CALL_STOPPED });
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(true);
	});

	it("阈值下限为 2，stats 反映记账规模", () => {
		const guard = new ToolFailureGuard({ threshold: 1 });
		fail(guard, 1);
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(false);
		fail(guard, 1);
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(true);
		expect(guard.stats()).toEqual({ tracked: 1, stopped: 1 });
	});

	it("白名单可替换，未列入的错误码不计入", () => {
		const guard = new ToolFailureGuard({ deterministicCodes: ["invalid_input"], threshold: 2 });
		fail(guard, 2, "policy_denied");
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(false);
		fail(guard, 2, "invalid_input");
		expect(guard.check("browser_tab", brokenInput).blocked).toBe(true);
	});
});

function toolCall(options: { readonly id: string; readonly arguments: Record<string, unknown> }): ToolCall {
	return { type: "toolCall", id: options.id, name: "browser_tab", arguments: options.arguments };
}

function failingTool(): { readonly tool: RuntimeToolDefinition; executions: () => number } {
	let executions = 0;
	const tool: RuntimeToolDefinition = {
		name: "browser_tab",
		description: "browser_tab",
		inputSchema: Type.Object({}, { additionalProperties: true }),
		async execute(): Promise<RuntimeToolResult> {
			executions += 1;
			return {
				content: [{ type: "text", text: "invalid_input: elementRef must be the opaque token" }],
				details: { ok: false, code: "invalid_input" },
				isError: true,
			};
		},
	};
	return { tool, executions: () => executions };
}

function runWith(
	tool: RuntimeToolDefinition,
	calls: readonly ToolCall[],
	failureGuard: ToolFailureGuard,
): ReturnType<typeof executeRuntimeToolCalls> {
	return executeRuntimeToolCalls({
		calls,
		tools: [tool],
		messages: [],
		modelCallIndex: 0,
		signal: new AbortController().signal,
		policy: { authorize: async () => undefined },
		emit: () => undefined,
		failureGuard,
	});
}

describe("executeRuntimeToolCalls 与止损", () => {
	it("相同失败连续 3 次后停止自动重试，返回 AGENT_TOOL_CALL_STOPPED", async () => {
		const guard = createToolFailureGuard();
		const { tool, executions } = failingTool();

		for (const id of ["c1", "c2", "c3"]) {
			const attempt = await runWith(tool, [toolCall({ id, arguments: brokenInput })], guard);
			expect(attempt.results[0]?.details).toMatchObject({ code: "invalid_input" });
		}
		expect(executions()).toBe(3);

		const stopped = await runWith(tool, [toolCall({ id: "c4", arguments: brokenInput })], guard);
		expect(executions()).toBe(3);
		expect(stopped.results[0]?.isError).toBe(true);
		expect(stopped.results[0]?.details).toMatchObject({
			code: AGENT_TOOL_CALL_STOPPED,
			stoppedErrorCode: "invalid_input",
			attempts: 3,
		});
		expect(String((stopped.results[0]?.content[0] as { text: string }).text)).toContain("Change the arguments");
	});

	it("改参数后恢复执行", async () => {
		const guard = createToolFailureGuard();
		const { tool, executions } = failingTool();

		for (const id of ["c1", "c2", "c3"]) {
			await runWith(tool, [toolCall({ id, arguments: brokenInput })], guard);
		}
		await runWith(tool, [toolCall({ id: "c4", arguments: brokenInput })], guard);
		expect(executions()).toBe(3);

		const changed = await runWith(tool, [toolCall({ id: "c5", arguments: { action: "snapshot" } })], guard);
		expect(changed.results[0]?.details).toMatchObject({ code: "invalid_input" });
		expect(executions()).toBe(4);
	});

	it("缺省不启用止损（runAgentTurn 之外的直接调用）", async () => {
		const { tool, executions } = failingTool();
		for (let index = 0; index < 4; index += 1) {
			await executeRuntimeToolCalls({
				calls: [toolCall({ id: `c${index}`, arguments: brokenInput })],
				tools: [tool],
				messages: [],
				modelCallIndex: 0,
				signal: new AbortController().signal,
				policy: { authorize: async () => undefined },
				emit: () => undefined,
			});
		}
		expect(executions()).toBe(4);
	});
});

function modelToolCall(id: string, args: Record<string, unknown>): ToolCall {
	return { type: "toolCall", id, name: "browser_tab", arguments: args };
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: "stop" | "toolUse" = "stop",
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

function streamResponse(message: AssistantMessage): ModelStreamResponse {
	const stream = new LanguageModelStream();
	stream.push({ type: "start", partial: message });
	stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message });
	return { events: stream, result: stream.result() };
}

function engineRequest(tool: RuntimeToolDefinition, responses: readonly ModelStreamResponse[]): AgentTurnRequest {
	let index = 0;
	return {
		messages: [{ role: "user", content: "start", timestamp: 1 } satisfies Message],
		resolveModelCall: async (): Promise<ResolvedModelCall> => {
			const response = responses[index];
			if (!response) throw new Error(`No response at index ${index}`);
			index += 1;
			return { callId: `call-${index}`, snapshotId: `snapshot-${index}`, response };
		},
		resolveTools: async () => [tool],
		toolPolicy: { authorize: async () => undefined },
		limits: { maxModelCalls: 10, maxToolCalls: 10, maxRecoveryAttempts: 2, checkpointTimeoutMs: 50 },
		signal: new AbortController().signal,
	};
}

async function collect(events: AsyncIterable<AgentExecutionEvent>): Promise<AgentExecutionEvent[]> {
	const collected: AgentExecutionEvent[] = [];
	for await (const event of events) collected.push(event);
	return collected;
}

describe("runAgentTurn 每回合重置止损", () => {
	it("同回合第 4 次相同调用被止损，新回合恢复执行", async () => {
		const { tool, executions } = failingTool();
		const repeated = (id: string) => streamResponse(assistantMessage([modelToolCall(id, brokenInput)], "toolUse"));

		const first = runAgentTurn(
			engineRequest(tool, [
				repeated("c1"),
				repeated("c2"),
				repeated("c3"),
				repeated("c4"),
				streamResponse(assistantMessage([{ type: "text", text: "done" }])),
			]),
		);
		await collect(first.events);
		const firstResult = await first.result;

		expect(firstResult.status).toBe("completed");
		expect(firstResult.modelCalls).toBe(5);
		expect(executions()).toBe(3);
		const stopped = firstResult.messages.filter(
			(message) =>
				message.role === "toolResult" && (message.details as { code?: string })?.code === AGENT_TOOL_CALL_STOPPED,
		);
		expect(stopped).toHaveLength(1);

		const second = runAgentTurn(
			engineRequest(tool, [
				repeated("d1"),
				streamResponse(assistantMessage([{ type: "text", text: "fresh turn" }])),
			]),
		);
		await collect(second.events);
		const secondResult = await second.result;

		expect(secondResult.status).toBe("completed");
		expect(executions()).toBe(4);
		expect(
			secondResult.messages.some(
				(message) =>
					message.role === "toolResult" &&
					(message.details as { code?: string })?.code === AGENT_TOOL_CALL_STOPPED,
			),
		).toBe(false);
	});
});
