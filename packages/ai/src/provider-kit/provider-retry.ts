// Copyright The Open Forge contributors.
import {
	AI_ERROR_CODES,
	AIAbortedError,
	AIError,
	type AIErrorDetails,
	AIStreamProtocolError,
	type Api,
	type AssistantMessage,
	type AssistantMessageErrorEvent,
	type AssistantMessageEvent,
	type AssistantMessageRetryEvent,
	createAssistantMessage,
	getAIErrorDetails,
	isAIError,
	type ProviderRetryReason,
} from "../protocol/index.js";
import type { Model } from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { normalizeProviderError } from "./provider-error.js";

/** Per-track retry budgets shared by request-establishment and stream phases. */
export const PROVIDER_RATE_LIMIT_MAX_RETRIES = 10;
export const PROVIDER_TRANSIENT_MAX_RETRIES = 10;
/** Default zero-event watchdog for one provider attempt. */
export const PROVIDER_STREAM_IDLE_TIMEOUT_DEFAULT_MS = 180_000;
/**
 * Stall-specific retry cap. A stalled attempt eats a whole zero-event watchdog window
 * (180s by default), so letting stalls ride the shared transient budget keeps a
 * user-visible turn "processing" for ~30 minutes on a connection that is accepted but
 * never speaks (BUG-0085). Stalls therefore re-open at most this many times before the
 * failure is surfaced; ordinary transient failures keep the full shared budget.
 */
export const PROVIDER_STREAM_STALL_MAX_RETRIES = 1;

const PROVIDER_RATE_LIMIT_BASE_DELAY_MS = 2_000;
const PROVIDER_RATE_LIMIT_MAX_DELAY_MS = 30_000;
const PROVIDER_RATE_LIMIT_JITTER_RATIO = 0.25;
const PROVIDER_TRANSIENT_BASE_DELAY_MS = 1_000;
const PROVIDER_TRANSIENT_MAX_DELAY_MS = 8_000;
const STREAM_IDLE_STALLED = Symbol("provider-stream-idle-stalled");
const CALLER_ABORTED = Symbol("provider-stream-caller-aborted");

/**
 * OpenAI-style SDK clients summarize an unreadable failure as
 * "<status> status code (no body)". A pre-stream 400/422 with that shape
 * gives the caller nothing to act on; the request was assembled from
 * catalog-derived values (the auto-filled output limit above all) that an
 * OpenAI-compatible gateway is free to reject without a word.
 */
const OPAQUE_ERROR_BODY_PATTERN = /\(\s*no\s+body\s*\)\s*$/i;

/** Output-limit fields providers derive from model catalog or caller options. */
export const OUTPUT_LIMIT_FIELDS = ["max_tokens", "max_completion_tokens", "max_output_tokens"] as const;

/**
 * Whether a failure is the narrow opaque 400/422 shape that one output-limit
 * repair attempt may fix: non-retryable, carries no usable response body, and
 * surfaced before the stream produced any events.
 */
export function isOpaqueBadRequest(failure: AIErrorDetails): boolean {
	return (
		failure.code === AI_ERROR_CODES.INVALID_REQUEST &&
		!failure.retryable &&
		(failure.statusCode === 400 || failure.statusCode === 422) &&
		OPAQUE_ERROR_BODY_PATTERN.test(failure.message) &&
		!failure.responseBodyPreview?.trim()
	);
}

/** Drop the auto-derived output-limit fields, leaving the provider's own default in effect. */
export function stripOutputLimitFieldsInPlace(payload: unknown): void {
	if (typeof payload !== "object" || payload === null) return;
	const record = payload as Record<string, unknown>;
	for (const field of OUTPUT_LIMIT_FIELDS) delete record[field];
}

/**
 * Request options for the one repair attempt: the outgoing payload keeps every
 * caller- and catalog-derived field except the output limit. The caller
 * `onPayload` hook still runs (the strip applies to the final outgoing object).
 */
export function withoutDerivedOutputLimit<T extends { onPayload?: (payload: unknown) => void }>(options: T): T {
	// Capture the hook value: callers may assign the wrapped onPayload back onto
	// the same options object, and reading options.onPayload lazily would then
	// recurse into the wrapper itself.
	const callerOnPayload = options.onPayload;
	return {
		...options,
		onPayload: (payload: unknown) => {
			callerOnPayload?.(payload);
			stripOutputLimitFieldsInPlace(payload);
		},
	};
}

