// Modified by The Open Forge contributors.
import type { ErrorEvent, SessionEvent } from "../contracts.js";
import type { SessionContextStateEvent } from "../session-context-state.js";
import type { RuntimeHostQueueSidecar } from "./runtime-host-queue-sidecar.js";
import {
	DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT,
	SessionEventSubscriberQueue,
	type SessionEventSubscriberQueueStats,
} from "./session-event-subscriber-queue.js";
import { baseSessionEvent, lifecycleSessionEvent, mapRuntimeSessionObservationEvent } from "./session-events.js";
import type { RuntimeSessionEventStream } from "./session-ports.js";
import type { InFlightBuffer, RunningChangedReason, RuntimeHostSessionRecord } from "./types.js";

export type RuntimeHostSessionEventRelayFailureComponent =
	| "running-listener"
	| "session-event-listener"
	| "session-error-observer"
	| "session-compaction-observer";

/**
 * 单条助手消息流期间 in-flight 回放缓冲保留的最大原始事件数。超限后丢弃最旧
 * 事件（重放只保证尾部），恢复事实仍以 Conversation JSONL 为准——缓冲只是重连
 * 渲染端的尽力回放，不是持久化投影。
 */
export const DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT = 4096;

export interface RuntimeHostSessionEventRelayOptions {
	readonly queueSidecar: RuntimeHostQueueSidecar;
	readonly synchronizeSessionIdentity: (sessionKey: string, handle: RuntimeHostSessionRecord) => void;
	readonly sessionErrorObserver?: (event: ErrorEvent) => void;
	readonly sessionCompactionObserver?: (
		event: Extract<SessionEvent, { readonly type: "compaction.start" | "compaction.end" }>,
	) => void;
	/**
	 * in-flight 回放缓冲的事件数上限。缺省 {@link DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT}；
	 * 必须是正整数。事件按 `partial` 别名共享累积消息本体，上限约束的是 delta 串
	 * 总量这条无界轴。
	 */
	readonly inFlightReplayEventLimit?: number;
	readonly subscriberEventQueueLimit?: number;
	readonly reportFailure: (
		operation: "listener.notify" | "observer.notify",
		component: RuntimeHostSessionEventRelayFailureComponent,
		error: unknown,
		sessionId?: string,
	) => void;
}

/**
 * RuntimeHost Session 事件的唯一回放、缓冲与外部广播边界。
 *
 * 该对象不执行 Turn，也不拥有 Backend；它只维护事件投影所需的瞬时状态，并把
 * subscriber/observer 失败隔离为安全 Observation。
 */
export class RuntimeHostSessionEventRelay {
	private readonly currentTurnStartedAt = new Map<string, number>();
	private readonly currentTurnIds = new Map<string, string>();
	private readonly inFlightBuffers = new Map<string, InFlightBuffer>();
	private readonly inFlightUnsubscribers = new Map<string, () => void>();
	private readonly externalSubscribers = new Map<string, Set<(event: SessionEvent) => void>>();
	private readonly externalSubscriberActiveToolFingerprints = new Map<
		string,
		WeakMap<(event: SessionEvent) => void, string>
	>();
	private readonly nextSequences = new Map<string, number>();
	/** 每个会话最近一次事件的时间戳：宿主侧唯一的逐事件活动证据，供停滞判定使用。 */
	private readonly lastEventAt = new Map<string, number>();
	private readonly runningSessionPaths = new Set<string>();
	private readonly runningChangedHandlers = new Set<
		(sessionPath: string, running: boolean, sessionId?: string, reason?: RunningChangedReason) => void
	>();
	private readonly contextStateEvents = new Map<string, SessionContextStateEvent>();
	private readonly inFlightReplayEventLimit: number;
	private readonly subscriberEventQueueLimit: number;
	private readonly subscriberDeliveryQueues = new Map<
		string,
		Map<(event: SessionEvent) => void, SessionEventSubscriberQueue>
	>();

