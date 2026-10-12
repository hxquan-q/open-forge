import { afterEach, describe, expect, it } from "vitest";
import { registerApiProvider, unregisterApiProviders } from "../src/api-registry.js";
import {
	AI_ERROR_CODES,
	AIAbortedError,
	AIError,
	type AIErrorDetails,
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type Context,
	createAssistantMessage,
	getAIErrorDetails,
	isAssistantMessageTerminalEvent,
} from "../src/protocol/index.js";
import {
	isOpaqueBadRequest,
	type ProviderRetryAttemptMode,
	streamWithProviderRetry,
	stripOutputLimitFieldsInPlace,
	withoutDerivedOutputLimit,
} from "../src/provider-kit/provider-retry.js";
import { streamSimple } from "../src/stream.js";
import { ScriptedLanguageModel } from "../src/testing/scripted-language-model.js";
import type { Model } from "../src/types.js";
import { AssistantMessageEventStream } from "../src/utils/event-stream.js";

const TEST_API = "provider-retry-test";
const TEST_SOURCE = "provider-retry-test";

const MODEL: Model<Api> = {
	id: "retry-model",
	name: "retry-model",
	api: TEST_API,
	provider: "openai",
	baseUrl: "https://example.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 2048,
};

const CONTEXT: Context = {
	messages: [{ role: "user", content: "hi", timestamp: 1 }],
	systemPrompt: "test",
};

function createPartial(text = ""): AssistantMessage {
	const message = createAssistantMessage({ api: MODEL.api, provider: MODEL.provider, model: MODEL.id });
	if (text) message.content = [{ type: "text", text }];
	return message;
}

function rateLimitedFailure(retryAfterMs?: number): AIErrorDetails {
	return getAIErrorDetails(
		new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", {
			retryable: true,
			statusCode: 429,
			...(retryAfterMs === undefined ? {} : { retryAfterMs }),
		}),
	);
}

function invalidRequestFailure(message = "invalid request"): AIErrorDetails {
	return getAIErrorDetails(
		new AIError(AI_ERROR_CODES.INVALID_REQUEST, message, { retryable: false, statusCode: 400 }),
	);
}

function opaqueBadRequestFailure(statusCode: 400 | 422 = 400): AIErrorDetails {
	return getAIErrorDetails(
		new AIError(AI_ERROR_CODES.INVALID_REQUEST, `${statusCode} status code (no body)`, {
			retryable: false,
			statusCode,
		}),
	);
}

function errorEvent(failure: AIErrorDetails): AssistantMessageEvent {
	return {
		type: "error",
		reason: "error",
		error: { ...createPartial(), stopReason: "error", errorMessage: failure.message },
		failure,
	};
}

function doneEvent(text: string): AssistantMessageEvent {
	const message = createPartial(text);
	return { type: "done", reason: "stop", message };
}

function startEvent(text = ""): AssistantMessageEvent {
	return { type: "start", partial: createPartial(text) };
}

function deltaEvent(partial: AssistantMessage, delta: string, contentIndex = 0): AssistantMessageEvent {
	partial.content = [{ type: "text", text: ((partial.content[0] as { text?: string })?.text ?? "") + delta }];
	return { type: "text_delta", contentIndex, delta, partial };
}

interface AttemptSpec {
	readonly events?: readonly AssistantMessageEvent[];
	readonly fail?: unknown;
	readonly hang?: boolean;
	readonly throwError?: unknown;
	aborted?: boolean;
}

interface OpenedAttempt {
	readonly signal: AbortSignal;
	readonly mode?: ProviderRetryAttemptMode;
}