/** How the next provider attempt assembles its request. */
export type ProviderRetryAttemptMode = "normal" | "output_limit_repair";
export type ProviderRetryOpenAttempt = (
	attemptSignal: AbortSignal,
	mode: ProviderRetryAttemptMode,
) => AssistantMessageEventStream;
export type ProviderRetrySleep = (delayMs: number, signal?: AbortSignal) => Promise<void>;

export interface ProviderRetryStreamConfig {
	readonly model: Model<Api>;
	readonly signal?: AbortSignal;
	/** Per-track retry budget. Default: 10 retries. `Infinity` opts into unbounded retries. */
	readonly maxRetries?: number;
	/** Zero-event watchdog per attempt. Default: 180_000 ms. `0` disables. */
	readonly streamIdleTimeoutMs?: number;
	/** Fail-fast cap on server-declared retry delays. `0`/unset disables the cap. */
	readonly maxRetryDelayMs?: number;
	/**
	 * Allow one silent output-limit repair attempt for opaque 400/422 rejections.
	 * The repair strips auto-derived output-limit fields and never consumes the
	 * retry budgets; it fires at most once and only before any stream events.
	 * Disabled when `false` or when `maxRetries` is 0.
	 */
	readonly outputLimitRepair?: boolean;
	/** Sleep implementation, injectable for deterministic tests. */
	readonly sleep?: ProviderRetrySleep;
	/** Jitter source for the rate-limit backoff, injectable for deterministic tests. */
	readonly random?: () => number;
}

/**
 * Unified stream-level retry layer. It owns retry policy for both request
 * establishment and stream transport: every attempt re-opens the provider
 * stream under an attempt-scoped abort signal, shared per-track budgets decide
 * whether a failure may be retried, and `retry` events surface the activity on
 * the same assistant message identity instead of opening a new message row.
 *
 * Budgets are claimed only by retryable failures: HTTP 429 lands on the
 * rate-limit track, other retryable failures on the transient track, and both
 * tracks span request setup and stream transport so switching phases never
 * resets or multiplies them. A stalled attempt is aborted and drained before
 * the next attempt opens so the abandoned request cannot wake later and
 * produce a duplicate provider call. Stalls carry their own tighter retry cap
 * (`PROVIDER_STREAM_STALL_MAX_RETRIES`) on top of the shared budget, because
 * each one already costs a full watchdog window. Only a complete `done`
 * response ends the loop successfully; exhausted budgets surface the original
 * failure unchanged.
 */
export function streamWithProviderRetry(
	openAttempt: ProviderRetryOpenAttempt,
	config: ProviderRetryStreamConfig,
): AssistantMessageEventStream {
	const outer = new AssistantMessageEventStream();
	void driveProviderRetryStream(openAttempt, config, outer);
	return outer;
}

interface ProviderRetryDecision {
	readonly track: ProviderRetryReason;
	readonly attempt: number;
	readonly maxAttempts: number;
	readonly delayMs: number;
}

