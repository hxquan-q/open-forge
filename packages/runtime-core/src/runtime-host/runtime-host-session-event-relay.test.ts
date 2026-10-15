// Modified by The Open Forge contributors.
import type { AssistantMessage, AssistantMessageEvent } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../contracts.js";
import type { RuntimeHostQueueSidecar } from "./runtime-host-queue-sidecar.js";
import {
	DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT,
	RuntimeHostSessionEventRelay,
} from "./runtime-host-session-event-relay.js";
import { baseSessionEvent, lifecycleSessionEvent, mapRuntimeSessionObservationEvent } from "./session-events.js";
import type { RuntimeSessionEventStream } from "./session-ports.js";
import type { RuntimeHostSessionRecord } from "./types.js";

function createEventStream(): RuntimeSessionEventStream & { emit(event: SessionEvent): void } {
	const handlers = new Set<(event: SessionEvent) => void>();
	return {
		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
		emit(event) {
			for (const handler of handlers) handler(event);
		},
	};
}

function createRelayHandle(stream: RuntimeSessionEventStream): RuntimeHostSessionRecord {
	return {
		lifecycle: { sessionId: "session-1", sessionPath: "C:/sessions/session-1.jsonl" },
		stateReader: { readState: () => ({ activeToolNames: [] }) },
		eventStream: stream,
	} as unknown as RuntimeHostSessionRecord;
}

function createRelay(options?: {
	readonly inFlightReplayEventLimit?: number;
	readonly subscriberEventQueueLimit?: number;
}): RuntimeHostSessionEventRelay {
	return new RuntimeHostSessionEventRelay({
		queueSidecar: { persist: () => undefined } as unknown as RuntimeHostQueueSidecar,
		synchronizeSessionIdentity: () => undefined,
		reportFailure: () => undefined,
		...(options?.inFlightReplayEventLimit === undefined
			? {}
			: { inFlightReplayEventLimit: options.inFlightReplayEventLimit }),
		...(options?.subscriberEventQueueLimit === undefined
			? {}
			: { subscriberEventQueueLimit: options.subscriberEventQueueLimit }),
	});
}

function assistantEvent(event: AssistantMessageEvent): SessionEvent {
	return mapRuntimeSessionObservationEvent(
		"session-1",
		{ type: "assistant.event", modelCallIndex: 0, event, source: "agent" },
		undefined,
		{ turnId: "turn-1" },
	);
}

