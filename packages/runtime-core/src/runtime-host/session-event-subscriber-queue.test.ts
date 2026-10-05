// Copyright The Open Forge contributors.
import type { AssistantMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../contracts.js";
import {
	DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT,
	isEphemeralSessionDeliveryEvent,
	SessionEventSubscriberQueue,
} from "./session-event-subscriber-queue.js";
import { baseSessionEvent } from "./session-events.js";

function partialOf(text: string): AssistantMessage {
	return { role: "assistant", content: [{ type: "text", text }] } as unknown as AssistantMessage;
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

function textDelta(contentIndex: number, delta: string): SessionEvent {
	return {
		...baseSessionEvent("session-1", "agent"),
		channel: "assistant",
		modelCallIndex: 0,
		type: "text_delta",
		contentIndex,
		delta,
		partial: partialOf(delta),
	} as SessionEvent;
}

function textStart(contentIndex: number): SessionEvent {
	return {
		...baseSessionEvent("session-1", "agent"),
		channel: "assistant",
		modelCallIndex: 0,
		type: "text_start",
		contentIndex,
		partial: partialOf(""),
	} as SessionEvent;
}

describe("SessionEventSubscriberQueue", () => {
	it("classifies assistant deltas as ephemeral", () => {
		expect(isEphemeralSessionDeliveryEvent(textDelta(0, "a"))).toBe(true);
	});

	it("coalesces adjacent deltas losslessly by concatenating payload", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event), 2);
		queue.enqueue(textDelta(0, "a"));
		queue.enqueue(textDelta(0, "b"));
		queue.enqueue(textDelta(0, "c"));
		await Promise.resolve();
		expect(delivered).toHaveLength(1);
		expect(delivered[0]).toMatchObject({ type: "text_delta", delta: "abc" });
		expect(queue.readStats().droppedEphemeral).toBe(0);
	});

	it("keeps deltas for distinct content indexes in order", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event));
		queue.enqueue(textDelta(0, "a"));
		queue.enqueue(textDelta(1, "x"));
		queue.enqueue(textDelta(0, "b"));
		await Promise.resolve();
		const positions = delivered.map((event) => {
			if (event.type !== "text_delta") throw new Error(`unexpected event ${event.type}`);
			return [event.contentIndex, event.delta];
		});
		expect(positions).toEqual([
			[0, "ab"],
			[1, "x"],
		]);
	});

	it("drops only droppable markers under pressure and counts them", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event), 2);
		queue.enqueue(textStart(0));
		queue.enqueue(textStart(1));
		queue.enqueue(textDelta(0, "a"));
		await Promise.resolve();
		expect(queue.readStats().droppedEphemeral).toBe(1);
		expect(delivered.map((event) => event.type)).toEqual(["text_start", "text_delta"]);
	});

	it("never drops delta-bearing or terminal events even beyond the limit", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event), 1);
		queue.enqueue(textDelta(0, "a"));
		queue.enqueue(textDelta(1, "b"));
		queue.enqueue(baseUsageUpdate("session-1"));
		expect(delivered).toHaveLength(3);
		expect(delivered.map((event) => event.type)).toEqual(["text_delta", "text_delta", "usage.update"]);
		expect(queue.readStats().droppedEphemeral).toBe(0);
	});

	it("delivers terminal events immediately and flushes pending deltas first", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event), 1);
		queue.enqueue(textDelta(0, "a"));
		queue.enqueue(baseUsageUpdate("session-1"));
		expect(delivered).toHaveLength(2);
		expect(delivered[0]?.type).toBe("text_delta");
		expect(delivered[1]?.type).toBe("usage.update");
		expect(queue.readStats().queued).toBe(0);
	});

	it("does not merge deltas across sessions", async () => {
		const delivered: SessionEvent[] = [];
		const queue = new SessionEventSubscriberQueue((event) => delivered.push(event));
		queue.enqueue(textDelta(0, "a"));
		queue.enqueue({ ...textDelta(0, "b"), sessionId: "session-2" });
		await Promise.resolve();
		expect(delivered).toHaveLength(2);
	});

	it("defaults queue limit to 4096", () => {
		expect(DEFAULT_SUBSCRIBER_EVENT_QUEUE_LIMIT).toBe(4096);
	});
});
