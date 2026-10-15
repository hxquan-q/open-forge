import type { IpcRenderer, IpcRendererEvent } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSessionEvent } from "../../shared/session-event-codec.js";
import { MAX_CONSECUTIVE_DECODE_FAILURES, subscribeById } from "./helper";

type IpcListener = Parameters<IpcRenderer["on"]>[1];

/**
 * 真实链路上 provider 重连活动与普通 assistant 事件共用 session 事件通道，所以
 * subscribeById 的契约测试直接用生产解码器，而不是恒等 decode：解码失败必须被
 * 有界容错接住，且 decodeSessionEvent 自身不认识的重连事件不得被拒。
 */
const RETRY_SESSION_EVENT = {
	schemaVersion: 1,
	channel: "assistant",
	sessionId: "session-1",
	eventId: "event-retry-1",
	timestamp: 10,
	source: "agent",
	sequence: 4,
	turnId: "turn-1",
	modelCallIndex: 0,
	type: "retry",
	reason: "transient",
	attempt: 1,
	maxAttempts: 3,
	delayMs: 1500,
	errorMessage: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
} as const;

describe("subscribeById", () => {
	it("delivers the subscription snapshot after the listener is installed", async () => {
		const harness = createIpcHarness(
			["subscription"],
			[{ type: "session-snapshot" }],
			[{ type: "conversation.agent-message-event", delta: "buffered" }],
		);
		const handler = vi.fn();
		await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", handler, ["session"]);
		expect(handler.mock.calls).toEqual([
			[{ type: "session-snapshot" }],
			[{ type: "conversation.agent-message-event", delta: "buffered" }],
		]);
		expect(harness.listenerCount("event")).toBe(1);
	});

	it("isolates concurrent subscriptions and unsubscribes only the selected id", async () => {
		const harness = createIpcHarness(["subscription-a", "subscription-b"]);
		const first = vi.fn();
		const second = vi.fn();
		const unsubscribeFirst = await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", first, [
			"session-a",
		]);
		const unsubscribeSecond = await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", second, [
			"session-b",
		]);

		harness.emit("event", "subscription-a", { type: "message.delta", delta: "first" });
		expect(first).toHaveBeenCalledWith({ type: "message.delta", delta: "first" });
		expect(second).not.toHaveBeenCalled();

		unsubscribeFirst();
		harness.emit("event", "subscription-b", { type: "message.delta", delta: "second" });
		expect(second).toHaveBeenCalledWith({ type: "message.delta", delta: "second" });
		expect(harness.invoke).toHaveBeenCalledWith("unsubscribe", "subscription-a");
		expect(harness.listenerCount("event")).toBe(1);

		unsubscribeSecond();
		expect(harness.invoke).toHaveBeenCalledWith("unsubscribe", "subscription-b");
		expect(harness.listenerCount("event")).toBe(0);
	});
});

