import type { AssistantMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { decodeSessionEvent } from "./session-event-codec";

describe("decodeSessionEvent", () => {
	it("keeps a valid raw assistant event structurally unchanged", () => {
		const payload = {
			schemaVersion: 1,
			sessionId: "session-1",
			eventId: "event-1",
			timestamp: 10,
			source: "agent",
			sequence: 3,
			channel: "assistant",
			turnId: "turn-1",
			modelCallIndex: 0,
			type: "text_delta",
			contentIndex: 0,
			delta: "hello",
			partial: { role: "assistant", content: [] } as unknown as AssistantMessage,
		};

		expect(decodeSessionEvent(payload)).toBe(payload);
	});

	it("rejects malformed raw assistant deltas", () => {
		expect(() =>
			decodeSessionEvent({
				schemaVersion: 1,
				sessionId: "session-1",
				eventId: "event-1",
				timestamp: 10,
				source: "agent",
				channel: "assistant",
				modelCallIndex: 0,
				type: "text_delta",
				contentIndex: 0,
				partial: {},
			}),
		).toThrow("assistant delta is missing");
	});

	it("rejects assistant event types without the assistant channel", () => {
		expect(() =>
			decodeSessionEvent({
				schemaVersion: 1,
				sessionId: "session-1",
				eventId: "event-1",
				timestamp: 10,
				source: "agent",
				type: "text_delta",
				contentIndex: 0,
				delta: "hello",
				partial: {},
			}),
		).toThrow("unknown event type");
	});
});

/**
 * provider 重连活动（`AssistantMessageRetryEvent`）走的是 assistant 通道，但它没有
 * `partial`：它是同一次调用内的活动状态，不是新的消息行。旧的解码器白名单漏了这一
 * 类，导致 180s 停滞换连时整条会话事件流在 preload 边界被拒。
 */
describe("decodeSessionEvent：provider retry 活动", () => {
	function retryPayload(overrides: Record<string, unknown> = {}) {
		return {
			schemaVersion: 1,
			sessionId: "session-1",
			eventId: "event-retry-1",
			timestamp: 10,
			source: "agent",
			sequence: 4,
			channel: "assistant",
			turnId: "turn-1",
			modelCallIndex: 0,
			type: "retry",
			reason: "transient",
			attempt: 1,
			maxAttempts: 3,
			delayMs: 1500,
			errorMessage: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
			failure: {
				code: "AI_TRANSPORT_FAILED",
				message: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
				retryable: true,
				provider: "anthropic",
				modelId: "claude-sonnet-4-5",
				phase: "stream",
			},
			...overrides,
		};
	}

	it("keeps a valid retry activity event structurally unchanged", () => {
		const payload = retryPayload();

		expect(decodeSessionEvent(payload)).toBe(payload);
	});

	it("accepts retry activity without the optional structured failure", () => {
		const { failure: _failure, ...payload } = retryPayload();

		expect(decodeSessionEvent(payload)).toBe(payload);
	});

	it("rejects retry payloads the provider layer never emits", () => {
		expect(() => decodeSessionEvent(retryPayload({ reason: 1 }))).toThrow("assistant retry reason is invalid");
		expect(() => decodeSessionEvent(retryPayload({ attempt: 0 }))).toThrow("assistant retry attempt is invalid");
		expect(() => decodeSessionEvent(retryPayload({ maxAttempts: -1 }))).toThrow(
			"assistant retry maxAttempts is invalid",
		);
		expect(() => decodeSessionEvent(retryPayload({ delayMs: -1 }))).toThrow("assistant retry delayMs is invalid");
		expect(() => decodeSessionEvent(retryPayload({ errorMessage: undefined }))).toThrow(
			"assistant retry errorMessage is invalid",
		);
		expect(() => decodeSessionEvent(retryPayload({ failure: "boom" }))).toThrow("invalid assistant failure");
	});
});
