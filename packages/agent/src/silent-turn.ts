// Copyright The Open Forge contributors.
import type { AssistantMessage, Message } from "@vetta/ai";

/**
 * Appended to the model-call message view for one automatic re-run after a
 * turn that produced nothing the user can see. Two shapes were observed: a
 * wholly empty response, and a finished conclusion written into reasoning
 * while the visible text stayed empty. The same nudge covers both, because
 * both need the same next move.
 *
 * It travels as a synthetic trailing user message rather than a system-prompt
 * mutation: the agent engine reaches the provider context only through the
 * per-call message view, and keeping it out of `state.messages` /
 * `context.messages` leaves the durable transcript untouched.
 */
export const SILENT_TURN_NUDGE = [
	"<no_output_recovery>",
	"Your previous turn ended with no visible text and no tool call, so the user saw nothing happen.",
	"Your reasoning is never shown to the user. If you already reached the answer, state it now in plain text.",
	"Otherwise continue the unfinished work, starting with one sentence about what you are doing.",
	"</no_output_recovery>",
].join("\n");

/**
 * A completed turn that gave the user nothing to see: a successful stop
 * reason, no tool calls, and no visible text. Reasoning-only replies count as
 * silent — thinking is never rendered as the answer. Failed and aborted
 * messages are never silent turns.
 */
export function isSilentAssistantMessage(message: AssistantMessage): boolean {
	if (message.stopReason === "error" || message.stopReason === "aborted") return false;
	if (message.content.some((block) => block.type === "toolCall")) return false;
	const text = message.content
		.flatMap((block) => (block.type === "text" ? [block.text] : []))
		.join("")
		.trim();
	return text.length === 0;
}

/** Synthetic trailing user message injected into the model-call view for the one re-run. */
export function silentTurnNudgeMessage(): Message {
	return { role: "user", content: SILENT_TURN_NUDGE, timestamp: Date.now() };
}
