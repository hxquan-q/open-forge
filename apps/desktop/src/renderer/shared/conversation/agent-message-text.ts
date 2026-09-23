// Copyright The Open Forge contributors.
import type { ConversationAgentMessageViewModel } from "./types";

/** Join assistant text blocks the same way history replay used to accumulate `text`. */
export function joinAgentTextBlocks(blocks: readonly { readonly type: string; readonly text?: string }[]): string {
	const parts = blocks.flatMap((block) =>
		block.type === "text" && typeof block.text === "string" && block.text.length > 0 ? [block.text] : [],
	);
	return parts.join("\n");
}

/**
 * Resolved plain text for search, export, and copy. Live streaming keeps incremental
 * `text`; completed history messages derive from blocks only.
 */
export function resolveConversationAgentText(message: ConversationAgentMessageViewModel): string {
	if (message.phase === "streaming" && message.text !== undefined && message.text.length > 0) {
		return message.text;
	}
	if (message.text !== undefined && message.text.length > 0) {
		const derived = joinAgentTextBlocks(message.blocks);
		if (derived.length === 0) return message.text;
		return derived;
	}
	return joinAgentTextBlocks(message.blocks);
}

export function agentTextMatchesBlocks(message: ConversationAgentMessageViewModel): boolean {
	if (message.text === undefined || message.text.length === 0) return true;
	return message.text === joinAgentTextBlocks(message.blocks);
}