	constructor(private readonly options: RuntimeHostSessionEventRelayOptions) {
		const limit = options.inFlightReplayEventLimit ?? DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT;
		if (!Number.isInteger(limit) || limit <= 0) {
			throw new Error(`inFlightReplayEventLimit must be a positive integer, received: ${limit}`);
		}
		this.inFlightReplayEventLimit = limit;
		const queueLimit = options.subscriberEventQueueLimit ?? DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT;
		if (!Number.isInteger(queueLimit) || queueLimit <= 0) {
			throw new Error(`subscriberEventQueueLimit must be a positive integer, received: ${queueLimit}`);
		}
		this.subscriberEventQueueLimit = queueLimit;
	}

	attach(sessionKey: string, handle: RuntimeHostSessionRecord, eventStream: RuntimeSessionEventStream): void {
		const buffer: InFlightBuffer = {
			turnStartedAt: 0,
			events: [],
			isActive: false,
			terminalReason: undefined,
			droppedEventCount: 0,
		};
		this.inFlightBuffers.set(sessionKey, buffer);
		const unsubscribe = eventStream.subscribe((unsequencedEvent) => {
			const event = this.withSequence(sessionKey, unsequencedEvent);
			this.lastEventAt.set(sessionKey, event.timestamp);
			if (event.type === "session.context.state") this.contextStateEvents.set(sessionKey, event);
			this.options.synchronizeSessionIdentity(sessionKey, handle);
			this.observeSessionError(event);
			this.observeSessionCompaction(event);
			if (event.type === "queue.changed") {
				this.options.queueSidecar.persist(handle.lifecycle.sessionPath, event);
			}
			if (event.type === "session.lifecycle" && event.phase === "agent_start") {
				this.currentTurnStartedAt.set(sessionKey, event.timestamp);
				// 新回合身份未知；由随后的 assistant 事件（携带 turnId）学习。
				this.currentTurnIds.delete(sessionKey);
				buffer.turnStartedAt = event.timestamp;
				buffer.events = [];
				buffer.isActive = true;
				buffer.terminalReason = undefined;
				buffer.droppedEventCount = 0;
				this.markRunning(handle.lifecycle.sessionPath, true, handle.lifecycle.sessionId);
			} else if (event.type === "session.lifecycle" && event.phase === "aborted") {
				buffer.terminalReason = "aborted";
			} else if (event.channel !== "assistant" && event.type === "error" && buffer.isActive) {
				buffer.terminalReason = "error";
			} else if (event.type === "session.lifecycle" && event.phase === "agent_end") {
				this.currentTurnStartedAt.delete(sessionKey);
				this.currentTurnIds.delete(sessionKey);
				buffer.events = [];
				buffer.isActive = false;
				buffer.droppedEventCount = 0;
				this.markRunning(
					handle.lifecycle.sessionPath,
					false,
					handle.lifecycle.sessionId,
					buffer.terminalReason ?? "agent_end",
				);
				buffer.terminalReason = undefined;
			} else if (event.type === "usage.update") {
				buffer.events = [];
				buffer.droppedEventCount = 0;
			} else if (event.channel === "assistant" && buffer.isActive) {
				if (event.turnId) this.currentTurnIds.set(sessionKey, event.turnId);
				if (buffer.events.length >= this.inFlightReplayEventLimit) {
					buffer.events.shift();
					buffer.droppedEventCount += 1;
				}
				buffer.events.push(event);
				if (event.type === "error") buffer.terminalReason = "error";
				else if (event.type === "done") {
					buffer.terminalReason = event.message.stopReason === "aborted" ? "aborted" : undefined;
				}
			} else if (
				buffer.isActive &&
				(event.type === "tool.start" || event.type === "tool.phase" || event.type === "tool.end")
			) {
				// 工具执行状态是 display-only 事实：中途接入者重放时需要它显示运行中/已完成的工具。
				if (buffer.events.length >= this.inFlightReplayEventLimit) {
					buffer.events.shift();
					buffer.droppedEventCount += 1;
				}
				buffer.events.push(event);
			}
			this.notifyExternalSubscribers(sessionKey, event);
		});
		this.inFlightUnsubscribers.set(sessionKey, unsubscribe);
	}