async function driveProviderRetryStream(
	openAttempt: ProviderRetryOpenAttempt,
	config: ProviderRetryStreamConfig,
	outer: AssistantMessageEventStream,
): Promise<void> {
	const model = config.model;
	const signal = config.signal;
	const maxRetries = config.maxRetries ?? PROVIDER_TRANSIENT_MAX_RETRIES;
	const idleTimeoutMs = config.streamIdleTimeoutMs ?? PROVIDER_STREAM_IDLE_TIMEOUT_DEFAULT_MS;
	const sleep = config.sleep ?? delayWithAbort;
	const random = config.random ?? Math.random;
	const budgets: Record<ProviderRetryReason, number> = { rate_limit: 0, transient: 0 };
	let attemptMode: ProviderRetryAttemptMode = "normal";
	let outputLimitRepairTried = false;
	let sharedPartial: AssistantMessage | undefined;
	let emittedStart = false;
	/** Stalls counted separately: each one already costs a full watchdog window. */
	let stallRetries = 0;

	const forwardEvent = (event: AssistantMessageEvent): void => {
		if (event.type === "start") {
			if (emittedStart) {
				// A restarted attempt reuses the established assistant identity.
				if (sharedPartial && event.partial !== sharedPartial) adoptPartial(sharedPartial, event.partial);
				return;
			}
			sharedPartial = event.partial;
			emittedStart = true;
			outer.push(event);
			return;
		}
		if (sharedPartial && "partial" in event && event.partial && event.partial !== sharedPartial) {
			adoptPartial(sharedPartial, event.partial);
			outer.push({ ...event, partial: sharedPartial });
			return;
		}
		outer.push(event);
	};

	const pushAborted = (): void => {
		const failure = abortedFailureDetails(model);
		outer.push({
			type: "error",
			reason: "aborted",
			error: buildFailureMessage(model, failure, "aborted"),
			failure,
		});
	};

	const decideRetry = (failure: AIErrorDetails): ProviderRetryDecision | undefined => {
		if (failure.code === AI_ERROR_CODES.ABORTED || !failure.retryable) return undefined;
		const track: ProviderRetryReason =
			failure.statusCode === 429 || failure.code === AI_ERROR_CODES.RATE_LIMITED ? "rate_limit" : "transient";
		if (
			config.maxRetryDelayMs !== undefined &&
			config.maxRetryDelayMs > 0 &&
			failure.retryAfterMs !== undefined &&
			failure.retryAfterMs > config.maxRetryDelayMs
		) {
			return undefined;
		}
		if (budgets[track] >= maxRetries) return undefined;
		budgets[track] += 1;
		return {
			track,
			attempt: budgets[track],
			maxAttempts: Number.isFinite(maxRetries) ? maxRetries : 0,
			delayMs: computeRetryDelayMs(track, budgets[track], failure.retryAfterMs, random),
		};
	};

	/**
	 * One silent repair per logical call: an opaque request-phase 400/422 lets the
	 * next attempt drop the auto-derived output limit. The repair is attempted
	 * before ordinary retry classification, consumes no budget, and emits no
	 * retry activity; a second opaque failure surfaces untouched.
	 */
	const tryOutputLimitRepair = (failure: AIErrorDetails, requestPhase: boolean): boolean => {
		if (!requestPhase || outputLimitRepairTried) return false;
		if (config.outputLimitRepair === false || maxRetries === 0) return false;
		if (!isOpaqueBadRequest(failure)) return false;
		outputLimitRepairTried = true;
		attemptMode = "output_limit_repair";
		return true;
	};

	for (;;) {
		if (signal?.aborted) {
			pushAborted();
			return;
		}
		const attemptControl = new AbortController();
		const unlink = linkAbortSignal(signal, attemptControl);
		let inner: AssistantMessageEventStream;
		try {
			inner = openAttempt(attemptControl.signal, attemptMode);
		} catch (error) {
			unlink();
			if (signal?.aborted) {
				pushAborted();
				return;
			}
			const failure = toFailureDetails(error, model);
			// A synchronous open failure is always request-phase, so the narrow
			// opaque-400/422 repair may apply before ordinary classification.
			if (tryOutputLimitRepair(failure, true)) continue;
			const decision = decideRetry(failure);
			if (!decision) {
				pushSynthesizedError(outer, model, failure);
				return;
			}
			pushRetryEvent(outer, decision, failure);
			if (!(await waitForRetryDelay(sleep, decision.delayMs, signal))) {
				pushAborted();
				return;
			}
			continue;
		}

		let terminal: AssistantMessageErrorEvent | undefined;
		let thrown: unknown;
		let stalled = false;
		let attemptSawStart = false;
		const iterator = inner[Symbol.asyncIterator]();
		try {
			for (;;) {
				const step = await nextAttemptStep(iterator, idleTimeoutMs, signal);
				if (step === STREAM_IDLE_STALLED) {
					stalled = true;
					// The abandoned attempt must not wake later and open a duplicate
					// provider request; abort it and drain whatever it still emits.
					attemptControl.abort();
					drainAbandonedStream(iterator);
					break;
				}
				if (step === CALLER_ABORTED) {
					// The caller owns this abort; the attempt signal already fired
					// through linkAbortSignal. Drain whatever the provider still emits.
					drainAbandonedStream(iterator);
					break;
				}
				if (step.done) break;
				const event = step.value;
				if (event.type === "start") attemptSawStart = true;
				if (event.type === "error") {
					terminal = event;
					break;
				}
				forwardEvent(event);
				if (event.type === "done") return;
			}
		} catch (error) {
			thrown = error;
		} finally {
			unlink();
			// Let a settled inner result resolve so provider cleanup completes; the
			// outcome is already decided by the event lifecycle.
			void inner.result().catch(() => undefined);
		}

		if (signal?.aborted) {
			if (terminal?.reason === "aborted") outer.push(terminal);
			else pushAborted();
			return;
		}

		let failure: AIErrorDetails;
		if (stalled) {
			failure = stalledFailureDetails(model, idleTimeoutMs);
			stallRetries += 1;
		} else if (thrown !== undefined) {
			failure = toFailureDetails(thrown, model);
		} else if (terminal) {
			failure =
				terminal.failure ?? toFailureDetails(new Error(terminal.error.errorMessage || "Model call failed"), model);
		} else {
			failure = endedFailureDetails(model);
		}

		if (tryOutputLimitRepair(failure, !attemptSawStart)) continue;
		// Stalls are capped tighter than the shared transient budget: a cascade of full
		// watchdog windows is what turns a dead connection into a "processing" turn for
		// ~30 minutes (BUG-0085). The failure still surfaces unchanged for the caller's
		// retry/continuation policy to act on.
		const decision = stalled && stallRetries > PROVIDER_STREAM_STALL_MAX_RETRIES ? undefined : decideRetry(failure);
		if (decision) {
			pushRetryEvent(outer, decision, failure);
			if (!(await waitForRetryDelay(sleep, decision.delayMs, signal))) {
				pushAborted();
				return;
			}
			continue;
		}

		if (terminal) outer.push(terminal);
		else pushSynthesizedError(outer, model, failure);
		return;
	}
}