/** Deterministic provider-attempt factory: each call consumes one spec in order. */
function scriptedOpener(specs: readonly AttemptSpec[], opened: OpenedAttempt[] = []) {
	return (signal: AbortSignal, mode?: ProviderRetryAttemptMode) => {
		const spec = specs[opened.length] ?? { fail: new Error("unexpected provider attempt") };
		opened.push({ signal, mode });
		if (spec.throwError !== undefined) throw spec.throwError;
		const stream = new AssistantMessageEventStream();
		const onAbort = () => {
			spec.aborted = true;
			stream.fail(new AIAbortedError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		queueMicrotask(() => {
			if (signal.aborted) {
				onAbort();
				return;
			}
			for (const event of spec.events ?? []) stream.push(event);
			if (spec.hang) return;
			// Settled specs no longer need the abort hook; hanging ones keep it so a
			// watchdog or caller abort still settles the abandoned stream.
			signal.removeEventListener("abort", onAbort);
			if (spec.fail !== undefined) {
				stream.fail(spec.fail);
				return;
			}
			if (!(spec.events ?? []).some((event) => isAssistantMessageTerminalEvent(event))) stream.end();
		});
		return stream;
	};
}

async function collect(stream: AssistantMessageEventStream) {
	const events: AssistantMessageEvent[] = [];
	for await (const event of stream) events.push(event);
	return { events, result: await stream.result() };
}

function retryEvents(events: readonly AssistantMessageEvent[]) {
	return events.filter((event): event is Extract<AssistantMessageEvent, { type: "retry" }> => event.type === "retry");
}

describe("streamWithProviderRetry", () => {
	it("retries a request-phase 429 and emits retry activity on the same stream", async () => {
		const delays: number[] = [];
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[{ events: [errorEvent(rateLimitedFailure())] }, { events: [startEvent(), doneEvent("hello")] }],
				opened,
			),
			{ model: MODEL, sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
		);
		const { events, result } = await collect(stream);

		expect(opened).toHaveLength(2);
		expect(result.stopReason).toBe("stop");
		expect(events.map((event) => event.type)).toEqual(["retry", "start", "done"]);
		expect(retryEvents(events)[0]).toMatchObject({
			reason: "rate_limit",
			attempt: 1,
			maxAttempts: 10,
			errorMessage: "Rate limit reached",
		});
		expect(delays).toEqual([2_000]);
	});

	it("honors retryAfterMs from the failure instead of backoff", async () => {
		const delays: number[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener([
				{ events: [errorEvent(rateLimitedFailure(4_321))] },
				{ events: [startEvent(), doneEvent("ok")] },
			]),
			{ model: MODEL, sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
		);
		await collect(stream);
		expect(delays).toEqual([4_321]);
	});

	it("caps server-declared delays at the track maximum", async () => {
		const delays: number[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener([
				{ events: [errorEvent(rateLimitedFailure(600_000))] },
				{ events: [startEvent(), doneEvent("ok")] },
			]),
			{ model: MODEL, sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
		);
		await collect(stream);
		expect(delays).toEqual([30_000]);
	});

	it("shares the rate-limit budget across request and stream phases", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[
					{ events: [errorEvent(rateLimitedFailure())] },
					{ events: [errorEvent(rateLimitedFailure())] },
					{
						events: [startEvent()],
						fail: new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", {
							retryable: true,
							statusCode: 429,
						}),
					},
					{ events: [errorEvent(rateLimitedFailure())] },
				],
				opened,
			),
			{ model: MODEL, maxRetries: 3, sleep: async () => undefined, random: () => 0.5 },
		);
		const { events } = await collect(stream);

		expect(opened).toHaveLength(4);
		expect(retryEvents(events)).toHaveLength(3);
		expect(retryEvents(events).every((event) => event.reason === "rate_limit")).toBe(true);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") {
			expect(terminal.failure?.statusCode).toBe(429);
			expect(terminal.failure?.code).toBe(AI_ERROR_CODES.RATE_LIMITED);
		}
	});

	it("keeps transient and rate-limit budgets independent", async () => {
		const delays: number[] = [];
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[
					{ fail: new AIError(AI_ERROR_CODES.TRANSPORT_FAILED, "reset", { retryable: true }) },
					{ fail: new AIError(AI_ERROR_CODES.TRANSPORT_FAILED, "reset", { retryable: true }) },
					{ events: [errorEvent(rateLimitedFailure())] },
					{ events: [errorEvent(rateLimitedFailure())] },
					{ events: [errorEvent(rateLimitedFailure())] },
				],
				opened,
			),
			{ model: MODEL, maxRetries: 2, sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
		);
		const { events } = await collect(stream);

		expect(opened).toHaveLength(5);
		const retries = retryEvents(events);
		expect(retries.map((event) => event.reason)).toEqual(["transient", "transient", "rate_limit", "rate_limit"]);
		expect(delays).toEqual([1_000, 2_000, 2_000, 4_000]);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") expect(terminal.failure?.statusCode).toBe(429);
	});

	it("produces a diagnosable terminal error when the budget is exhausted", async () => {
		const stream = streamWithProviderRetry(
			scriptedOpener([
				{ events: [errorEvent(rateLimitedFailure())] },
				{ events: [errorEvent(rateLimitedFailure())] },
			]),
			{ model: MODEL, maxRetries: 1, sleep: async () => undefined },
		);
		const { events } = await collect(stream);

		expect(events.map((event) => event.type)).toEqual(["retry", "error"]);
		const terminal = events.at(-1);
		if (terminal?.type === "error") {
			expect(terminal.failure?.code).toBe(AI_ERROR_CODES.RATE_LIMITED);
			expect(terminal.failure?.retryable).toBe(true);
			expect(terminal.error.errorMessage).toBe("Rate limit reached");
		}
	});

	it("does not retry non-retryable failures", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener([{ events: [errorEvent(invalidRequestFailure())] }], opened),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events } = await collect(stream);
		expect(opened).toHaveLength(1);
		expect(events.map((event) => event.type)).toEqual(["error"]);
	});

	it("fails fast when the server-declared delay exceeds maxRetryDelayMs", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener([{ events: [errorEvent(rateLimitedFailure(120_000))] }], opened),
			{ model: MODEL, maxRetryDelayMs: 60_000, sleep: async () => undefined },
		);
		const { events } = await collect(stream);
		expect(opened).toHaveLength(1);
		expect(events.map((event) => event.type)).toEqual(["error"]);
	});

	it("feeds zero-event stalls into the transient budget and aborts the stalled attempt", async () => {
		const specs: AttemptSpec[] = [{ hang: true }, { events: [startEvent(), doneEvent("recovered")] }];
		const opened: OpenedAttempt[] = [];
		const delays: number[] = [];
		const stream = streamWithProviderRetry(scriptedOpener(specs, opened), {
			model: MODEL,
			streamIdleTimeoutMs: 30,
			sleep: async (ms) => void delays.push(ms),
		});
		const { events, result } = await collect(stream);

		expect(result.stopReason).toBe("stop");
		expect(opened).toHaveLength(2);
		expect(specs[0].aborted).toBe(true);
		expect(opened[0].signal.aborted).toBe(true);
		const retries = retryEvents(events);
		expect(retries).toHaveLength(1);
		expect(retries[0].reason).toBe("transient");
		expect(retries[0].failure?.code).toBe(AI_ERROR_CODES.TRANSPORT_FAILED);
		expect(retries[0].failure?.phase).toBe("stream");
		expect(retries[0].errorMessage).toContain("stream_idle_timeout");
		expect(delays).toEqual([1_000]);
	});

	it("surfaces a terminal idle-timeout failure when the transient budget is exhausted", async () => {
		const stream = streamWithProviderRetry(scriptedOpener([{ hang: true }, { hang: true }]), {
			model: MODEL,
			maxRetries: 1,
			streamIdleTimeoutMs: 30,
			sleep: async () => undefined,
		});
		const { events } = await collect(stream);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") {
			expect(terminal.failure?.phase).toBe("stream");
			expect(terminal.failure?.message).toContain("stream_idle_timeout");
		}
	});

	it("caps stall retries so a muted provider reaches a terminal failure instead of burning the transient budget", async () => {
		// Every attempt stalls with zero events: a connection that is accepted but never speaks.
		const specs: AttemptSpec[] = [
			{ hang: true },
			{ hang: true },
			{ hang: true },
			{ events: [startEvent(), doneEvent("unreached")] },
		];
		const opened: OpenedAttempt[] = [];
		const delays: number[] = [];
		const stream = streamWithProviderRetry(scriptedOpener(specs, opened), {
			model: MODEL,
			streamIdleTimeoutMs: 30,
			sleep: async (ms) => void delays.push(ms),
		});
		const { events } = await collect(stream);

		// A stalled attempt costs a whole watchdog window, so the stall cascade must be
		// bounded far below the shared transient budget: one retry, then a terminal failure.
		expect(opened).toHaveLength(2);
		expect(specs[1]?.aborted).toBe(true);
		expect(retryEvents(events)).toHaveLength(1);
		expect(delays).toEqual([1_000]);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") {
			expect(terminal.failure?.message).toContain("stream_idle_timeout");
		}
	});

	it("stops immediately when the caller aborts during the retry delay", async () => {
		const controller = new AbortController();
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(scriptedOpener([{ events: [errorEvent(rateLimitedFailure())] }], opened), {
			model: MODEL,
			signal: controller.signal,
			sleep: async () => controller.abort(),
		});
		const { events, result } = await collect(stream);

		expect(opened).toHaveLength(1);
		expect(result.stopReason).toBe("aborted");
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") expect(terminal.reason).toBe("aborted");
	});

	it("does not consume budget or retry when the caller aborts mid-stream", async () => {
		const controller = new AbortController();
		const specs: AttemptSpec[] = [{ events: [startEvent()], hang: true }];
		const stream = streamWithProviderRetry(scriptedOpener(specs), {
			model: MODEL,
			signal: controller.signal,
			streamIdleTimeoutMs: 5_000,
			sleep: async () => undefined,
		});
		const events: AssistantMessageEvent[] = [];
		for await (const event of stream) {
			events.push(event);
			if (event.type === "start") controller.abort();
		}
		const result = await stream.result();

		expect(result.stopReason).toBe("aborted");
		expect(specs[0].aborted).toBe(true);
		expect(retryEvents(events)).toHaveLength(0);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") expect(terminal.reason).toBe("aborted");
	});

	it("never opens an attempt when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(scriptedOpener([], opened), {
			model: MODEL,
			signal: controller.signal,
		});
		const { events, result } = await collect(stream);
		expect(opened).toHaveLength(0);
		expect(result.stopReason).toBe("aborted");
		expect(events.at(-1)?.type).toBe("error");
	});

	it("preserves partial output on one assistant identity across attempts", async () => {
		const attemptOne = createPartial();
		const attemptTwo = createPartial();
		const stream = streamWithProviderRetry(
			scriptedOpener([
				{
					events: [
						{ type: "start", partial: attemptOne },
						deltaEvent(attemptOne, "hel"),
						deltaEvent(attemptOne, "lo"),
					],
					fail: new AIError(AI_ERROR_CODES.TRANSPORT_FAILED, "dropped", { retryable: true }),
				},
				{
					events: [
						{ type: "start", partial: attemptTwo },
						deltaEvent(attemptTwo, "wor"),
						deltaEvent(attemptTwo, "ld"),
						doneEvent("world"),
					],
				},
			]),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events, result } = await collect(stream);

		expect(result.stopReason).toBe("stop");
		expect(result.content).toEqual([{ type: "text", text: "world" }]);
		expect(events.filter((event) => event.type === "start")).toHaveLength(1);
		expect(retryEvents(events)).toHaveLength(1);

		const partialEvents = events.filter(
			(event): event is Extract<AssistantMessageEvent, { partial: AssistantMessage }> =>
				"partial" in event && event.partial !== undefined,
		);
		const shared = partialEvents[0].partial;
		expect(partialEvents.every((event) => event.partial === shared)).toBe(true);
	});
});

