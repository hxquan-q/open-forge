// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { isAIErrorDetails } from "../src/protocol/index.js";
import { streamModel } from "../src/runtime/stream-model.js";
import { stream } from "../src/stream.js";
import {
	COMPLETIONS_PARTIAL_STREAM_CHUNKS,
	COMPLETIONS_STREAM_FAILURE_SCENARIOS,
	COMPLETIONS_TEXT_TURN_CHUNKS,
	PROVIDER_ABORTED_FAILURE,
	PROVIDER_HTTP_FAILURE_SCENARIOS,
	type ProviderStreamFailure,
	providerFailureError,
	RESPONSES_STREAM_FAILURE_SCENARIOS,
	RESPONSES_TEXT_TURN_EVENTS,
	type SettledStreamOutcome,
	settleStreamOutcome,
	sseFrames,
} from "../src/testing/provider-stream-fixtures.js";
import {
	createControlledSseResponse,
	createProviderTestTransport,
	sseResponse,
} from "../src/testing/provider-test-transport.js";
import { ScriptedLanguageModelAdapter } from "../src/testing/scripted-language-model.js";
import type { AssistantMessage, AssistantMessageErrorEvent, Context, Model } from "../src/types.js";

const context: Context = {
	systemPrompt: "Be concise.",
	messages: [{ role: "user", content: "Hello", timestamp: 1 }],
	tools: [
		{
			name: "lookup",
			description: "Look up a value",
			parameters: Type.Object({ query: Type.String() }),
		},
	],
};

const responsesModel: Model<"openai-responses"> = {
	id: "deepseek-v4-pro",
	name: "DeepSeek V4 Pro",
	api: "openai-responses",
	provider: "deepseek",
	baseUrl: "https://api.deepseek.com/v1",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 8_192,
};

const completionsModel: Model<"openai-completions-deepseek"> = {
	id: "deepseek-v4-flash",
	name: "DeepSeek V4 Flash",
	api: "openai-completions-deepseek",
	provider: "deepseek",
	baseUrl: "https://api.deepseek.com",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 8_192,
};

function terminalErrorEvent(settled: SettledStreamOutcome): AssistantMessageErrorEvent {
	const event = settled.events.at(-1);
	if (event?.type !== "error") throw new Error(`expected a terminal error event, got ${event?.type ?? "none"}`);
	return event;
}

/**
 * The native surface rejects `result` and the event iterable, but still delivers a
 * terminal `error` event first — hosts persisting or classifying the failure rely on
 * that event instead of inspecting the rejection.
 */
function expectNativeFailure(
	settled: SettledStreamOutcome,
	failure: ProviderStreamFailure,
	model: { readonly provider: string; readonly id: string },
): void {
	const terminal = terminalErrorEvent(settled);
	expect(terminal.reason).toBe(failure.reason);
	expect(isAIErrorDetails(terminal.failure)).toBe(true);
	expectFailureDetails(terminal.failure, failure, model);
	expectFailureDetails(settled.eventError, failure, model);
	expectFailureDetails(settled.resultError, failure, model);
	expect(settled.result).toBeUndefined();
}

/** The legacy surface resolves the terminal assistant message instead of rejecting. */
function expectLegacyFailure(
	settled: SettledStreamOutcome,
	failure: ProviderStreamFailure,
	model: { readonly provider: string; readonly id: string },
): void {
	expect(settled.eventError).toBeUndefined();
	expect(settled.resultError).toBeUndefined();
	expect(settled.result).toMatchObject({
		stopReason: failure.reason,
		...(failure.message === undefined ? {} : { errorMessage: expect.stringContaining(failure.message) }),
	});
	expectFailureDetails(settled.result?.failure, failure, model);
	expectFailureDetails(terminalErrorEvent(settled).failure, failure, model);
}

function expectFailureDetails(
	actual: unknown,
	failure: ProviderStreamFailure,
	model: { readonly provider: string; readonly id: string },
): void {
	expect(actual).toMatchObject({
		code: failure.code,
		retryable: failure.retryable,
		provider: model.provider,
		modelId: model.id,
	});
	if (failure.message !== undefined) {
		expect(actual).toMatchObject({ message: expect.stringContaining(failure.message) });
	}
	if (failure.statusCode !== undefined) expect(actual).toMatchObject({ statusCode: failure.statusCode });
	if (failure.providerCode !== undefined) expect(actual).toMatchObject({ providerCode: failure.providerCode });
	if (failure.retryAfterMs !== undefined) expect(actual).toMatchObject({ retryAfterMs: failure.retryAfterMs });
}

