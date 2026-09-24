/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */

import {
	type AssistantMessage,
	EmptyModelResponseError,
	EventStream,
	getAIErrorDetails,
	type ToolResultMessage,
} from "@vetta/ai";
import { type SilentTurnStreamOptions, streamAssistantResponse } from "./loop/assistant-stream.js";
import { AgentContextCheckpointFailure, requestContextCheckpoint } from "./loop/context-checkpoint.js";
import { assertWithinAgentLoopLimit, resolveAgentLoopLimits } from "./loop/limits.js";
import {
	agentRunInput,
	agentRunOutput,
	aggregateCost,
	aggregateUsage,
	countToolCalls,
	getErrorMessage,
	traceAttributes,
} from "./loop/telemetry.js";
import { executeToolCalls } from "./loop/tool-execution.js";
import { isSilentAssistantMessage, silentTurnNudgeMessage } from "./silent-turn.js";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage, StreamFn } from "./types.js";

/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = createAgentStream();

	void (async () => {
		const newMessages: AgentMessage[] = [...prompts];
		const currentContext: AgentContext = {
			...context,
			messages: [...context.messages, ...prompts],
		};

		stream.push({ type: "agent_start" });
		stream.push({ type: "turn_start" });
		for (const prompt of prompts) {
			stream.push({ type: "message_start", message: prompt });
			stream.push({ type: "message_end", message: prompt });
		}

		await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
	})().catch((error) => stream.fail(error));

	return stream;
}

/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 *
 * **Important:** The last message in context must convert to a `user` or `toolResult` message
 * via `convertToLlm`. If it doesn't, the LLM provider will reject the request.
 * This cannot be validated here since `convertToLlm` is only called once per turn.
 */
export function agentLoopContinue(
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const stream = createAgentStream();

	void (async () => {
		const newMessages: AgentMessage[] = [];
		const currentContext: AgentContext = { ...context };

		stream.push({ type: "agent_start" });
		stream.push({ type: "turn_start" });

		await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
	})().catch((error) => stream.fail(error));

	return stream;
}

function createAgentStream(): EventStream<AgentEvent, AgentMessage[]> {
	return new EventStream<AgentEvent, AgentMessage[]>(
		(event) => event.type === "agent_end",
		(event) => (event.type === "agent_end" ? event.messages : []),
	);
}

/** Land a twice-silent turn as an explicit, retriable failure on the message itself. */
function markSilentTurnFailed(message: AssistantMessage, config: AgentLoopConfig): void {
	const failure = getAIErrorDetails(
		new EmptyModelResponseError({ provider: config.model.provider, modelId: config.model.id }),
	);
	message.stopReason = "error";
	message.errorMessage = failure.message;
	message.failure = failure;
}

