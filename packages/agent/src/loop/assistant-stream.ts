import { type AssistantMessage, type Context, type EventStream, type Message, streamSimple } from "@vetta/ai";
import { salvageTextToolCalls } from "../salvage-text-tool-calls.js";
import { isSilentAssistantMessage } from "../silent-turn.js";
import type { AgentObservation, AgentObservationUpdate } from "../telemetry.js";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage, StreamFn } from "../types.js";
import { requestContextCheckpoint } from "./context-checkpoint.js";
import type { ResolvedAgentLoopLimits } from "./limits.js";
import {
	assistantTelemetryUpdate,
	generationInput,
	getErrorMessage,
	telemetryModelParameters,
	traceAttributes,
} from "./telemetry.js";

/**
 * Silent-turn re-run plumbing for one automatic retry of an empty model reply.
 * `keepOpenOnEmpty` suppresses the terminal message events of an empty reply so
 * the bubble stays open for the re-run; `reuseRow` makes the re-run adopt the
 * established row instead of opening a second one; `extraMessages` carries the
 * one-shot recovery nudge into the model-call view only. On the re-run call,
 * `markEmptyReply` marks a second empty reply before its row closes so the
 * terminal event lands an explicit error; `rowOpen` is written back by the
 * keep-open call so the caller knows whether a row was ever started.
 */
export interface SilentTurnStreamOptions {
	readonly keepOpenOnEmpty?: boolean;
	readonly reuseRow?: boolean;
	readonly extraMessages?: readonly Message[];
	readonly markEmptyReply?: (message: AssistantMessage) => void;
	rowOpen?: boolean;
}