describe("provider stream failure fixtures", () => {
	it("completes the canned text turns on both wire families", async () => {
		const responses = await stream(responsesModel, context, {
			apiKey: "test",
			fetch: createProviderTestTransport([sseResponse(sseFrames(RESPONSES_TEXT_TURN_EVENTS))]).fetch,
		}).result();
		expect(textOf(responses)).toBe("hello");
		expect(responses.stopReason).toBe("stop");

		const completions = await stream(completionsModel, context, {
			apiKey: "test",
			fetch: createProviderTestTransport([sseResponse(sseFrames(COMPLETIONS_TEXT_TURN_CHUNKS))]).fetch,
		}).result();
		expect(textOf(completions)).toBe("hello");
		expect(thinkingOf(completions)).toBe("先看需求");
		expect(completions.stopReason).toBe("stop");
	});

	describe.each(RESPONSES_STREAM_FAILURE_SCENARIOS)("responses scenario: $name", (scenario) => {
		it("projects a terminal provider failure on the native surface", async () => {
			const transport = createProviderTestTransport([sseResponse(scenario.records)]);
			const response = await streamModel({
				model: responsesModel,
				context,
				options: { apiKey: "test", fetch: transport.fetch },
			});
			const settled = await settleStreamOutcome(response.events, response.result);
			expectNativeFailure(settled, scenario.failure, responsesModel);
		});

		it("resolves the same terminal failure on the public stream surface", async () => {
			const transport = createProviderTestTransport([sseResponse(scenario.records)]);
			const events = stream(responsesModel, context, { apiKey: "test", fetch: transport.fetch });
			const settled = await settleStreamOutcome(events, events.result());
			expectLegacyFailure(settled, scenario.failure, responsesModel);
		});
	});

	describe.each(COMPLETIONS_STREAM_FAILURE_SCENARIOS)("deepseek completions scenario: $name", (scenario) => {
		it("projects a terminal provider failure on the native surface", async () => {
			const transport = createProviderTestTransport([sseResponse(scenario.records)]);
			const response = await streamModel({
				model: completionsModel,
				context,
				options: { apiKey: "test", fetch: transport.fetch },
			});
			const settled = await settleStreamOutcome(response.events, response.result);
			expectNativeFailure(settled, scenario.failure, completionsModel);
		});

		it("resolves the same terminal failure on the public stream surface", async () => {
			const transport = createProviderTestTransport([sseResponse(scenario.records)]);
			const events = stream(completionsModel, context, { apiKey: "test", fetch: transport.fetch });
			const settled = await settleStreamOutcome(events, events.result());
			expectLegacyFailure(settled, scenario.failure, completionsModel);
		});
	});

	describe.each(PROVIDER_HTTP_FAILURE_SCENARIOS)("http scenario: $name", (scenario) => {
		it("preserves retryable semantics on both wire families", async () => {
			for (const model of [responsesModel, completionsModel]) {
				const transport = createProviderTestTransport([scenario.response()]);
				const events = stream(model, context, { apiKey: "test", fetch: transport.fetch });
				const settled = await settleStreamOutcome(events, events.result());
				expectLegacyFailure(settled, scenario.failure, model);
			}
		});
	});

	it("keeps partial output attached to the terminal failure", async () => {
		const scenario = RESPONSES_STREAM_FAILURE_SCENARIOS.find(
			(candidate) => candidate.name === "mid-stream-error-event",
		);
		if (!scenario) throw new Error("mid-stream-error-event fixture missing");
		const transport = createProviderTestTransport([sseResponse(scenario.records)]);
		const events = stream(responsesModel, context, { apiKey: "test", fetch: transport.fetch });
		const settled = await settleStreamOutcome(events, events.result());
		expect(settled.result?.content).toMatchObject([{ type: "text", text: "hel" }]);
	});

	it("keeps the current dropped-stream contract for completions", async () => {
		// A Completions stream that ends without finish_reason resolves as a normal
		// stop turn carrying the text received so far — unlike the Responses family,
		// which fails when the terminal response event is missing.
		const transport = createProviderTestTransport([sseResponse(sseFrames(COMPLETIONS_PARTIAL_STREAM_CHUNKS))]);
		const result = await stream(completionsModel, context, { apiKey: "test", fetch: transport.fetch }).result();
		expect(result.stopReason).toBe("stop");
		expect(textOf(result)).toBe("partial");
	});
});

