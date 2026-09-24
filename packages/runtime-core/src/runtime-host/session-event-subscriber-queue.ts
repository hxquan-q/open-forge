// Copyright The Open Forge contributors.
import type { SessionEvent } from "../contracts.js";

export const DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT = 4096;

const EPHEMERAL_ASSISTANT_TYPES = new Set([
	"text_start",
	"text_delta",
	"thinking_start",
	"thinking_delta",
	"message.delta",
	"thinking.delta",
]);

export function isEphemeralSessionDeliveryEvent(event: SessionEvent): boolean {
	if (event.channel === "assistant") {
		return EPHEMERAL_ASSISTANT_TYPES.has(event.type);
	}
	return event.type === "message.delta" || event.type === "thinking.delta";
}

/**
 * Delta 事件被下游按追加语义消费（renderer appendText / CLI 直接输出），丢弃会
 * 真实丢字；只有不带 delta 载荷的 marker 事件（text_start/thinking_start）可以
 * 安全丢弃——追加式 reducer 会按需自建块。
 */
function isDroppableEphemeralEvent(event: SessionEvent): boolean {
	return isEphemeralSessionDeliveryEvent(event) && typeof eventDelta(event) !== "string";
}

function eventContentIndex(event: SessionEvent): unknown {
	return "contentIndex" in event ? event.contentIndex : undefined;
}

function eventDelta(event: SessionEvent): unknown {
	return "delta" in event ? event.delta : undefined;
}

/** 同一消息流位置的相邻 delta 拼接后语义不变，且比替换更不丢信息。 */
function mergeEphemeralEvents(pending: SessionEvent, event: SessionEvent): SessionEvent | undefined {
	if (pending.sessionId !== event.sessionId || pending.type !== event.type) return undefined;
	if (eventContentIndex(pending) !== eventContentIndex(event)) return undefined;
	const pendingDelta = eventDelta(pending);
	const delta = eventDelta(event);
	if (typeof pendingDelta === "string" && typeof delta === "string") {
		return { ...event, delta: pendingDelta + delta } as SessionEvent;
	}
	return event;
}

export interface SessionEventSubscriberQueueStats {
	readonly queued: number;
	readonly droppedEphemeral: number;
}

/**
 * Bounded outbound queue for a single SessionEvent subscriber. Ephemeral events
 * coalesce by delta concatenation or marker replacement while a synchronous burst
 * is in flight; terminal events flush pending work and are always delivered.
 * Only droppable marker events may be discarded under pressure; delta-bearing and
 * terminal events are never dropped, even when that means exceeding maxSize.
 */
export class SessionEventSubscriberQueue {
	private readonly ephemeralPending: SessionEvent[] = [];
	private droppedEphemeral = 0;
	private flushScheduled = false;

	constructor(
		private readonly deliver: (event: SessionEvent) => void,
		private readonly maxSize: number = DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT,
	) {
		if (!Number.isInteger(maxSize) || maxSize <= 0) {
			throw new Error(`maxSize must be a positive integer, received: ${maxSize}`);
		}
	}

	enqueue(event: SessionEvent): void {
		if (isEphemeralSessionDeliveryEvent(event)) {
			this.enqueueEphemeral(event);
			this.scheduleEphemeralFlush();
			return;
		}
		this.flushEphemeralNow();
		this.deliver(event);
	}

	dispose(): void {
		this.ephemeralPending.length = 0;
	}

	readStats(): SessionEventSubscriberQueueStats {
		return { queued: this.ephemeralPending.length, droppedEphemeral: this.droppedEphemeral };
	}

	private enqueueEphemeral(event: SessionEvent): void {
		if (this.mergeIntoPending(event)) return;
		// 超限只驱逐可丢 marker；全为 delta/必需事件时允许超限，终态一致性优先于水位。
		if (this.ephemeralPending.length >= this.maxSize) this.dropOldestDroppable();
		this.ephemeralPending.push(event);
	}

	private mergeIntoPending(event: SessionEvent): boolean {
		for (let index = this.ephemeralPending.length - 1; index >= 0; index -= 1) {
			const pending = this.ephemeralPending[index];
			if (!pending || !isEphemeralSessionDeliveryEvent(pending)) continue;
			const merged = mergeEphemeralEvents(pending, event);
			if (!merged) continue;
			this.ephemeralPending[index] = merged;
			return true;
		}
		return false;
	}

	private dropOldestDroppable(): void {
		const dropIndex = this.ephemeralPending.findIndex((event) => isDroppableEphemeralEvent(event));
		if (dropIndex < 0) return;
		this.ephemeralPending.splice(dropIndex, 1);
		this.droppedEphemeral += 1;
	}

	private scheduleEphemeralFlush(): void {
		if (this.flushScheduled) return;
		this.flushScheduled = true;
		queueMicrotask(() => {
			this.flushScheduled = false;
			this.flushEphemeralNow();
		});
	}

	private flushEphemeralNow(): void {
		if (this.ephemeralPending.length === 0) return;
		const batch = this.ephemeralPending.splice(0);
		for (const event of batch) this.deliver(event);
	}
}
