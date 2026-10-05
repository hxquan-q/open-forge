// Modified by The Open Forge contributors.
import type { DesktopTeamToolExecutionEvent } from "@preload/api-types/team-conversation-display";
import {
	type ConversationMessageEventState,
	createConversationAgentMessage,
	DEFAULT_AGENT_PARTICIPANT_ID,
	projectAssistantMessageBlocks,
	reduceConversationMessageEvent,
} from "@shared/conversation";
import type { ChatConversationItem, ChatTimelineItem } from "@shared/store/atoms";
import type { AssistantMessage } from "@vetta/ai";
import type { AssistantSessionEvent, HistoryEntry } from "@vetta/runtime-core";
import type { ConversationAgentMessageEvent, ConversationToolExecutionEvent } from "@vetta/runtime-core/conversation";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import {
	fullHistoryToChat,
	fullHistoryToChatWithSpans,
	handleToolEnd,
	handleToolPhase,
	handleToolStart,
	resetStreamState,
	type TranscriptItemSpan,
} from "./chat-service";

interface QueuedAssistantEvent {
	readonly event: AssistantSessionEvent;
	readonly sequence: number;
}

const PENDING_ASSISTANT_EVENT_LIMIT = 4096;

const EPHEMERAL_ASSISTANT_EVENT_TYPES = new Set([
	"text_start",
	"text_delta",
	"thinking_start",
	"thinking_delta",
	"message.delta",
	"thinking.delta",
]);

function isEphemeralAssistantSessionEvent(event: AssistantSessionEvent): boolean {
	return EPHEMERAL_ASSISTANT_EVENT_TYPES.has(event.type);
}

/**
 * reducer 按追加语义消费 delta（appendText/appendThinking），丢弃会真实丢字；
 * 只有不带 delta 的 marker（text_start/thinking_start）可安全丢弃。
 */
function isDroppableAssistantEvent(event: AssistantSessionEvent): boolean {
	return isEphemeralAssistantSessionEvent(event) && !("delta" in event && typeof event.delta === "string");
}

function eventContentIndex(event: AssistantSessionEvent): unknown {
	return "contentIndex" in event ? event.contentIndex : undefined;
}

/** 相邻同位 delta 拼接后语义不变；marker 以最新值替换。 */
function mergeQueuedAssistantEvents(
	pending: QueuedAssistantEvent,
	queued: QueuedAssistantEvent,
): QueuedAssistantEvent | undefined {
	const a = pending.event;
	const b = queued.event;
	if (a.sessionId !== b.sessionId || a.type !== b.type) return undefined;
	if (eventContentIndex(a) !== eventContentIndex(b)) return undefined;
	if ("delta" in a && "delta" in b && typeof a.delta === "string" && typeof b.delta === "string") {
		return { event: { ...b, delta: a.delta + b.delta }, sequence: queued.sequence };
	}
	return queued;
}

export interface ConversationToolExecutionProjection {
	readonly messageId: string;
	readonly toolCallId: string;
	readonly toolName: string;
	readonly args: Record<string, unknown>;
	readonly result?: RuntimeToolResult;
	readonly isError?: boolean;
	readonly startedAt?: number;
	readonly durationMs?: number;
	readonly phases?: readonly { readonly label: string; readonly atMs: number }[];
}

/**
 * Chat connector for the shared identity-scoped Conversation message reducer.
 * Runtime events remain lossless; batching changes only React commit frequency.
 */
export class ConversationProjection {
	private pendingAssistantEvents: QueuedAssistantEvent[] = [];
	private droppedAssistantEvents = 0;
	private lastHostSequence: number | undefined;
	private localSequence = 0;
	private rawAssistantStream = false;
	private targetMessageId: string | undefined;

	projectHistory(history: HistoryEntry[], mediaSessionId?: string): ChatConversationItem[] {
		return fullHistoryToChat(history, mediaSessionId);
	}

	/** 同 {@link projectHistory}，附带占位恢复所需的 item→entry 区间（TASK-0035）。 */
	projectHistoryWithSpans(
		history: HistoryEntry[],
		mediaSessionId?: string,
	): { messages: ChatConversationItem[]; spans: Map<string, TranscriptItemSpan> } {
		return fullHistoryToChatWithSpans(history, mediaSessionId);
	}

	enqueue(event: AssistantSessionEvent): void {
		if (
			event.sequence !== undefined &&
			this.lastHostSequence !== undefined &&
			event.sequence <= this.lastHostSequence
		) {
			return;
		}
		if (event.sequence !== undefined) this.lastHostSequence = event.sequence;
		this.localSequence = Math.max(this.localSequence + 1, event.sequence ?? 0);
		this.rawAssistantStream = true;
		this.enqueueAssistantEvent({ event, sequence: this.localSequence });
	}

