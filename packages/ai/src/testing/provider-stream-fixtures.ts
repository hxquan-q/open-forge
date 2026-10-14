// Copyright The Open Forge contributors.
import {
	AI_ERROR_CODES,
	AIAbortedError,
	AIError,
	type AIErrorCode,
	type AssistantMessage,
	type AssistantMessageEvent,
	type Provider,
} from "../protocol/index.js";
import { errorResponse, type SseRecord } from "./provider-test-transport.js";

/**
 * Deterministic Provider stream fixtures shared by wire-level contract tests and
 * host-level replays. Wire scenarios replay canned SSE frames through the real
 * adapters via `createProviderTestTransport`; the same `failure` contract can be
 * re-injected into `ScriptedLanguageModel(Adapter)` outcomes with
 * `providerFailureError` so Session/Turn/Team tests do not replay HTTP traffic.
 */

export interface ProviderStreamFailure {
	readonly code: AIErrorCode;
	readonly retryable: boolean;
	readonly reason: "error" | "aborted";
	/** Substring of the normalized provider error message; omitted when the message is not stable. */
	readonly message?: string;
	readonly providerCode?: string;
	readonly statusCode?: number;
	readonly retryAfterMs?: number;
}

export interface ProviderStreamScenario {
	readonly name: string;
	readonly description: string;
	/** Complete SSE frame list for `sseResponse`, including the `[DONE]` sentinel when the server closes cleanly. */
	readonly records: readonly SseRecord[];
	readonly failure: ProviderStreamFailure;
}

export interface ProviderHttpFailureScenario {
	readonly name: string;
	readonly description: string;
	/** A fresh Response per call so one scenario can feed several stream surfaces. */
	readonly response: () => Response;
	readonly failure: ProviderStreamFailure;
}

/** Encodes wire events as SSE frames; `doneSentinel: false` simulates a dropped connection. */
export function sseFrames(events: readonly unknown[], options?: { readonly doneSentinel?: boolean }): SseRecord[] {
	const records: SseRecord[] = events.map((data) => ({ data }));
	return options?.doneSentinel === false ? records : [...records, { data: "[DONE]" }];
}

/** The contract every aborted Provider Turn must settle to: a terminal abort, never a retry. */
export const PROVIDER_ABORTED_FAILURE: ProviderStreamFailure = {
	code: AI_ERROR_CODES.ABORTED,
	retryable: false,
	reason: "aborted",
};

/** Builds the AIError a scripted host-level model should fail with to replay this failure. */
export function providerFailureError(
	failure: ProviderStreamFailure,
	identity: { readonly provider?: Provider; readonly modelId?: string } = {},
): AIError {
	const options = {
		retryable: failure.retryable,
		...identity,
		...(failure.statusCode === undefined ? {} : { statusCode: failure.statusCode }),
		...(failure.providerCode === undefined ? {} : { providerCode: failure.providerCode }),
		...(failure.retryAfterMs === undefined ? {} : { retryAfterMs: failure.retryAfterMs }),
	};
	return failure.code === AI_ERROR_CODES.ABORTED
		? new AIAbortedError(failure.message, options)
		: new AIError(failure.code, failure.message ?? failure.code, options);
}

export interface SettledStreamOutcome {
	/** Events delivered to consumers before the stream terminated. */
	readonly events: readonly AssistantMessageEvent[];
	/** Iteration rejection, when the stream failed instead of ending cleanly. */
	readonly eventError: unknown;
	/** Resolved assistant message (the legacy terminal surface). */
	readonly result?: AssistantMessage;
	/** Result rejection (the native terminal surface). */
	readonly resultError: unknown;
}

/**
 * Drains a provider stream to its terminal state on both consumer surfaces at once:
 * the event iterable and the result promise. A regression that leaves either surface
 * pending fails the awaiting test by timeout instead of passing silently.
 */