describe("streamSimple unified retry", () => {
	afterEach(() => {
		unregisterApiProviders(TEST_SOURCE);
	});

	it("recovers a long-running call after consecutive 429s without transport retries", async () => {
		const scripted = new ScriptedLanguageModel([
			{
				error: new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", {
					retryable: true,
					statusCode: 429,
					retryAfterMs: 1,
				}),
			},
			{
				error: new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", {
					retryable: true,
					statusCode: 429,
					retryAfterMs: 1,
				}),
			},
			{ events: [startEvent(), doneEvent("done")] },
		]);
		registerApiProvider(
			{
				api: TEST_API,
				stream: (model, context, options) => scripted.stream(model, context, options),
				streamSimple: (model, context, options) => scripted.stream(model, context, options),
			},
			TEST_SOURCE,
		);

		const stream = streamSimple(MODEL, CONTEXT, { maxRetries: 5 });
		const { events, result } = await collect(stream);

		expect(result.stopReason).toBe("stop");
		expect(scripted.calls).toHaveLength(3);
		// The unified layer owns retry policy: transport-local retries stay off even
		// when the caller asks for them.
		expect(scripted.calls.every((call) => call.options?.maxRetries === 0)).toBe(true);
		expect(retryEvents(events)).toHaveLength(2);
		expect(events.map((event) => event.type)).toEqual(["retry", "retry", "start", "done"]);
	});

	it("disables the unified layer when providerRetry.maxRetries is 0", async () => {
		const scripted = new ScriptedLanguageModel([
			{
				error: new AIError(AI_ERROR_CODES.RATE_LIMITED, "Rate limit reached", {
					retryable: true,
					statusCode: 429,
					retryAfterMs: 1,
				}),
			},
		]);
		registerApiProvider(
			{
				api: TEST_API,
				stream: (model, context, options) => scripted.stream(model, context, options),
				streamSimple: (model, context, options) => scripted.stream(model, context, options),
			},
			TEST_SOURCE,
		);

		const { events } = await collect(streamSimple(MODEL, CONTEXT, { providerRetry: { maxRetries: 0 } }));
		expect(scripted.calls).toHaveLength(1);
		expect(retryEvents(events)).toHaveLength(0);
		expect(events.at(-1)?.type).toBe("error");
	});
});