/** Keeps one assistant identity across attempts while content tracks the latest attempt. */
function adoptPartial(shared: AssistantMessage, partial: AssistantMessage): void {
	shared.content = partial.content;
	shared.usage = partial.usage;
	shared.stopReason = partial.stopReason;
	shared.timestamp = partial.timestamp;
	if (partial.errorMessage === undefined) delete shared.errorMessage;
	else shared.errorMessage = partial.errorMessage;
	if (partial.failure === undefined) delete shared.failure;
	else shared.failure = partial.failure;
}

function pushRetryEvent(
	outer: AssistantMessageEventStream,
	decision: ProviderRetryDecision,
	failure: AIErrorDetails,
): void {
	const event: AssistantMessageRetryEvent = {
		type: "retry",
		reason: decision.track,
		attempt: decision.attempt,
		maxAttempts: decision.maxAttempts,
		delayMs: decision.delayMs,
		errorMessage: failure.message,
		failure,
	};
	outer.push(event);
}

function computeRetryDelayMs(
	track: ProviderRetryReason,
	attempt: number,
	retryAfterMs: number | undefined,
	random: () => number,
): number {
	if (retryAfterMs !== undefined && retryAfterMs >= 0) {
		const cap = track === "rate_limit" ? PROVIDER_RATE_LIMIT_MAX_DELAY_MS : PROVIDER_TRANSIENT_MAX_DELAY_MS;
		return Math.min(retryAfterMs, cap);
	}
	if (track === "rate_limit") {
		const exponential = PROVIDER_RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1);
		const jitter = 1 + (random() * 2 - 1) * PROVIDER_RATE_LIMIT_JITTER_RATIO;
		return Math.min(Math.round(exponential * jitter), PROVIDER_RATE_LIMIT_MAX_DELAY_MS);
	}
	return Math.min(PROVIDER_TRANSIENT_BASE_DELAY_MS * 2 ** (attempt - 1), PROVIDER_TRANSIENT_MAX_DELAY_MS);
}

type AttemptStep = IteratorResult<AssistantMessageEvent> | typeof STREAM_IDLE_STALLED | typeof CALLER_ABORTED;

