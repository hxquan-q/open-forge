// Modified by The Open Forge contributors.
import type { AssistantMessage, AssistantMessageEvent } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import type { HistoryEntry, SessionEvent } from "../contracts.js";
import type { RuntimeHostQueueSidecar } from "./runtime-host-queue-sidecar.js";
import type { RuntimeHostSessionDirectory } from "./runtime-host-session-directory.js";
import { RuntimeHostSessionEventRelay } from "./runtime-host-session-event-relay.js";
import { RuntimeHostSessionOperations } from "./runtime-host-session-operations.js";
import { lifecycleSessionEvent, mapRuntimeSessionObservationEvent } from "./session-events.js";
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

function createRelay(): RuntimeHostSessionEventRelay {
	return new RuntimeHostSessionEventRelay({
		queueSidecar: { persist: () => undefined } as unknown as RuntimeHostQueueSidecar,
		synchronizeSessionIdentity: () => undefined,
		reportFailure: () => undefined,
	});
}

function createHandle(stream: RuntimeSessionEventStream, history: HistoryEntry[]): RuntimeHostSessionRecord {
	return {
		lifecycle: { sessionId: "session-1", sessionPath: "C:/sessions/session-1.jsonl" },
		stateReader: { readState: () => ({ activeToolNames: [] }) },
		historyReader: { readHistory: () => history },
		eventStream: stream,
	} as unknown as RuntimeHostSessionRecord;
}

function createOperations(
	relay: RuntimeHostSessionEventRelay,
	handle: RuntimeHostSessionRecord,
): RuntimeHostSessionOperations {
	return new RuntimeHostSessionOperations({
		directory: {
			resolveSessionKey: () => "session-key",
			get: () => handle,
		} as unknown as RuntimeHostSessionDirectory,
		events: relay,
		synchronizeSessionIdentity: () => undefined,
		reportWorkspacePreparationFailure: () => undefined,
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

function toolObservation(type: "tool.start" | "tool.end"): SessionEvent {
	return mapRuntimeSessionObservationEvent("session-1", {
		type,
		toolCallId: "call-1",
		toolName: "bash",
		...(type === "tool.start"
			? { args: { command: "ls" }, startedAt: 120 }
			: { result: { content: [] }, isError: false, startedAt: 120, durationMs: 30, phases: [] }),
		source: "tool",
	} as Parameters<typeof mapRuntimeSessionObservationEvent>[1]);
}

function partialOf(delta: string): AssistantMessage {
	return { role: "assistant", content: [{ type: "text", text: delta }] } as unknown as AssistantMessage;
}

describe("RuntimeHostSessionOperations.attach", () => {
	it("registers the subscriber, replays the running Turn and reads history in one synchronous step", async () => {
		const stream = createEventStream();
		const history: HistoryEntry[] = [
			{ type: "message", entryId: "e1", message: { role: "user", content: "go", timestamp: 1 } },
		];
		const handle = createHandle(stream, history);
		const relay = createRelay();
		relay.attach("session-key", handle, stream);
		const operations = createOperations(relay, handle);

		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "w", partial: partialOf("w") }));
		stream.emit(toolObservation("tool.start"));
		stream.emit(toolObservation("tool.end"));

		const received: SessionEvent[] = [];
		const attachment = operations.attach("session-1", (event) => received.push(event));

		// 注册、重放与历史读取之间无让出点：attach 返回前已收到运行中回合的 in-flight 事件。
		expect(
			received
				.filter((event) => event.channel === "assistant" || event.type.startsWith("tool."))
				.map((event) => event.type),
		).toEqual(["text_delta", "tool.start", "tool.end"]);
		expect(attachment.runningTurnId).toBe("turn-1");
		expect(attachment.history).toEqual(history);
		expect(attachment.history).not.toBe(history);

		// 后续事件只投递一次；退订后停止投递。
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "x", partial: partialOf("wx") }));
		await Promise.resolve();
		const liveDeltas = received.filter((event) => event.channel === "assistant" && event.type === "text_delta");
		expect(liveDeltas).toHaveLength(2);
		expect(liveDeltas.at(-1)).toMatchObject({ delta: "x" });

		attachment.unsubscribe();
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "y", partial: partialOf("wxy") }));
		await Promise.resolve();
		expect(received.filter((event) => event.channel === "assistant" && event.type === "text_delta")).toHaveLength(2);

		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});

	it("returns durable history without a running Turn identity when the session is idle", async () => {
		const stream = createEventStream();
		const history: HistoryEntry[] = [
			{ type: "message", entryId: "e1", message: { role: "user", content: "go", timestamp: 1 } },
		];
		const handle = createHandle(stream, history);
		const relay = createRelay();
		relay.attach("session-key", handle, stream);
		const operations = createOperations(relay, handle);

		const received: SessionEvent[] = [];
		const attachment = operations.attach("session-1", (event) => received.push(event));

		expect(attachment.runningTurnId).toBeUndefined();
		expect(attachment.history).toEqual(history);
		expect(attachment.history).not.toBe(history);
		expect(received.filter((event) => event.channel === "assistant" || event.type.startsWith("tool."))).toEqual([]);

		// 空闲会话 attach 后仍然是在线订阅：后续回合事件照常投递。
		stream.emit(lifecycleSessionEvent("session-1", "agent_start", 100));
		stream.emit(assistantEvent({ type: "text_delta", contentIndex: 0, delta: "a", partial: partialOf("a") }));
		await Promise.resolve();
		expect(
			received.filter((event) => event.channel === "assistant").map((event) => (event as { delta?: string }).delta),
		).toEqual(["a"]);

		attachment.unsubscribe();
		relay.release("session-key", handle.lifecycle.sessionPath, handle.lifecycle.sessionId);
	});
});