describe("provider turn terminal state", () => {
	it("delivers classification-ready failure details to event consumers", async () => {
		// runtime-core projects `failure` into RuntimeFailure (origin "provider") and
		// agent-team classifies code/retryable into a terminal member state. The wire
		// contract therefore guarantees code/retryable/provider/modelId on the event.
		for (const scenario of RESPONSES_STREAM_FAILURE_SCENARIOS) {
			const transport = createProviderTestTransport([sseResponse(scenario.records)]);
			const response = await streamModel({
				model: responsesModel,
				context,
				options: { apiKey: "test", fetch: transport.fetch },
			});
			const settled = await settleStreamOutcome(response.events, response.result);
			const failure = terminalErrorEvent(settled).failure;
			expect(isAIErrorDetails(failure)).toBe(true);
			expect(failure).toMatchObject({
				code: scenario.failure.code,
				retryable: scenario.failure.retryable,
				provider: "deepseek",
				modelId: responsesModel.id,
			});
		}
	});

	it("replays fixture failures through the scripted host adapter", async () => {
		for (const scenario of RESPONSES_STREAM_FAILURE_SCENARIOS) {
			const adapter = new ScriptedLanguageModelAdapter(responsesModel.api, [
				{
					error: providerFailureError(scenario.failure, {
						provider: responsesModel.provider,
						modelId: responsesModel.id,
					}),
				},
			]);
			const response = await adapter.stream({ model: responsesModel, context });
			const settled = await settleStreamOutcome(response.events, response.result);
			expect(settled.resultError).toMatchObject({
				code: scenario.failure.code,
				retryable: scenario.failure.retryable,
				provider: "deepseek",
				modelId: responsesModel.id,
			});
		}
	});

	it("settles a pre-aborted call as aborted without touching transport", async () => {
		for (const model of [responsesModel, completionsModel]) {
			const controller = new AbortController();
			controller.abort();
			const transport = createProviderTestTransport([sseResponse(sseFrames(RESPONSES_TEXT_TURN_EVENTS))]);
			const events = stream(model, context, { apiKey: "test", fetch: transport.fetch, signal: controller.signal });
			const settled = await settleStreamOutcome(events, events.result());

			expect(transport.requests).toHaveLength(0);
			expectLegacyFailure(settled, PROVIDER_ABORTED_FAILURE, model);
		}
	});

	it("settles a mid-stream abort as a terminal aborted state", async () => {
		for (const model of [responsesModel, completionsModel]) {
			const controlled = createControlledSseResponse();
			const controller = new AbortController();
			const transport = createProviderTestTransport([
				(request) => {
					request.signal.addEventListener(
						"abort",
						() => controlled.fail(new DOMException("The operation was aborted", "AbortError")),
						{ once: true },
					);
					return controlled.response;
				},
			]);
			const events = stream(model, context, { apiKey: "test", fetch: transport.fetch, signal: controller.signal });
			const iterator = events[Symbol.asyncIterator]();
			await expect(iterator.next()).resolves.toMatchObject({ value: { type: "start" } });

			controller.abort();
			await expect(iterator.next()).resolves.toMatchObject({
				value: { type: "error", reason: "aborted", error: { stopReason: "aborted" } },
			});
			await expect(events.result()).resolves.toMatchObject({
				stopReason: "aborted",
				failure: { code: "AI_ABORTED", retryable: false },
			});
		}
	});
});

function textOf(message: AssistantMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

function thinkingOf(message: AssistantMessage): string {
	return message.content
		.filter((block) => block.type === "thinking")
		.map((block) => block.thinking)
		.join("");
}