/**
 * Waits for the next provider event, bounded by the zero-event watchdog and an
 * immediate caller-abort wake. The watchdog bounds event gaps, not total stream
 * duration; the abort race keeps cancellation instant even for providers that
 * ignore their request signal.
 */
async function nextAttemptStep(
	iterator: AsyncIterator<AssistantMessageEvent>,
	idleTimeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<AttemptStep> {
	const contenders: Promise<AttemptStep>[] = [iterator.next()];
	let timer: ReturnType<typeof setTimeout> | undefined;
	if (idleTimeoutMs > 0) {
		contenders.push(
			new Promise<typeof STREAM_IDLE_STALLED>((resolve) => {
				timer = setTimeout(() => resolve(STREAM_IDLE_STALLED), idleTimeoutMs);
			}),
		);
	}
	if (signal && !signal.aborted) {
		contenders.push(
			new Promise<typeof CALLER_ABORTED>((resolve) => {
				signal.addEventListener("abort", () => resolve(CALLER_ABORTED), { once: true });
			}),
		);
	}
	const raced = await Promise.race(contenders);
	clearTimeout(timer);
	if (raced === STREAM_IDLE_STALLED || raced === CALLER_ABORTED) {
		// The pending next() belongs to the abandoned attempt; swallow its late
		// settlement so it cannot become an unhandled rejection.
		void contenders[0].then(
			() => undefined,
			() => undefined,
		);
	}
	return raced;
}

function drainAbandonedStream(iterator: AsyncIterator<AssistantMessageEvent>): void {
	void (async () => {
		for (;;) {
			try {
				const step = await iterator.next();
				if (step.done) return;
			} catch {
				return;
			}
		}
	})();
}

async function waitForRetryDelay(
	sleep: ProviderRetrySleep,
	delayMs: number,
	signal: AbortSignal | undefined,
): Promise<boolean> {
	try {
		await sleep(delayMs, signal);
	} catch {
		return false;
	}
	return !signal?.aborted;
}

export async function delayWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw new AIAbortedError();
	if (delayMs <= 0) return;
	await new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer);
			reject(new AIAbortedError());
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => undefined;
	const onAbort = () => target.abort(source.reason);
	if (source.aborted) {
		onAbort();
		return () => undefined;
	}
	source.addEventListener("abort", onAbort, { once: true });
	return () => source.removeEventListener("abort", onAbort);
}

function toFailureDetails(error: unknown, model: Model<Api>): AIErrorDetails {
	if (isAIError(error)) return getAIErrorDetails(error);
	return getAIErrorDetails(normalizeProviderError(error, model));
}

function stalledFailureDetails(model: Model<Api>, idleTimeoutMs: number): AIErrorDetails {
	return getAIErrorDetails(
		new AIError(
			AI_ERROR_CODES.TRANSPORT_FAILED,
			`Provider stream stalled: no events for ${idleTimeoutMs}ms (stream_idle_timeout)`,
			{
				retryable: true,
				provider: model.provider,
				modelId: model.id,
				phase: "stream",
			},
		),
	);
}

function endedFailureDetails(model: Model<Api>): AIErrorDetails {
	return getAIErrorDetails(
		new AIStreamProtocolError("Model stream ended without a terminal event", {
			retryable: true,
			provider: model.provider,
			modelId: model.id,
			phase: "stream",
		}),
	);
}

function abortedFailureDetails(model: Model<Api>): AIErrorDetails {
	return getAIErrorDetails(new AIAbortedError(undefined, { provider: model.provider, modelId: model.id }));
}

function buildFailureMessage(
	model: Model<Api>,
	failure: AIErrorDetails,
	reason: "error" | "aborted",
): AssistantMessage {
	return createAssistantMessage(
		{ api: model.api, provider: model.provider, model: model.id },
		{ stopReason: reason, errorMessage: failure.message, failure },
	);
}

function pushSynthesizedError(outer: AssistantMessageEventStream, model: Model<Api>, failure: AIErrorDetails): void {
	const reason = failure.code === AI_ERROR_CODES.ABORTED ? "aborted" : "error";
	outer.push({ type: "error", reason, error: buildFailureMessage(model, failure, reason), failure });
}