	private enqueueAssistantEvent(queued: QueuedAssistantEvent): void {
		if (isEphemeralAssistantSessionEvent(queued.event)) {
			if (this.mergeIntoPendingAssistantEvents(queued)) return;
			if (this.pendingAssistantEvents.length >= PENDING_ASSISTANT_EVENT_LIMIT) {
				this.dropOldestDroppableAssistantEvent();
			}
			this.pendingAssistantEvents.push(queued);
			return;
		}
		this.pendingAssistantEvents.push(queued);
		if (this.pendingAssistantEvents.length > PENDING_ASSISTANT_EVENT_LIMIT) {
			this.dropOldestDroppableAssistantEvent();
		}
	}

	private mergeIntoPendingAssistantEvents(queued: QueuedAssistantEvent): boolean {
		for (let index = this.pendingAssistantEvents.length - 1; index >= 0; index -= 1) {
			const pending = this.pendingAssistantEvents[index];
			if (!pending) continue;
			// 非 ephemeral 事件是块边界：跨过它合并会把 delta 归到错误一侧。
			if (!isEphemeralAssistantSessionEvent(pending.event)) break;
			const merged = mergeQueuedAssistantEvents(pending, queued);
			if (!merged) continue;
			this.pendingAssistantEvents[index] = merged;
			return true;
		}
		return false;
	}

	/** 超限只驱逐可丢 marker；delta 与终态事件一律不丢，水位可以为正确性超限。 */
	private dropOldestDroppableAssistantEvent(): void {
		const dropIndex = this.pendingAssistantEvents.findIndex((entry) => isDroppableAssistantEvent(entry.event));
		if (dropIndex < 0) return;
		this.pendingAssistantEvents.splice(dropIndex, 1);
		this.droppedAssistantEvents += 1;
	}

	readStats(): { readonly pendingAssistantEvents: number; readonly droppedAssistantEvents: number } {
		return {
			pendingAssistantEvents: this.pendingAssistantEvents.length,
			droppedAssistantEvents: this.droppedAssistantEvents,
		};
	}

	hasRawAssistantStream(): boolean {
		return this.rawAssistantStream;
	}

	hasPendingEvents(): boolean {
		return this.pendingAssistantEvents.length > 0;
	}

	flush(messages: ChatTimelineItem[]): ChatTimelineItem[] {
		const pending = this.pendingAssistantEvents;
		this.pendingAssistantEvents = [];
		if (pending.length === 0) return messages;

		const first = pending[0];
		if (!first) return messages;
		const existing = findTargetAgentMessage(messages, this.targetMessageId);
		if (this.targetMessageId === undefined) {
			const baseId = `assistant:${first.event.sessionId}:${first.event.turnId ?? "unscoped-turn"}`;
			let candidate = existing?.id ?? baseId;
			if (!existing) {
				// 队列消费 reset 后同 turnId 的确定性 id 可能已被消费前的消息占用；
				// 占用意味着那是另一条消息——原位替换会把消费后的回复塞回镜像
				// 用户气泡之前，气泡被孤立在列表末尾（BUG-0068）。派生新 id。
				for (let salt = 2; messages.some((item) => item.id === candidate); salt += 1) {
					candidate = `${baseId}#${salt}`;
				}
			}
			this.targetMessageId = candidate;
		}
		let state: ConversationMessageEventState | undefined = existing
			? { conversationId: first.event.sessionId, sequence: -1, message: existing }
			: undefined;
		for (const queued of pending) {
			state = reduceConversationMessageEvent(state, toConversationEnvelope(queued, this.targetMessageId));
		}
		if (!state) return messages;

		const index = messages.findIndex((item) => item.kind === "agent" && item.id === state?.message.id);
		if (index < 0) return [...messages, state.message];
		const next = [...messages];
		next[index] = state.message;
		return next;
	}

	reset(): void {
		this.pendingAssistantEvents = [];
		this.droppedAssistantEvents = 0;
		this.lastHostSequence = undefined;
		this.localSequence = 0;
		this.rawAssistantStream = false;
		this.targetMessageId = undefined;
		resetStreamState();
	}

	/**
	 * 历史回填把运行回合的草稿折叠进 canonical entry 身份时，同步迁移当前
	 * 流式目标，后续增量继续落在同一条消息（TASK-0152）。
	 */
	retargetMessageId(from: string, to: string): void {
		if (this.targetMessageId === from) this.targetMessageId = to;
	}
}

/**
 * Projects a persisted assistant message through the same block contract used
 * by the ordinary conversation. Execution observations are only an optional
 * Desktop display input; they never create a second Team message model.
 */
