import { type AIErrorDetails, AIStreamProtocolError } from "./errors.js";
import type { FailedStopReason, SuccessfulStopReason } from "./finish-reason.js";
import type { AssistantMessage } from "./message.js";
import type { ToolCall } from "./tool.js";

export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| AssistantMessageRetryEvent
	| AssistantMessageDoneEvent
	| AssistantMessageErrorEvent;

/** Retry budget track claimed by a provider retry attempt. */
export type ProviderRetryReason = "rate_limit" | "transient";

/**
 * Provider retry activity for the in-flight assistant call. It is emitted
 * between attempts of the same logical call: consumers must keep the current
 * assistant message identity and surface this as lightweight activity, never
 * as a new message row.
 */
export interface AssistantMessageRetryEvent {
	type: "retry";
	/** Budget track claimed by the upcoming attempt. */
	reason: ProviderRetryReason;
	/** 1-based retry count already consumed from this track. */
	attempt: number;
	/** Per-track retry budget configured for this call; `0` means unbounded. */
	maxAttempts: number;
	/** Delay in milliseconds before the next attempt starts. */
	delayMs: number;
	/** Human-readable summary of the failure that triggered the retry. */
	errorMessage: string;
	/** Structured failure details when available. */
	failure?: AIErrorDetails;
}

export interface AssistantMessageDoneEvent {
	type: "done";
	reason: SuccessfulStopReason;
	message: AssistantMessage;
}

export interface AssistantMessageErrorEvent {
	type: "error";
	reason: FailedStopReason;
	error: AssistantMessage;
	/** Native adapters preserve structured failure data for in-process consumers. */
	failure?: AIErrorDetails;
}

export type AssistantMessageTerminalEvent = AssistantMessageDoneEvent | AssistantMessageErrorEvent;

export function isAssistantMessageTerminalEvent(event: AssistantMessageEvent): event is AssistantMessageTerminalEvent {
	return event.type === "done" || event.type === "error";
}

export function getAssistantMessageEventResult(event: AssistantMessageEvent): AssistantMessage {
	if (event.type === "done") return event.message;
	if (event.type === "error") {
		return event.failure === undefined ? event.error : { ...event.error, failure: event.failure };
	}
	throw new AIStreamProtocolError(`Expected a terminal assistant message event, received: ${event.type}`, {
		metadata: { eventType: event.type },
	});
}