async function runLoop(
	currentContext: AgentContext,
	newMessages: AgentMessage[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	stream: EventStream<AgentEvent, AgentMessage[]>,
	streamFn?: StreamFn,
): Promise<void> {
	const limits = resolveAgentLoopLimits(config.limits);
	const traceChildren = config.tracing?.detail !== "agent";
	const captureTraceContent = config.tracing?.captureContent === true;
	const agentObservation = config.tracer?.startObservation(
		"agent.run",
		{
			...traceAttributes(config.tracing),
			input: agentRunInput(currentContext, newMessages, config, captureTraceContent),
			metadata: {
				...config.tracing?.metadata,
				model: config.model.id,
				provider: config.model.provider,
				api: config.model.api,
				initialMessageCount: currentContext.messages.length,
				toolCount: currentContext.tools?.length ?? 0,
			},
		},
		{ type: "agent" },
	);
	let firstTurn = true;
	let modelCallCount = 0;
	let toolCallCount = 0;
	let recoveryAttempt = 0;
	let silentTurnRerunAttempted = false;
	let silentRerunActive = false;
	let suppressTurnStart = false;
	let silentRowOpen = false;
	let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

	try {
		while (true) {
			let hasMoreToolCalls = true;
			let steeringAfterTools: AgentMessage[] | null = null;

			while (hasMoreToolCalls || pendingMessages.length > 0) {
				// A silent-turn re-run continues the same logical turn; its boundary
				// events stay suppressed so no duplicate turn appears downstream.
				if (!firstTurn) {
					if (!suppressTurnStart) stream.push({ type: "turn_start" });
				} else firstTurn = false;
				suppressTurnStart = false;

				if (config.getTools) currentContext.tools = config.getTools();
				if (config.getSystemPrompt) currentContext.systemPrompt = config.getSystemPrompt();

				if (pendingMessages.length > 0) {
					for (const message of pendingMessages) {
						stream.push({ type: "message_start", message });
						stream.push({ type: "message_end", message });
						currentContext.messages.push(message);
						newMessages.push(message);
					}
					pendingMessages = [];
				}

				modelCallCount += 1;
				if (limits.maxModelCalls !== undefined) {
					assertWithinAgentLoopLimit("model_calls", modelCallCount, limits.maxModelCalls);
				}
				const silentTurn: SilentTurnStreamOptions | undefined = silentRerunActive
					? {
							reuseRow: silentRowOpen,
							keepOpenOnEmpty: true,
							markEmptyReply: (reply) => markSilentTurnFailed(reply, config),
							extraMessages: [silentTurnNudgeMessage()],
						}
					: !silentTurnRerunAttempted && config.allowSilentCompletion !== true
						? { keepOpenOnEmpty: true }
						: undefined;
				silentRerunActive = false;
				const message = await streamAssistantResponse(
					currentContext,
					config,
					signal,
					stream,
					streamFn,
					traceChildren ? agentObservation : undefined,
					limits,
					silentTurn,
				);
				newMessages.push(message);
				silentRowOpen = silentTurn?.rowOpen ?? false;

				if (message.stopReason === "aborted") {
					stream.push({ type: "turn_end", message, toolResults: [] });
					stream.push({ type: "agent_end", messages: newMessages });
					stream.end(newMessages);
					return;
				}

				if (isSilentAssistantMessage(message) && config.allowSilentCompletion !== true) {
					if (!silentTurnRerunAttempted) {
						// Re-run an invisible answer once before surfacing a finished turn.
						// The empty assistant message is dropped from both message lists;
						// the re-run reuses the same bubble, so the transcript keeps one row.
						silentTurnRerunAttempted = true;
						if (currentContext.messages.at(-1) === message) currentContext.messages.pop();
						if (newMessages.at(-1) === message) newMessages.pop();
						silentRerunActive = true;
						suppressTurnStart = true;
						hasMoreToolCalls = true;
						continue;
					}
					// The re-run already landed as an explicit EMPTY_MODEL_RESPONSE
					// error via markEmptyReply; fall through to the error path.
				}

				if (message.stopReason === "error") {
					stream.push({ type: "turn_end", message, toolResults: [] });
					if (config.contextCheckpoints) {
						const recovery = await requestContextCheckpoint(
							"assistant_error",
							currentContext.messages,
							recoveryAttempt,
							stream,
							{ signal, timeoutMs: limits.contextCheckpointTimeoutMs },
							message,
						);
						if (recovery?.retry) {
							recoveryAttempt += 1;
							currentContext.messages = [...(recovery.contextMessages ?? recovery.messages)];
							pendingMessages = (await config.getSteeringMessages?.()) || [];
							continue;
						}
					}
					stream.push({ type: "agent_end", messages: newMessages });
					stream.end(newMessages);
					return;
				}

				const toolCalls = message.content.filter((content) => content.type === "toolCall");
				toolCallCount += toolCalls.length;
				if (limits.maxToolCalls !== undefined) {
					assertWithinAgentLoopLimit("tool_calls", toolCallCount, limits.maxToolCalls);
				}
				hasMoreToolCalls = toolCalls.length > 0;
				const toolResults: ToolResultMessage[] = [];
				if (hasMoreToolCalls) {
					const toolExecution = await executeToolCalls(
						currentContext.tools,
						currentContext.messages,
						message,
						signal,
						stream,
						config.getSteeringMessages,
						traceChildren ? agentObservation : undefined,
						config.tracing,
					);
					toolResults.push(...toolExecution.toolResults);
					steeringAfterTools = toolExecution.steeringMessages ?? null;
					for (const result of toolResults) {
						currentContext.messages.push(result);
						newMessages.push(result);
					}
				}

				stream.push({ type: "turn_end", message, toolResults });
				if (signal?.aborted) {
					stream.push({ type: "agent_end", messages: newMessages });
					stream.end(newMessages);
					return;
				}

				if (!hasMoreToolCalls && config.contextCheckpoints) {
					const result = await requestContextCheckpoint(
						"assistant_result",
						currentContext.messages,
						recoveryAttempt,
						stream,
						{ signal, timeoutMs: limits.contextCheckpointTimeoutMs },
						message,
					);
					if (result?.contextMessages) currentContext.messages = [...result.contextMessages];
					if (result?.retry) {
						recoveryAttempt += 1;
						currentContext.messages = [...(result.contextMessages ?? result.messages)];
						pendingMessages = (await config.getSteeringMessages?.()) || [];
						hasMoreToolCalls = true;
						continue;
					}
				}

				if (steeringAfterTools && steeringAfterTools.length > 0) {
					pendingMessages = steeringAfterTools;
					steeringAfterTools = null;
				} else {
					pendingMessages = (await config.getSteeringMessages?.()) || [];
				}
			}

			const continuationMessages =
				(await config.getContinuationMessages?.([...currentContext.messages], signal)) || [];
			if (continuationMessages.length > 0) {
				pendingMessages = continuationMessages;
				continue;
			}
			break;
		}

		stream.push({ type: "agent_end", messages: newMessages });
		stream.end(newMessages);
	} catch (error) {
		agentObservation?.update({ level: "ERROR", statusMessage: getErrorMessage(error) });
		if (error instanceof AgentContextCheckpointFailure) {
			stream.push({ type: "agent_end", messages: newMessages });
			stream.end(newMessages);
			return;
		}
		throw error;
	} finally {
		agentObservation?.end({
			output: agentRunOutput(newMessages, captureTraceContent),
			usageDetails: aggregateUsage(newMessages),
			costDetails: aggregateCost(newMessages),
			metadata: {
				messageCount: newMessages.length,
				assistantMessageCount: newMessages.filter((message) => message.role === "assistant").length,
				toolResultCount: newMessages.filter((message) => message.role === "toolResult").length,
				toolCallCount: countToolCalls(newMessages),
			},
		});
		config.tracer?.flush?.().catch(() => undefined);
	}
}