describe("subscribeById：载荷解码失败的容错边界", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("把 provider retry 事件原样送达订阅方", async () => {
		const harness = createIpcHarness(["subscription"]);
		const handler = vi.fn();
		await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", handler, ["session"], decodeSessionEvent);

		harness.emit("event", "subscription", RETRY_SESSION_EVENT);

		expect(handler.mock.calls).toEqual([[RETRY_SESSION_EVENT]]);
	});

	it("单条坏载荷不中断订阅，也不打乱后续事件顺序", async () => {
		const harness = createIpcHarness(["subscription"]);
		const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const handler = vi.fn();
		await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", handler, ["session"], decodeSessionEvent);

		harness.emit("event", "subscription", { channel: "assistant", type: "text_delta" });
		harness.emit("event", "subscription", RETRY_SESSION_EVENT);

		expect(handler.mock.calls).toEqual([[RETRY_SESSION_EVENT]]);
		expect(harness.listenerCount("event")).toBe(1);
		// 容错 ≠ 吞掉：坏载荷必须留下可观测的痕迹。
		expect(report).toHaveBeenCalled();
	});

	it("快照载荷坏掉时不留下悬挂的监听器", async () => {
		const harness = createIpcHarness(["subscription"], [{ channel: "assistant", type: "text_delta" }]);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const handler = vi.fn();

		const unsubscribe = await subscribeById(
			harness.ipc,
			"subscribe",
			"event",
			"unsubscribe",
			handler,
			["session"],
			decodeSessionEvent,
		);
		harness.emit("event", "subscription", RETRY_SESSION_EVENT);

		expect(handler.mock.calls).toEqual([[RETRY_SESSION_EVENT]]);
		unsubscribe();
		expect(harness.listenerCount("event")).toBe(0);
	});

	it("连续坏载荷堆到上限后不再容错，把协议错误抛回调用方", async () => {
		const harness = createIpcHarness(["subscription"]);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const handler = vi.fn();
		await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", handler, ["session"], decodeSessionEvent);

		for (let index = 0; index < MAX_CONSECUTIVE_DECODE_FAILURES - 1; index += 1) {
			harness.emit("event", "subscription", { channel: "assistant", type: "text_delta" });
		}
		expect(() => harness.emit("event", "subscription", { channel: "assistant", type: "text_delta" })).toThrow(
			"Invalid SessionEvent IPC payload",
		);
		expect(handler).not.toHaveBeenCalled();
	});

	it("解码恢复成功后重新计数，偶发坏包不会被累计成协议错误", async () => {
		const harness = createIpcHarness(["subscription"]);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const handler = vi.fn();
		await subscribeById(harness.ipc, "subscribe", "event", "unsubscribe", handler, ["session"], decodeSessionEvent);

		for (let round = 0; round < MAX_CONSECUTIVE_DECODE_FAILURES + 1; round += 1) {
			harness.emit("event", "subscription", { channel: "assistant", type: "text_delta" });
			harness.emit("event", "subscription", RETRY_SESSION_EVENT);
		}

		expect(handler).toHaveBeenCalledTimes(MAX_CONSECUTIVE_DECODE_FAILURES + 1);
		expect(harness.listenerCount("event")).toBe(1);
	});
});

function createIpcHarness(
	subscriptionIds: string[],
	initial: unknown[] = [],
	duringSubscribe: unknown[] = [],
): {
	readonly emit: (channel: string, subscriptionId: string, payload: unknown) => void;
	readonly ipc: IpcRenderer;
	readonly invoke: ReturnType<typeof vi.fn>;
	readonly listenerCount: (channel: string) => number;
} {
	const listeners = new Map<string, Set<IpcListener>>();
	let nextSubscription = 0;
	const emit = (channel: string, subscriptionId: string, payload: unknown): void => {
		for (const listener of listeners.get(channel) ?? []) {
			listener({} as IpcRendererEvent, subscriptionId, payload);
		}
	};
	const invoke = vi.fn(async (channel: string) => {
		if (channel !== "subscribe") return undefined;
		const index = nextSubscription++;
		if (duringSubscribe[index] !== undefined) {
			emit("event", subscriptionIds[index], duringSubscribe[index]);
		}
		return {
			subscriptionId: subscriptionIds[index],
			...(initial[index] === undefined ? {} : { initial: initial[index] }),
		};
	});
	const ipc = {
		invoke,
		on: vi.fn((channel: string, listener: IpcListener) => {
			const current = listeners.get(channel) ?? new Set<IpcListener>();
			current.add(listener);
			listeners.set(channel, current);
			return ipc;
		}),
		removeListener: vi.fn((channel: string, listener: IpcListener) => {
			listeners.get(channel)?.delete(listener);
			return ipc;
		}),
	} as unknown as IpcRenderer;
	return {
		ipc,
		invoke,
		emit,
		listenerCount: (channel) => listeners.get(channel)?.size ?? 0,
	};
}
