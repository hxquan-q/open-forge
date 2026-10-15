import {
	createMessageFeedNavigationText,
	type MessageFeedNavigationEntry,
	type MessageFeedNavigationTurn,
} from "@shared/components/message-feed/navigationModel";
import { resolveConversationAgentText } from "@shared/conversation";
import type { ChatTimelineItem } from "./types";

export type { RenderedFeedItem as RenderedMessageItem } from "@shared/components/message-feed/visibleItemModel";
export { findTopVisibleItemIndex as findTopVisibleMessageIndex } from "@shared/components/message-feed/visibleItemModel";

export const MESSAGE_NAVIGATION_MIN_TURNS = 8;

function itemRole(message: ChatTimelineItem): "request" | "response" {
	if (message.kind === "placeholder") return message.role === "user" ? "request" : "response";
	return message.kind === "user" ? "request" : "response";
}

function visibleMessageText(message: ChatTimelineItem): string {
	if (message.kind === "event") return "";
	// 占位项以摘要参与导航/搜索——全文操作（跳转后复制等）会先经窗口恢复。
	if (message.kind === "placeholder") return message.summary;
	// 历史回放的助手消息不再物化 text，统一按 blocks 派生，避免出现第二份正文事实源。
	if (message.kind === "agent") return resolveConversationAgentText(message);
	return message.text;
}

/** Chat adapter: projects the domain message schema into the shared navigation contract. */
export function buildMessageNavigationTurns(messages: readonly ChatTimelineItem[]): MessageFeedNavigationTurn[] {
	const turns: Array<{
		id: string;
		turnNumber: number;
		entries: MessageFeedNavigationEntry[];
	}> = [];
	let current: (typeof turns)[number] | undefined;

	for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
		const message = messages[messageIndex];
		if (message.kind === "event") continue;

		if (message.kind === "user" || (message.kind === "placeholder" && message.role === "user") || !current) {
			current = {
				id: `turn-${message.id}`,
				turnNumber: turns.length + 1,
				entries: [],
			};
			turns.push(current);
		}

		const navigationText = createMessageFeedNavigationText(visibleMessageText(message));
		current.entries.push({
			id: message.id,
			itemIndex: messageIndex,
			preview: navigationText.preview,
			role: itemRole(message),
			searchText: navigationText.searchText,
			turnNumber: current.turnNumber,
		});
	}

	return turns;
}