	subscribe(sessionKey: string, handle: RuntimeHostSessionRecord, handler: (event: SessionEvent) => void): () => void {
		const canonicalSessionId = handle.lifecycle.sessionId;
		this.notifyExternalSubscriber(
			sessionKey,
			handler,
			lifecycleSessionEvent(canonicalSessionId, "created"),
			"immediate",
		);

		for (const observation of handle.extensionHost?.readInitialObservations() ?? []) {
			this.notifyExternalSubscriber(
				sessionKey,
				handler,
				mapRuntimeSessionObservationEvent(canonicalSessionId, observation),
				"immediate",
			);
		}

		this.notifyExternalSubscriber(
			sessionKey,
			handler,
			{
				...baseSessionEvent(canonicalSessionId, "runtime-core"),
				type: "active_tools_update",
				activeToolNames: [...handle.stateReader.readState().activeToolNames],
			},
			"immediate",
		);
		const contextState = this.contextStateEvents.get(sessionKey);
		if (contextState) this.notifyExternalSubscriber(sessionKey, handler, contextState, "immediate");
		this.replayInFlight(sessionKey, canonicalSessionId, handler);

		let externals = this.externalSubscribers.get(sessionKey);
		if (!externals) {
			externals = new Set();
			this.externalSubscribers.set(sessionKey, externals);
		}
		externals.add(handler);

		return () => {
			const subscribers = this.externalSubscribers.get(sessionKey);
			if (!subscribers) return;
			subscribers.delete(handler);
			this.externalSubscriberActiveToolFingerprints.get(sessionKey)?.delete(handler);
			const queues = this.subscriberDeliveryQueues.get(sessionKey);
			queues?.get(handler)?.dispose();
			queues?.delete(handler);
			if (subscribers.size > 0) return;
			this.externalSubscribers.delete(sessionKey);
			this.externalSubscriberActiveToolFingerprints.delete(sessionKey);
		};
	}

	broadcastSyntheticEvent(sessionKey: string, event: SessionEvent): void {
		const sequencedEvent = this.withSequence(sessionKey, event);
		this.observeSessionError(sequencedEvent);
		this.notifyExternalSubscribers(sessionKey, sequencedEvent);
	}

	readCurrentTurnStartedAt(sessionKey: string): number | undefined {
		return this.currentTurnStartedAt.get(sessionKey);
	}

	readCurrentTurnId(sessionKey: string): string | undefined {
		return this.currentTurnIds.get(sessionKey);
	}

	/** 最近一次观察到该会话事件的时间戳（事件自身时钟）；无任何事件前为 undefined。 */
	readLastEventAt(sessionKey: string): number | undefined {
		return this.lastEventAt.get(sessionKey);
	}

	getRunningSessionPaths(): string[] {
		return Array.from(this.runningSessionPaths);
	}

	onRunningChanged(
		handler: (sessionPath: string, running: boolean, sessionId?: string, reason?: RunningChangedReason) => void,
	): () => void {
		this.runningChangedHandlers.add(handler);
		return () => this.runningChangedHandlers.delete(handler);
	}

	release(sessionKey: string, sessionPath: string | undefined, sessionId: string): void {
		this.detach(sessionKey);
		this.inFlightBuffers.delete(sessionKey);
		for (const queue of this.subscriberDeliveryQueues.get(sessionKey)?.values() ?? []) {
			queue.dispose();
		}
		this.subscriberDeliveryQueues.delete(sessionKey);
		this.externalSubscribers.delete(sessionKey);
		this.externalSubscriberActiveToolFingerprints.delete(sessionKey);
		this.currentTurnStartedAt.delete(sessionKey);
		this.lastEventAt.delete(sessionKey);
		this.nextSequences.delete(sessionKey);
		this.contextStateEvents.delete(sessionKey);
		this.markRunning(sessionPath, false, sessionId);
	}

	private replayInFlight(sessionKey: string, _sessionId: string, handler: (event: SessionEvent) => void): void {
		const buffer = this.inFlightBuffers.get(sessionKey);
		if (!buffer?.isActive) return;
		for (const event of buffer.events) {
			this.notifyExternalSubscriber(sessionKey, handler, event, "immediate");
		}
	}

	private withSequence(sessionKey: string, event: SessionEvent): SessionEvent {
		const sequence = this.nextSequences.get(sessionKey) ?? 1;
		this.nextSequences.set(sessionKey, sequence + 1);
		return { ...event, sequence };
	}

	private notifyExternalSubscribers(sessionKey: string, event: SessionEvent): void {
		for (const handler of this.externalSubscribers.get(sessionKey) ?? []) {
			this.notifyExternalSubscriber(sessionKey, handler, event);
		}
	}