export async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	stream: EventStream<AgentEvent, AgentMessage[]>,
	streamFn?: StreamFn,
	traceParent?: AgentObservation,
	limits?: ResolvedAgentLoopLimits,
	silentTurn?: SilentTurnStreamOptions,
): Promise<AssistantMessage> {
	if (config.resolveCallContext) {
		signal?.throwIfAborted();
		const resolved = await config.resolveCallContext(
			{ systemPrompt: context.systemPrompt, messages: context.messages, tools: context.tools },
			signal,
		);
		context.systemPrompt = resolved.systemPrompt;
		context.tools = resolved.tools ? [...resolved.tools] : undefined;
	}

	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	if (config.contextCheckpoints) {
		if (!limits) throw new Error("Agent loop limits are required for context checkpoints");
		const prepared = await requestContextCheckpoint("model_call", messages, 0, stream, {
			signal,
			timeoutMs: limits.contextCheckpointTimeoutMs,
		});
		if (prepared) {
			messages = [...prepared.messages];
			if (prepared.contextMessages) context.messages = [...prepared.contextMessages];
		}
	}

	const llmMessages = await config.convertToLlm(messages);
	if (silentTurn?.extraMessages?.length) llmMessages.push(...silentTurn.extraMessages);
	const llmContext: Context = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools,
	};

	const streamFunction = streamFn || streamSimple;
	await config.modelCallLifecycle?.prepared(llmContext, signal);
	let failureReported = false;
	const generationObservation = traceParent?.startObservation(
		`llm.${config.model.provider}.${config.model.id}`,
		{
			...traceAttributes(config.tracing),
			input: generationInput(llmContext, messages, config.tracing?.captureContent === true),
			model: config.model.id,
			modelParameters: telemetryModelParameters(config),
			metadata: {
				api: config.model.api,
				provider: config.model.provider,
				messageCount: llmMessages.length,
				toolCount: context.tools?.length ?? 0,
			},
		},
		{ type: "generation" },
	);
	let generationEnded = false;
	const endGeneration = (update: AgentObservationUpdate) => {
		if (generationEnded) return;
		generationEnded = true;
		generationObservation?.end(update);
	};

	try {
		const resolvedApiKey =
			(config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;
		const response = await streamFunction(config.model, llmContext, { ...config, apiKey: resolvedApiKey, signal });

		let partialMessage: AssistantMessage | null = null;
		let addedPartial = false;
		const finishModelMessage = async (finalMessage: AssistantMessage): Promise<AssistantMessage> => {
			if (addedPartial) context.messages[context.messages.length - 1] = finalMessage;
			else context.messages.push(finalMessage);
			if (!addedPartial) stream.push({ type: "message_start", message: { ...finalMessage } });
			stream.push({ type: "message_end", message: finalMessage });
			failureReported = await reportModelCallTerminal(config, llmContext, finalMessage, signal);
			endGeneration(assistantTelemetryUpdate(finalMessage, config.tracing?.captureContent === true));
			return finalMessage;
		};

		for await (const event of response) {
			switch (event.type) {
				case "start":
					partialMessage = event.partial;
					if (addedPartial) {
						// A restarted provider attempt reuses the established bubble.
						context.messages[context.messages.length - 1] = partialMessage;
						stream.push({
							type: "message_update",
							assistantMessageEvent: event,
							message: { ...partialMessage },
						});
					} else if (silentTurn?.reuseRow) {
						// Silent-turn re-run: the bubble opened by the empty attempt stays
						// the message row; this attempt only refreshes its content.
						context.messages.push(partialMessage);
						addedPartial = true;
						stream.push({
							type: "message_update",
							assistantMessageEvent: event,
							message: { ...partialMessage },
						});
					} else {
						context.messages.push(partialMessage);
						addedPartial = true;
						stream.push({ type: "message_start", message: { ...partialMessage } });
					}
					break;
				case "text_start":
				case "text_delta":
				case "text_end":
				case "thinking_start":
				case "thinking_delta":
				case "thinking_end":
				case "toolcall_start":
				case "toolcall_delta":
				case "toolcall_end":
					if (partialMessage) {
						partialMessage = event.partial;
						context.messages[context.messages.length - 1] = partialMessage;
						stream.push({ type: "message_update", assistantMessageEvent: event, message: { ...partialMessage } });
					}
					break;
				case "retry":
					// Provider retry activity rides on the in-flight message; it is
					// lightweight activity state, never a new message row.
					if (partialMessage) {
						stream.push({
							type: "message_update",
							assistantMessageEvent: event,
							message: { ...partialMessage },
						});
					}
					break;
				case "done": {
					const finalMessage = await response.result();
					if (config.salvageTextToolCalls?.length) {
						salvageTextToolCalls(finalMessage, llmContext.tools, config.salvageTextToolCalls);
					}
					if (isSilentAssistantMessage(finalMessage) && silentTurn?.keepOpenOnEmpty) {
						if (silentTurn.markEmptyReply) {
							// The re-run came back silent too: mark the failure on the message
							// and close the row through the normal terminal path.
							silentTurn.markEmptyReply(finalMessage);
							return await finishModelMessage(finalMessage);
						}
						// Hold the bubble open: the re-run streams into this same row, so
						// a recovered turn leaves no empty message behind in the
						// transcript and the user never learns it happened. rowOpen records
						// whether this attempt actually emitted message_start.
						silentTurn.rowOpen = addedPartial;
						if (addedPartial) context.messages[context.messages.length - 1] = finalMessage;
						else context.messages.push(finalMessage);
						failureReported = await reportModelCallTerminal(config, llmContext, finalMessage, signal);
						endGeneration(assistantTelemetryUpdate(finalMessage, config.tracing?.captureContent === true));
						return finalMessage;
					}
					return await finishModelMessage(finalMessage);
				}
				case "error": {
					// The error event is the durable provider-facing message. The result
					// promise may reject as well, so waiting for it here would lose the
					// only message that can be shown and persisted by the host.
					return await finishModelMessage(event.error);
				}
			}
		}

		const finalMessage = await response.result();
		failureReported = await reportModelCallTerminal(config, llmContext, finalMessage, signal);
		endGeneration(assistantTelemetryUpdate(finalMessage, config.tracing?.captureContent === true));
		return finalMessage;
	} catch (error) {
		if (!failureReported) await config.modelCallLifecycle?.failed(llmContext, error, signal);
		endGeneration({ level: "ERROR", statusMessage: getErrorMessage(error) });
		throw error;
	}
}

async function reportModelCallTerminal(
	config: AgentLoopConfig,
	context: Readonly<Context>,
	message: Readonly<AssistantMessage>,
	signal: AbortSignal | undefined,
): Promise<boolean> {
	if (message.stopReason === "error" || message.stopReason === "aborted") {
		await config.modelCallLifecycle?.failed(context, message, signal);
		return true;
	}
	await config.modelCallLifecycle?.completed(context, message, signal);
	return false;
}