describe("isOpaqueBadRequest", () => {
	it("matches the narrow opaque 400/422 shape only", () => {
		expect(isOpaqueBadRequest(opaqueBadRequestFailure(400))).toBe(true);
		expect(isOpaqueBadRequest(opaqueBadRequestFailure(422))).toBe(true);
	});

	it("rejects structured, non-4xx, retryable, or body-carrying failures", () => {
		expect(isOpaqueBadRequest(invalidRequestFailure())).toBe(false);
		expect(
			isOpaqueBadRequest(
				getAIErrorDetails(
					new AIError(AI_ERROR_CODES.INVALID_REQUEST, "403 status code (no body)", {
						retryable: false,
						statusCode: 403,
					}),
				),
			),
		).toBe(false);
		expect(isOpaqueBadRequest(rateLimitedFailure())).toBe(false);
		expect(
			isOpaqueBadRequest(
				getAIErrorDetails(
					new AIError(AI_ERROR_CODES.INVALID_REQUEST, "400 status code (no body)", {
						retryable: false,
						statusCode: 400,
						responseBodyPreview: '{"error":"max_tokens unsupported"}',
					}),
				),
			),
		).toBe(false);
	});
});

describe("stripOutputLimitFieldsInPlace", () => {
	it("removes only the derived output-limit fields", () => {
		const payload = { model: "m", max_tokens: 1, max_completion_tokens: 2, max_output_tokens: 3, other: "keep" };
		stripOutputLimitFieldsInPlace(payload);
		expect(payload).toEqual({ model: "m", other: "keep" });
		expect(stripOutputLimitFieldsInPlace("raw")).toBeUndefined();
	});
});