export async function settleStreamOutcome(
	events: AsyncIterable<AssistantMessageEvent>,
	result: Promise<AssistantMessage>,
): Promise<SettledStreamOutcome> {
	const collected: AssistantMessageEvent[] = [];
	const [eventSettlement, resultSettlement] = await Promise.allSettled([
		(async () => {
			for await (const event of events) collected.push(event);
		})(),
		result,
	]);
	return {
		events: collected,
		eventError: eventSettlement.status === "rejected" ? eventSettlement.reason : undefined,
		...(resultSettlement.status === "fulfilled" ? { result: resultSettlement.value } : {}),
		resultError: resultSettlement.status === "rejected" ? resultSettlement.reason : undefined,
	};
}

/* ------------------------------------------------------------------------ */
/* OpenAI Responses wire payloads                                            */
/* ------------------------------------------------------------------------ */

function responsesItemAdded(outputIndex: number, item: Record<string, unknown>): Record<string, unknown> {
	return { type: "response.output_item.added", output_index: outputIndex, item };
}

function responsesItemDone(outputIndex: number, item: Record<string, unknown>): Record<string, unknown> {
	return { type: "response.output_item.done", output_index: outputIndex, item };
}

function responsesMessageItem(id: string, status: string, text?: string): Record<string, unknown> {
	return {
		type: "message",
		id,
		role: "assistant",
		status,
		content: text === undefined ? [] : [{ type: "output_text", text, annotations: [] }],
	};
}

function responsesFunctionCallItem(id: string): Record<string, unknown> {
	return {
		type: "function_call",
		id,
		call_id: `call-${id}`,
		name: "lookup",
		arguments: "",
		status: "in_progress",
	};
}

function responsesReasoningItem(id: string): Record<string, unknown> {
	return { type: "reasoning", id, summary: [] };
}

function responsesCompleted(): Record<string, unknown> {
	return {
		type: "response.completed",
		response: {
			id: "resp-fixture",
			object: "response",
			status: "completed",
			output: [],
			usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
		},
	};
}

/** Canonical successful Responses turn, reused as the baseline for host-level tests. */
export const RESPONSES_TEXT_TURN_EVENTS: readonly unknown[] = [
	responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
	{
		type: "response.content_part.added",
		output_index: 0,
		item_id: "msg-1",
		part: { type: "output_text", text: "", annotations: [] },
	},
	{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "hello" },
	responsesItemDone(0, responsesMessageItem("msg-1", "completed", "hello")),
	responsesCompleted(),
];

/**
 * Responses-family wire failures. `content-part-targets-*` reproduce the production
 * regression where a compatible gateway (observed on DeepSeek `openai-responses`)
 * emitted `response.content_part.added` for a non-message output item; the protocol
 * error must surface as a terminal Provider failure, not a hanging stream.
 */
