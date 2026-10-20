// Copyright The Open Forge contributors.

import type { WeKnoraChatMessage } from "../atoms";
import { MessageBubble } from "./MessageBubble";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

export interface MessageListProps {
	readonly messages: readonly WeKnoraChatMessage[];
}

/** 消息序列；`role="log"` + `aria-live` 让流式增量对辅助技术可感知。 */
export function MessageList({ messages }: MessageListProps): JSX.Element {
	return (
		<WeKnoraMarkdownProvider>
			<div className="flex flex-1 flex-col gap-4 overflow-y-auto" role="log" aria-live="polite">
				{messages.map((message) => (
					<MessageBubble key={message.id} message={message} />
				))}
			</div>
		</WeKnoraMarkdownProvider>
	);
}
