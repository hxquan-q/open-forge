// Modified by The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import type { Message, ToolCall, ToolResultMessage } from "@vetta/ai";
import { AgentToolExecutionError } from "../tool-execution-error.js";
import type {
	AgentExecutionEvent,
	AgentInputCollector,
	AgentToolPhase,
	AgentToolPolicy,
	RuntimeToolDefinition,
	RuntimeToolResult,
} from "./types.js";

interface ExecuteToolCallsRequest {
	readonly calls: readonly ToolCall[];
	readonly maxParallelToolCalls?: number;
	readonly tools: readonly RuntimeToolDefinition[];
	readonly messages: readonly Message[];
	readonly modelCallIndex: number;
	readonly signal: AbortSignal;
	readonly policy: AgentToolPolicy;
	readonly emit: (event: AgentExecutionEvent) => void;
	readonly takeSteeringMessages?: AgentInputCollector;
}

export interface ToolExecutionBatchResult {
	readonly results: readonly ToolResultMessage[];
	readonly steeringMessages?: readonly Message[];
}

interface PreparedToolCall {
	readonly call: ToolCall;
	readonly startedAt: number;
	readonly phases: AgentToolPhase[];
	readonly execute: () => Promise<ToolResultMessage>;
}

type ToolOutcome =
	| {
			readonly ok: true;
			readonly prepared: PreparedToolCall;
			readonly result: ToolResultMessage;
			readonly durationMs: number;
	  }
	| { readonly ok: false; readonly error: unknown };

export async function executeRuntimeToolCalls(request: ExecuteToolCallsRequest): Promise<ToolExecutionBatchResult> {
	const limit = request.maxParallelToolCalls ?? 4;
	if (!Number.isSafeInteger(limit) || limit < 1)
		throw new RangeError("maxParallelToolCalls must be a positive safe integer");
	const results: ToolResultMessage[] = [];
	let next = 0;
	while (next < request.calls.length) {
		request.signal.throwIfAborted();
		const size = batchSize(request, next, limit);
		const pending: Promise<ToolOutcome>[] = [];
		// Preflight/authorization is ordered. Only explicitly safe bodies overlap.
		for (let count = 0; count < size; count += 1) {
			request.signal.throwIfAborted();
			const prepared = await prepareToolCall(request.calls[next], request);
			request.signal.throwIfAborted();
			pending.push(
				prepared.execute().then(
					(result): ToolOutcome => ({ ok: true, prepared, result, durationMs: Date.now() - prepared.startedAt }),
					(error: unknown): ToolOutcome => ({ ok: false, error }),
				),
			);
			next += 1;
		}
		for (const completion of pending) {
			const outcome = await completion;
			request.signal.throwIfAborted();
			if (!outcome.ok) throw outcome.error;
			const { prepared, result, durationMs } = outcome;
			request.emit({
				type: "tool_execution_finish",
				call: prepared.call,
				result,
				startedAt: prepared.startedAt,
				durationMs,
				phases: [...prepared.phases],
			});
			results.push(result);
		}
		// Already-started calls have real results; only unstarted calls may be skipped.
		const steeringMessages = await request.takeSteeringMessages?.({
			modelCallIndex: request.modelCallIndex + 1,
			messages: [...request.messages, ...results],
			signal: request.signal,
		});
		request.signal.throwIfAborted();
		if (steeringMessages && steeringMessages.length > 0) {
			for (const skippedCall of request.calls.slice(next)) results.push(skipToolCall(skippedCall, request.emit));
			return { results, steeringMessages };
		}
	}
	return { results };
}

function batchSize(request: ExecuteToolCallsRequest, start: number, limit: number): number {
	let size = 0;
	while (size < limit && start + size < request.calls.length) {
		const call = request.calls[start + size];
		if (request.tools.find((tool) => tool.name === call.name)?.executionMode !== "parallel-safe") break;
		size += 1;
	}
	return Math.max(1, size);
}