export const RESPONSES_STREAM_FAILURE_SCENARIOS: readonly ProviderStreamScenario[] = [
	{
		name: "content-part-targets-function-call",
		description:
			"content_part.added lands on an in-flight function_call item (production DeepSeek/openai-responses regression)",
		records: sseFrames([
			responsesItemAdded(0, responsesFunctionCallItem("fc-1")),
			{
				type: "response.content_part.added",
				output_index: 0,
				item_id: "fc-1",
				part: { type: "output_text", text: "", annotations: [] },
			},
		]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "response.content_part.added targeted the wrong output item",
		},
	},
	{
		name: "content-part-targets-reasoning",
		description: "content_part.added lands on an in-flight reasoning item",
		records: sseFrames([
			responsesItemAdded(0, responsesReasoningItem("rs-1")),
			{
				type: "response.content_part.added",
				output_index: 0,
				item_id: "rs-1",
				part: { type: "output_text", text: "", annotations: [] },
			},
		]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "response.content_part.added targeted the wrong output item",
		},
	},
	{
		name: "delta-for-unknown-output-item",
		description: "a delta references an output item that was never added",
		records: sseFrames([{ type: "response.output_text.delta", output_index: 4, item_id: "msg-ghost", delta: "hi" }]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "arrived before response.output_item.added",
		},
	},
	{
		name: "conflicting-output-item-identity",
		description: "item_id and output_index identify two different in-flight items",
		records: sseFrames([
			responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
			responsesItemAdded(1, responsesFunctionCallItem("fc-1")),
			{ type: "response.output_text.delta", output_index: 1, item_id: "msg-1", delta: "hi" },
		]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "identified conflicting output items",
		},
	},
	{
		name: "partial-stream",
		description: "the connection drops mid-turn before any terminal response event",
		records: sseFrames(
			[
				responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
				{
					type: "response.content_part.added",
					output_index: 0,
					item_id: "msg-1",
					part: { type: "output_text", text: "", annotations: [] },
				},
				{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "partial" },
			],
			{ doneSentinel: false },
		),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "Stream ended without a terminal response event",
		},
	},
	{
		name: "unfinished-output-items",
		description: "response.completed arrives while an output item is still open",
		records: sseFrames([
			responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
			{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "partial" },
			responsesCompleted(),
		]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "completed with unfinished output items",
		},
	},
	{
		name: "event-after-terminal",
		description: "the provider keeps emitting after response.completed",
		records: sseFrames([
			responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
			responsesItemDone(0, responsesMessageItem("msg-1", "completed", "done")),
			responsesCompleted(),
			{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "late" },
		]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: false,
			reason: "error",
			message: "event after its terminal response",
		},
	},
	{
		name: "empty-stream",
		description: "the provider closes the stream without a single event (transient, retryable)",
		records: sseFrames([]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: true,
			reason: "error",
			message: "Stream ended without provider events",
		},
	},
	{
		name: "mid-stream-error-event",
		description: "a provider error event correlates with in-flight partial output",
		records: sseFrames([
			responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
			{
				type: "response.content_part.added",
				output_index: 0,
				item_id: "msg-1",
				part: { type: "output_text", text: "", annotations: [] },
			},
			{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "hel" },
			{ type: "error", code: "server_error", message: "upstream exploded", param: null },
		]),
		failure: {
			code: AI_ERROR_CODES.TRANSPORT_FAILED,
			retryable: false,
			reason: "error",
			message: "upstream exploded",
			providerCode: "server_error",
		},
	},
	{
		name: "terminal-response-failed",
		description: "response.failed terminates the turn with a transient, retryable provider failure",
		records: sseFrames([
			responsesItemAdded(0, responsesMessageItem("msg-1", "in_progress")),
			{ type: "response.output_text.delta", output_index: 0, item_id: "msg-1", delta: "hel" },
			{
				type: "response.failed",
				response: {
					id: "resp-fixture",
					object: "response",
					status: "failed",
					output: [],
					error: { code: "server_error", message: "provider exploded" },
				},
			},
		]),
		failure: {
			code: AI_ERROR_CODES.TRANSPORT_FAILED,
			retryable: true,
			reason: "error",
			message: "provider exploded",
			providerCode: "server_error",
		},
	},
];

/* ------------------------------------------------------------------------ */
/* OpenAI Completions / DeepSeek wire payloads                               */
/* ------------------------------------------------------------------------ */

function completionsChunk(
	delta: Record<string, unknown>,
	finishReason: string | null = null,
	usage?: Record<string, unknown>,
): Record<string, unknown> {
	return {
		id: "chatcmpl-fixture",
		object: "chat.completion.chunk",
		created: 1_700_000_000,
		model: "deepseek-v4-flash",
		choices: [{ index: 0, delta, finish_reason: finishReason }],
		...(usage === undefined ? {} : { usage }),
	};
}

/** Canonical successful Completions turn with DeepSeek-style reasoning_content. */
export const COMPLETIONS_TEXT_TURN_CHUNKS: readonly unknown[] = [
	completionsChunk({ role: "assistant", content: "" }),
	completionsChunk({ reasoning_content: "先看需求" }),
	completionsChunk({ content: "hello" }),
	completionsChunk({}, "stop", { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }),
];