export function projectConversationAgentMessage(input: {
	readonly message: AssistantMessage;
	readonly messageId: string;
	readonly entryId?: string;
	readonly turnId?: string;
	readonly authorId?: string;
	readonly timestamp?: number;
	readonly executions?: readonly ConversationToolExecutionProjection[];
	/** 提供时工具媒体以协议引用驻留（缺省回退 base64 内联）。 */
	readonly mediaSessionId?: string;
}): ChatConversationItem {
	const { message, messageId, entryId, turnId, authorId, timestamp, executions = [], mediaSessionId } = input;
	const phase = message.stopReason === "aborted" ? "aborted" : message.stopReason === "error" ? "failed" : "completed";
	const toolStatus = phase === "aborted" ? "cancelled" : phase === "failed" ? "error" : "pending";
	let items: ChatTimelineItem[] = [
		createConversationAgentMessage({
			id: messageId,
			entryId: entryId ?? messageId,
			turnId: turnId ?? messageId,
			authorId: authorId,
			timestamp: timestamp ?? message.timestamp,
			phase,
			text: message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""),
			blocks: projectAssistantMessageBlocks(message, messageId, toolStatus),
		}),
	];
	for (const execution of executions.filter((item) => item.messageId === messageId)) {
		const current = items[0];
		const hasCall =
			current?.kind === "agent" &&
			current.blocks.some((block) => block.type === "tool_call" && block.toolCallId === execution.toolCallId);
		if (!hasCall) {
			items = handleToolStart(items, execution.toolCallId, execution.toolName, execution.args, execution.startedAt);
		}
		for (const phase of execution.phases ?? []) {
			items = handleToolPhase(items, execution.toolCallId, phase.label, phase.atMs);
		}
		if (execution.result) {
			items = handleToolEnd(
				items,
				execution.toolCallId,
				execution.result,
				execution.isError === true,
				execution.startedAt !== undefined && execution.durationMs !== undefined
					? {
							startedAt: execution.startedAt,
							durationMs: execution.durationMs,
							phases: [...(execution.phases ?? [])],
						}
					: undefined,
				mediaSessionId,
			);
		}
	}
	const result = items[0];
	if (!result || result.kind === "placeholder") throw new Error("Assistant message projection produced no message");
	return result;
}

/**
 * Applies execution-only tool events to the same Agent message projection used
 * by ordinary Chat. The events are deliberately kept outside Conversation
 * history so Team can expose tool cards without leaking execution details into
 * the model context or changing the storage contract.
 */
export function reduceConversationToolExecutionEvent(
	state: ConversationMessageEventState | undefined,
	event: DesktopTeamToolExecutionEvent | ConversationToolExecutionEvent,
): ConversationMessageEventState {
	if (state && (state.conversationId !== event.conversationId || state.message.id !== event.messageId)) {
		throw new Error("Conversation tool execution event does not match its reduction state");
	}
	if (state && event.sequence <= state.sequence) return state;

	const base =
		state?.message ??
		createConversationAgentMessage({
			id: event.messageId,
			entryId: event.messageId,
			turnId: event.turnId,
			authorId: event.author.id,
			phase: "streaming",
			text: "",
			blocks: [],
			timestamp: event.timestamp,
			startedAt: event.timestamp,
		});
	let message = base;
	switch (event.event.type) {
		case "start":
			message = requireAgentMessage(
				handleToolStart(
					[base],
					event.event.toolCallId,
					event.event.toolName,
					asRecord(event.event.args),
					event.event.startedAt,
				)[0],
			);
			break;
		case "phase":
			message = requireAgentMessage(
				handleToolPhase([base], event.event.toolCallId, event.event.label, event.event.atMs)[0],
			);
			break;
		case "end": {
			const started = base.blocks.some(
				(block) => block.type === "tool_call" && block.toolCallId === event.event.toolCallId,
			)
				? [base]
				: handleToolStart([base], event.event.toolCallId, event.event.toolName, {}, event.event.startedAt);
			message = requireAgentMessage(
				handleToolEnd(started, event.event.toolCallId, event.event.result, event.event.isError, {
					startedAt: event.event.startedAt,
					durationMs: event.event.durationMs,
					phases: [...event.event.phases],
				})[0],
			);
			break;
		}
		case "update":
			// Partial results are intentionally not rendered as terminal output.
			// The final event carries the complete result and timing metadata.
			break;
	}
	return { conversationId: event.conversationId, sequence: event.sequence, message };
}

function requireAgentMessage(message: ChatTimelineItem | undefined) {
	if (!message || message.kind !== "agent")
		throw new Error("Tool execution projection did not produce an Agent message");
	return message;
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function findTargetAgentMessage(messages: readonly ChatTimelineItem[], targetMessageId: string | undefined) {
	if (targetMessageId) {
		const target = messages.find((item) => item.kind === "agent" && item.id === targetMessageId);
		if (target?.kind === "agent") return target;
	}
	const tail = messages.at(-1);
	return tail?.kind === "agent" && tail.phase === "streaming" ? tail : undefined;
}

function toConversationEnvelope(queued: QueuedAssistantEvent, messageId: string): ConversationAgentMessageEvent {
	const { event, sequence } = queued;
	return {
		type: "conversation.agent-message-event",
		conversationId: event.sessionId,
		messageId,
		turnId: event.turnId ?? messageId,
		author: { kind: "agent", id: DEFAULT_AGENT_PARTICIPANT_ID },
		sequence,
		timestamp: event.timestamp,
		event,
	};
}