async function prepareToolCall(call: ToolCall, request: ExecuteToolCallsRequest): Promise<PreparedToolCall> {
	const startedAt = Date.now();
	const phases: AgentToolPhase[] = [];
	const tool = request.tools.find((candidate) => candidate.name === call.name);
	const validation = tool
		? validateToolInput(tool, call)
		: { valid: false as const, error: `Tool ${call.name} not found` };
	request.emit(
		validation.valid
			? { type: "tool_validation", call, valid: true }
			: { type: "tool_validation", call, valid: false, error: validation.error },
	);
	request.emit({ type: "tool_execution_start", call, startedAt });
	if (!tool || !validation.valid) {
		const result = toolError(
			call,
			!validation.valid ? validation.error : `Tool ${call.name} not found`,
			tool ? "AGENT_TOOL_INPUT_INVALID" : "AGENT_TOOL_NOT_FOUND",
		);
		return { call, startedAt, phases, execute: async () => result };
	}
	try {
		await request.policy.authorize({
			call,
			tool,
			modelCallIndex: request.modelCallIndex,
			messages: request.messages,
			signal: request.signal,
		});
		request.signal.throwIfAborted();
	} catch (error) {
		request.signal.throwIfAborted();
		const result = toolError(
			call,
			error instanceof Error ? error.message : "Tool execution failed",
			"AGENT_TOOL_EXECUTION_FAILED",
			error instanceof AgentToolExecutionError ? error.details : undefined,
		);
		return { call, startedAt, phases, execute: async () => result };
	}
	return {
		call,
		startedAt,
		phases,
		execute: () => executeValidatedTool(call, tool, validation.input, request, startedAt, phases),
	};
}

async function executeValidatedTool(
	call: ToolCall,
	tool: RuntimeToolDefinition,
	input: unknown,
	request: ExecuteToolCallsRequest,
	startedAt: number,
	phases: AgentToolPhase[],
): Promise<ToolResultMessage> {
	let acceptingUpdates = true;
	try {
		request.signal.throwIfAborted();
		const executed = await tool.execute(input, {
			toolCallId: call.id,
			messages: request.messages,
			signal: request.signal,
			onUpdate: (update: RuntimeToolResult) => {
				if (acceptingUpdates && !request.signal.aborted)
					request.emit({ type: "tool_execution_update", call, update });
			},
			reportPhase: (label) => {
				if (!acceptingUpdates || request.signal.aborted) return;
				const phase = { label, atMs: Date.now() - startedAt };
				phases.push(phase);
				request.emit({ type: "tool_execution_phase", call, phase });
			},
		});
		return {
			role: "toolResult",
			toolCallId: call.id,
			toolName: call.name,
			content: [...executed.content],
			details: executed.details,
			isError: executed.isError === true,
			timestamp: Date.now(),
		};
	} catch (error) {
		request.signal.throwIfAborted();
		return toolError(
			call,
			error instanceof Error ? error.message : "Tool execution failed",
			"AGENT_TOOL_EXECUTION_FAILED",
			error instanceof AgentToolExecutionError ? error.details : undefined,
		);
	} finally {
		acceptingUpdates = false;
	}
}

function validateToolInput(
	tool: RuntimeToolDefinition,
	call: ToolCall,
): { readonly valid: true; readonly input: unknown } | { readonly valid: false; readonly error: string } {
	try {
		if (tool.validateInput) return { valid: true, input: tool.validateInput(call.arguments) };
		const errors = [...Value.Errors(tool.inputSchema, call.arguments)];
		if (errors.length > 0) {
			return {
				valid: false,
				error: errors.map((error) => `${error.path || "/"}: ${error.message}`).join("; "),
			};
		}
		return { valid: true, input: Value.Decode(tool.inputSchema, call.arguments) };
	} catch (error) {
		return { valid: false, error: error instanceof Error ? error.message : "Tool input validation failed" };
	}
}

function skipToolCall(call: ToolCall, emit: (event: AgentExecutionEvent) => void): ToolResultMessage {
	const startedAt = Date.now();
	const result = toolError(call, "Skipped due to queued user message.", "AGENT_TOOL_SKIPPED", {});
	emit({ type: "tool_execution_start", call, startedAt });
	emit({ type: "tool_execution_finish", call, result, startedAt, durationMs: 0, phases: [] });
	return result;
}

function toolError(call: ToolCall, message: string, code: string, details?: unknown): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: call.id,
		toolName: call.name,
		content: [{ type: "text", text: message }],
		details: details ?? { code },
		isError: true,
		timestamp: Date.now(),
	};
}