/**
 * DeepSeek Completions wire failures. Compatible gateways may embed `{error}` objects
 * mid-stream; they are not completion chunks and must fail wire validation instead of
 * being mistaken for successful output.
 */
export const COMPLETIONS_STREAM_FAILURE_SCENARIOS: readonly ProviderStreamScenario[] = [
	{
		name: "mid-stream-error-payload",
		description:
			"a bare {error} payload arrives between completion chunks; the SDK surfaces it as a transport failure",
		records: sseFrames([
			completionsChunk({ role: "assistant", content: "" }),
			completionsChunk({ content: "partial" }),
			{ error: { message: "upstream exploded", type: "server_error", code: "server_error" } },
		]),
		failure: {
			code: AI_ERROR_CODES.TRANSPORT_FAILED,
			retryable: false,
			reason: "error",
			message: "upstream exploded",
			providerCode: "server_error",
		},
	},
	{
		name: "empty-stream",
		description: "the provider closes the stream without a single chunk (transient, retryable)",
		records: sseFrames([]),
		failure: {
			code: AI_ERROR_CODES.STREAM_PROTOCOL_FAILED,
			retryable: true,
			reason: "error",
			message: "Stream ended without provider events",
		},
	},
];

/**
 * A dropped Completions stream still terminates as a normal `stop` turn carrying the
 * text received so far. This asymmetry with the Responses contract (which fails on a
 * missing terminal event) is the current observed behavior and is pinned here.
 */
export const COMPLETIONS_PARTIAL_STREAM_CHUNKS: readonly unknown[] = [
	completionsChunk({ role: "assistant", content: "" }),
	completionsChunk({ content: "partial" }),
];

/* ------------------------------------------------------------------------ */
/* HTTP-level failures shared by both wire families                          */
/* ------------------------------------------------------------------------ */

export const PROVIDER_HTTP_FAILURE_SCENARIOS: readonly ProviderHttpFailureScenario[] = [
	{
		name: "rate-limited",
		description: "HTTP 429 with Retry-After is a retryable provider failure",
		response: () =>
			errorResponse(
				429,
				{ error: { type: "rate_limit_error", message: "Rate limit reached" } },
				{ headers: { "retry-after": "2", "x-request-id": "req-429" } },
			),
		failure: {
			code: AI_ERROR_CODES.RATE_LIMITED,
			retryable: true,
			reason: "error",
			message: "Rate limit reached",
			statusCode: 429,
			retryAfterMs: 2_000,
		},
	},
	{
		name: "server-overload",
		description: "HTTP 503 is a retryable transport failure",
		response: () => errorResponse(503, { error: { code: "capacity_exhausted", message: "No capacity available" } }),
		failure: {
			code: AI_ERROR_CODES.TRANSPORT_FAILED,
			retryable: true,
			reason: "error",
			message: "No capacity available",
			statusCode: 503,
			providerCode: "capacity_exhausted",
		},
	},
	{
		name: "billing-exhausted",
		description: "HTTP 402 / insufficient quota is terminal and never retried",
		response: () => errorResponse(402, { error: { code: "insufficient_quota", message: "Insufficient quota" } }),
		failure: {
			code: AI_ERROR_CODES.BILLING_REQUIRED,
			retryable: false,
			reason: "error",
			message: "Insufficient quota",
			statusCode: 402,
			providerCode: "insufficient_quota",
		},
	},
	{
		name: "unauthorized",
		description: "HTTP 401 is a terminal authentication failure",
		response: () => errorResponse(401, { error: { type: "authentication_error", message: "invalid api key" } }),
		failure: {
			code: AI_ERROR_CODES.AUTHENTICATION_FAILED,
			retryable: false,
			reason: "error",
			message: "invalid api key",
			statusCode: 401,
		},
	},
];