	private notifyExternalSubscriber(
		sessionKey: string,
		handler: (event: SessionEvent) => void,
		event: SessionEvent,
		delivery: "queued" | "immediate" = "queued",
	): void {
		if (event.type === "active_tools_update") {
			const fingerprint = [...event.activeToolNames].sort().join("\0");
			let fingerprints = this.externalSubscriberActiveToolFingerprints.get(sessionKey);
			if (!fingerprints) {
				fingerprints = new WeakMap();
				this.externalSubscriberActiveToolFingerprints.set(sessionKey, fingerprints);
			}
			if (fingerprints.get(handler) === fingerprint) return;
			fingerprints.set(handler, fingerprint);
		}
		try {
			if (delivery === "immediate") {
				this.invokeExternalSubscriber(handler, event);
				return;
			}
			this.deliveryQueueFor(sessionKey, handler).enqueue(event);
		} catch (error) {
			this.options.reportFailure("listener.notify", "session-event-listener", error, event.sessionId);
		}
	}

	private invokeExternalSubscriber(handler: (event: SessionEvent) => void, event: SessionEvent): void {
		handler(event);
	}

	/**
	 * 订阅者投递队列的累计水位/丢弃计数，供宿主遥测轮询。handler 可能订阅多个
	 * session，返回其在全部 sessionKey 上的合计。
	 */
	readSubscriberDeliveryStats(handler: (event: SessionEvent) => void): SessionEventSubscriberQueueStats | undefined {
		let queued = 0;
		let droppedEphemeral = 0;
		let found = false;
		for (const queues of this.subscriberDeliveryQueues.values()) {
			const stats = queues.get(handler)?.readStats();
			if (!stats) continue;
			found = true;
			queued += stats.queued;
			droppedEphemeral += stats.droppedEphemeral;
		}
		return found ? { queued, droppedEphemeral } : undefined;
	}

	private deliveryQueueFor(sessionKey: string, handler: (event: SessionEvent) => void): SessionEventSubscriberQueue {
		let queues = this.subscriberDeliveryQueues.get(sessionKey);
		if (!queues) {
			queues = new Map();
			this.subscriberDeliveryQueues.set(sessionKey, queues);
		}
		let queue = queues.get(handler);
		if (!queue) {
			queue = new SessionEventSubscriberQueue((event) => {
				try {
					handler(event);
				} catch (error) {
					this.options.reportFailure("listener.notify", "session-event-listener", error, event.sessionId);
				}
			}, this.subscriberEventQueueLimit);
			queues.set(handler, queue);
		}
		return queue;
	}

	private observeSessionError(event: SessionEvent): void {
		if (event.channel === "assistant" || event.type !== "error" || !this.options.sessionErrorObserver) return;
		try {
			this.options.sessionErrorObserver(event);
		} catch (error) {
			this.options.reportFailure("observer.notify", "session-error-observer", error, event.sessionId);
		}
	}

	private observeSessionCompaction(event: SessionEvent): void {
		if (
			(event.type !== "compaction.start" && event.type !== "compaction.end") ||
			!this.options.sessionCompactionObserver
		) {
			return;
		}
		try {
			this.options.sessionCompactionObserver(event);
		} catch (error) {
			this.options.reportFailure("observer.notify", "session-compaction-observer", error, event.sessionId);
		}
	}

	private markRunning(
		sessionPath: string | undefined,
		running: boolean,
		sessionId?: string,
		reason?: RunningChangedReason,
	): void {
		if (!sessionPath) return;
		const had = this.runningSessionPaths.has(sessionPath);
		if ((running && had) || (!running && !had)) return;
		if (running) this.runningSessionPaths.add(sessionPath);
		else this.runningSessionPaths.delete(sessionPath);
		for (const handler of this.runningChangedHandlers) {
			try {
				handler(sessionPath, running, sessionId, reason);
			} catch (error) {
				this.options.reportFailure("listener.notify", "running-listener", error, sessionId);
			}
		}
	}

	private detach(sessionKey: string): void {
		this.inFlightUnsubscribers.get(sessionKey)?.();
		this.inFlightUnsubscribers.delete(sessionKey);
	}
}