describe("withoutDerivedOutputLimit", () => {
	it("runs the caller hook then strips the outgoing payload in place", async () => {
		const observed: unknown[] = [];
		const options = withoutDerivedOutputLimit({ onPayload: (payload: unknown) => observed.push(payload) });
		const payload = { max_output_tokens: 8_192, keep: true };
		options.onPayload?.(payload);
		expect(observed).toHaveLength(1);
		expect(payload).toEqual({ keep: true });
	});
});

describe("streamWithProviderRetry output-limit repair", () => {
	afterEach(() => {
		unregisterApiProviders(TEST_SOURCE);
	});

	it("silently repairs one opaque request-phase 400 and emits no retry activity", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[{ events: [errorEvent(opaqueBadRequestFailure())] }, { events: [startEvent(), doneEvent("ok")] }],
				opened,
			),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events, result } = await collect(stream);

		expect(opened).toHaveLength(2);
		expect(opened[0].mode).toBe("normal");
		expect(opened[1].mode).toBe("output_limit_repair");
		expect(result.stopReason).toBe("stop");
		expect(retryEvents(events)).toHaveLength(0);
		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
	});

	it("repairs opaque failures thrown while opening the attempt", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[
					{
						throwError: new AIError(AI_ERROR_CODES.INVALID_REQUEST, "422 status code (no body)", {
							statusCode: 422,
						}),
					},
					{ events: [startEvent(), doneEvent("ok")] },
				],
				opened,
			),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events, result } = await collect(stream);
		expect(opened).toHaveLength(2);
		expect(opened[1].mode).toBe("output_limit_repair");
		expect(result.stopReason).toBe("stop");
		expect(retryEvents(events)).toHaveLength(0);
		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
	});

	it("repairs at most once and surfaces the second opaque failure untouched", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[{ events: [errorEvent(opaqueBadRequestFailure())] }, { events: [errorEvent(opaqueBadRequestFailure())] }],
				opened,
			),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events } = await collect(stream);

		expect(opened).toHaveLength(2);
		expect(retryEvents(events)).toHaveLength(0);
		const terminal = events.at(-1);
		expect(terminal?.type).toBe("error");
		if (terminal?.type === "error") {
			expect(terminal.failure?.statusCode).toBe(400);
			expect(terminal.failure?.code).toBe(AI_ERROR_CODES.INVALID_REQUEST);
		}
	});

	it("does not repair opaque failures that arrive after the stream started", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener([{ events: [startEvent(), errorEvent(opaqueBadRequestFailure())] }], opened),
			{ model: MODEL, sleep: async () => undefined },
		);
		const { events } = await collect(stream);
		expect(opened).toHaveLength(1);
		expect(events.at(-1)?.type).toBe("error");
	});

	it("keeps repair attempts budget-free so both tracks stay untouched", async () => {
		const opened: OpenedAttempt[] = [];
		const stream = streamWithProviderRetry(
			scriptedOpener(
				[
					{ events: [errorEvent(opaqueBadRequestFailure())] },
					{ events: [errorEvent(rateLimitedFailure())] },
					{ events: [startEvent(), doneEvent("ok")] },
				],
				opened,
			),
			{ model: MODEL, sleep: async () => undefined, random: () => 0.5 },
		);
		const { events, result } = await collect(stream);

		expect(opened).toHaveLength(3);
		expect(result.stopReason).toBe("stop");
		const retries = retryEvents(events);
		expect(retries).toHaveLength(1);
		expect(retries[0].attempt).toBe(1);
		expect(retries[0].reason).toBe("rate_limit");
	});

	it("strips derived output-limit fields through the provider payload hook", async () => {
		const scripted = new ScriptedLanguageModel([
			{ error: new AIError(AI_ERROR_CODES.INVALID_REQUEST, "400 status code (no body)", { statusCode: 400 }) },
			{ events: [startEvent(), doneEvent("recovered")] },
		]);
		registerApiProvider(
			{
				api: TEST_API,
				stream: (model, context, options) => scripted.stream(model, context, options),
				streamSimple: (model, context, options) => scripted.stream(model, context, options),
			},
			TEST_SOURCE,
		);

		const { events, result } = await collect(streamSimple(MODEL, CONTEXT));

		expect(result.stopReason).toBe("stop");
		expect(scripted.calls).toHaveLength(2);
		expect(scripted.calls[0].options?.onPayload).toBeUndefined();
		// The repair attempt wraps onPayload so the outgoing payload drops every
		// auto-derived output-limit field while keeping the rest of the request.
		const payload = { model: "m", max_tokens: 1, max_completion_tokens: 2, max_output_tokens: 3, other: "keep" };
		scripted.calls[1].options?.onPayload?.(payload);
		expect(payload).toEqual({ model: "m", other: "keep" });
		expect(retryEvents(events)).toHaveLength(0);
		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
	});

	it("still runs the caller onPayload hook before stripping on the repair attempt", async () => {
		const scripted = new ScriptedLanguageModel([
			{ error: new AIError(AI_ERROR_CODES.INVALID_REQUEST, "422 status code (no body)", { statusCode: 422 }) },
			{ events: [startEvent(), doneEvent("recovered")] },
		]);
		registerApiProvider(
			{
				api: TEST_API,
				stream: (model, context, options) => scripted.stream(model, context, options),
				streamSimple: (model, context, options) => scripted.stream(model, context, options),
			},
			TEST_SOURCE,
		);
		const observed: unknown[] = [];

		await collect(streamSimple(MODEL, CONTEXT, { onPayload: (payload) => observed.push(payload) }));

		const payload = { max_output_tokens: 1_024, keep: true };
		scripted.calls[1].options?.onPayload?.(payload);
		expect(observed).toHaveLength(1);
		expect(payload).toEqual({ keep: true });
	});

	it("never strips a caller-provided maxTokens and leaves the error terminal", async () => {
		const scripted = new ScriptedLanguageModel([
			{ error: new AIError(AI_ERROR_CODES.INVALID_REQUEST, "400 status code (no body)", { statusCode: 400 }) },
			{ events: [startEvent(), doneEvent("unreached")] },
		]);
		registerApiProvider(
			{
				api: TEST_API,
				stream: (model, context, options) => scripted.stream(model, context, options),
				streamSimple: (model, context, options) => scripted.stream(model, context, options),
			},
			TEST_SOURCE,
		);

		const { events } = await collect(streamSimple(MODEL, CONTEXT, { maxTokens: 4_096 }));

		expect(scripted.calls).toHaveLength(1);
		expect(events.at(-1)?.type).toBe("error");
	});

	it("skips repair when outputLimitRepair is disabled or the layer is off", async () => {
		for (const config of [
			{ outputLimitRepair: false },
			{ maxRetries: 0 },
			// An explicit repair opt-in still loses to a disabled unified layer.
			{ maxRetries: 0, outputLimitRepair: true },
		] as const) {
			const opened: OpenedAttempt[] = [];
			const stream = streamWithProviderRetry(
				scriptedOpener([{ events: [errorEvent(opaqueBadRequestFailure())] }], opened),
				{ model: MODEL, sleep: async () => undefined, ...config },
			);
			const { events } = await collect(stream);
			expect(opened).toHaveLength(1);
			expect(events.at(-1)?.type).toBe("error");
		}
	});
});