describe("RuntimeHostSessionEventRelay", () => {
	it("replays raw assistant events in their original interleaved order with stable sequences", async () => {
		const stream = createEventStream();
		const handle = {
			lifecycle: { sessionId: "session-1", sessionPath: "C:/sessions/session-1.jsonl" },
			stateReader: { readState: () => ({ activeToolNames: [] }) },
			eventStream: stream,
		} as unknown as RuntimeHostSessionRecord;
		const relay = new RuntimeHostSessionEventRelay({
			queueSidecar: { persist: () => undefined } as unknown as RuntimeHostQueueSidecar,
			synchronizeSessionIdentity: () => undefined,
			reportFailure: () => undefined,
		});
		relay.attach("session-key", handle, stream);

		const partial = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "r" },
				{ type: "text", text: "a" },
			],
		} as unknown as AssistantMessage;
		const protocolEvents: AssistantMessageEvent[] = [
			{ type: "thinking_start", contentIndex: 0, partial },
			{ type: "thinking_delta", contentIndex: 0, delta: "r", partial },
			{ type: "text_start", contentIndex: 1, partial },
			{ type: "text_delta", contentIndex: 1, delta: "a", partial },
			{ type: "thinking_delta", contentIndex: 0, delta: "b", partial },
		];

		const live: SessionEvent[] = [];
		const unsubscribeLive = relay.subscribe("session-key", handle, (event) => live.push(event));
		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		for (const event of protocolEvents) stream.emit(assistantEvent(event));
		await Promise.resolve();

		const replayed: SessionEvent[] = [];
		const unsubscribeReplay = relay.subscribe("session-key", handle, (event) => replayed.push(event));
		const liveAssistant = live.filter((event) => event.channel === "assistant");
		const replayedAssistant = replayed.filter((event) => event.channel === "assistant");

		// 重放保留原始事件流；在线投递允许把相邻同位 delta 合并，但拼接后语义一致。
		expect(replayedAssistant.map((event) => event.type)).toEqual(protocolEvents.map((event) => event.type));
		for (let index = 0; index < replayedAssistant.length; index += 1) {
			expect(replayedAssistant[index]).toMatchObject(protocolEvents[index] ?? {});
		}
		const deltaTextByIndex = (events: readonly { readonly type: string }[]): Map<unknown, string> => {
			const merged = new Map<unknown, string>();
			for (const event of events) {
				if (!("delta" in event) || typeof event.delta !== "string") continue;
				const index = "contentIndex" in event ? event.contentIndex : undefined;
				merged.set(index, (merged.get(index) ?? "") + event.delta);
			}
			return merged;
		};
		// 合并按块聚合 delta：各 contentIndex 上的拼接文本必须与原始流一致。
		expect(deltaTextByIndex(liveAssistant)).toEqual(deltaTextByIndex(protocolEvents));
		expect(liveAssistant.length).toBeLessThanOrEqual(replayedAssistant.length);

		unsubscribeReplay();
		unsubscribeLive();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("bounds the in-flight replay buffer to the configured tail during one streaming message", () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay({ inFlightReplayEventLimit: 3 });
		relay.attach("session-key", handle, stream);

		const deltas = ["a", "b", "c", "d", "e", "f"];
		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		for (const delta of deltas) {
			stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta, partial: partialOf(delta) }));
		}

		const replayed: SessionEvent[] = [];
		const unsubscribe = relay.subscribe("session-key", handle, (event) => replayed.push(event));
		const replayedAssistant = replayed.filter((event) => event.channel === "assistant");
		expect(replayedAssistant.map((event) => (event as { delta?: string }).delta)).toEqual(["d", "e", "f"]);
		// 保留的事件维持原始顺序与原始 sequence（与在线收到的同一事件一致）。
		expect(replayedAssistant.map((event) => event.sequence)).toEqual([5, 6, 7]);

		unsubscribe();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("clears the bounded replay buffer on usage.update and bounds the next streaming message independently", () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay({ inFlightReplayEventLimit: 2 });
		relay.attach("session-key", handle, stream);

		const emitDelta = (delta: string): void => {
			stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta, partial: partialOf(delta) }));
		};

		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		emitDelta("a");
		emitDelta("b");
		emitDelta("c");
		// 同一 Turn 内的下一次模型调用：usage.update 落盘后缓冲必须清空，
		// 上一条消息的超限丢弃不得影响下一条消息的回放。
		stream.emit(baseUsageUpdate("session-1"));

		const afterFinal: SessionEvent[] = [];
		const unsubscribe = relay.subscribe("session-key", handle, (event) => afterFinal.push(event));
		expect(afterFinal.filter((event) => event.channel === "assistant")).toHaveLength(0);

		emitDelta("x");
		emitDelta("y");
		emitDelta("z");
		const replayed: SessionEvent[] = [];
		const unsubscribeReplay = relay.subscribe("session-key", handle, (event) => replayed.push(event));
		expect(
			replayed.filter((event) => event.channel === "assistant").map((event) => (event as { delta?: string }).delta),
		).toEqual(["y", "z"]);

		unsubscribeReplay();
		unsubscribe();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("applies the default replay limit for unbounded single-message streams", () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay();
		relay.attach("session-key", handle, stream);

		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		for (let index = 0; index < DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT + 500; index += 1) {
			const delta = `${index}`;
			stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta, partial: partialOf(delta) }));
		}

		const replayed: SessionEvent[] = [];
		const unsubscribe = relay.subscribe("session-key", handle, (event) => replayed.push(event));
		expect(replayed.filter((event) => event.channel === "assistant")).toHaveLength(
			DEFAULT_IN_FLIGHT_REPLAY_EVENT_LIMIT,
		);

		unsubscribe();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("rejects a non-positive in-flight replay limit at construction", () => {
		expect(() => createRelay({ inFlightReplayEventLimit: 0 })).toThrow(/positive integer/);
	});

	it("exposes the latest observed event timestamp per session and clears it on release", () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay();
		relay.attach("session-key", handle, stream);

		// 无事件时不得伪造活动证据：中断巡检依赖 undefined 表示「无可判定证据」。
		expect(relay.readLastEventAt("session-key")).toBeUndefined();

		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 1_000));
		expect(relay.readLastEventAt("session-key")).toBe(1_000);

		stream.emit(lifecycleSessionEvent("session-1", "agent_end", 5_000));
		expect(relay.readLastEventAt("session-key")).toBe(5_000);

		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
		expect(relay.readLastEventAt("session-key")).toBeUndefined();
	});

	it("batches ephemeral bursts into merged deliveries and exposes per-subscriber stats", async () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay({ subscriberEventQueueLimit: 2 });
		relay.attach("session-key", handle, stream);

		const received: SessionEvent[] = [];
		const handler = (event: SessionEvent): void => {
			received.push(event);
		};
		const unsubscribe = relay.subscribe("session-key", handle, handler);
		received.length = 0;

		stream.emit(assistantEvent({ type: "text_start", contentIndex: 0, partial: partialOf("") }));
		stream.emit(assistantEvent({ type: "text_start", contentIndex: 1, partial: partialOf("") }));
		stream.emit(assistantEvent({ type: "text_start", contentIndex: 2, partial: partialOf("") }));
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "a", partial: partialOf("a") }));
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "b", partial: partialOf("ab") }));
		await Promise.resolve();

		const assistantEvents = received.filter((event) => event.channel === "assistant");
		const deltas = assistantEvents.filter((event) => event.type === "text_delta");
		expect(deltas).toHaveLength(1);
		expect(deltas[0]).toMatchObject({ delta: "ab" });

		const stats = relay.readSubscriberDeliveryStats(handler);
		expect(stats).toBeDefined();
		expect(stats?.droppedEphemeral).toBeGreaterThanOrEqual(1);
		expect(stats?.queued).toBe(0);

		unsubscribe();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("exposes the running Turn identity and replays its tool executions to late subscribers", () => {
		const stream = createEventStream();
		const handle = createRelayHandle(stream);
		const relay = createRelay();
		relay.attach("session-key", handle, stream);

		const toolObservation = (type: "tool.start" | "tool.end", overrides: Record<string, unknown>): SessionEvent =>
			mapRuntimeSessionObservationEvent("session-1", {
				type,
				toolCallId: "call-1",
				toolName: "bash",
				...(type === "tool.start"
					? { args: { command: "ls" }, startedAt: 120 }
					: { result: { content: [] }, isError: false, startedAt: 120, durationMs: 30, phases: [] }),
				...overrides,
				source: "tool",
			} as Parameters<typeof mapRuntimeSessionObservationEvent>[1]);

		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		stream.emit(assistantEvent({ type: "text_start", contentIndex: 0, partial: partialOf("w") }));
		stream.emit(toolObservation("tool.start", {}));
		stream.emit(toolObservation("tool.end", {}));
		expect(relay.readCurrentTurnId("session-key")).toBe("turn-1");

		const replayed: SessionEvent[] = [];
		const unsubscribe = relay.subscribe("session-key", handle, (event) => replayed.push(event));
		expect(replayed.filter((event) => event.type.startsWith("tool.")).map((event) => event.type)).toEqual([
			"tool.start",
			"tool.end",
		]);
		unsubscribe();

		stream.emit(lifecycleSessionEvent("session-1", "agent_end", 200));
		expect(relay.readCurrentTurnId("session-key")).toBeUndefined();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});
});

function partialOf(delta: string): AssistantMessage {
	return { role: "assistant", content: [{ type: "text", text: delta }] } as unknown as AssistantMessage;
}

function baseUsageUpdate(sessionId: string): SessionEvent {
	return {
		...baseSessionEvent(sessionId, "runtime-core"),
		type: "usage.update",
		input: 10,
		output: 5,
		cacheRead: 0,
		cacheWrite: 0,
		costTotal: 0,
		contextPercent: 1,
		contextWindow: 8_000,
	};
}
