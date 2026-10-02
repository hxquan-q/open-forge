// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createOpenAICompletionsClient } from "../src/providers/openai-completions/request.js";
import { createOpenAIResponsesClient } from "../src/providers/openai-responses/request.js";
import { transformMessages } from "../src/providers/transform-messages.js";
import { createProviderTestTransport } from "../src/testing/provider-test-transport.js";
import type { AssistantMessage, ImageContent, Message, Model } from "../src/types.js";

const image: ImageContent = { type: "image", data: "aW1hZ2U=", mimeType: "image/png" };
const textModel: Model<"anthropic-messages"> = {
	id: "target",
	name: "Text model",
	api: "anthropic-messages",
	provider: "anthropic",
	baseUrl: "https://provider.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 10000,
	maxTokens: 1000,
};
const visionModel: Model<"anthropic-messages"> = { ...textModel, input: ["text", "image"] };
const assistant: AssistantMessage = {
	role: "assistant",
	api: "openai-responses",
	provider: "openai",
	model: "source",
	content: [{ type: "toolCall", id: "call|1", name: "read", arguments: {} }],
	stopReason: "toolUse",
	timestamp: 2,
	usage: {
		input: 1,
		output: 1,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
};
const normalizeId = (id: string): string => id.replaceAll("|", "_");

function userContent(messages: Message[]) {
	const user = messages.find((message) => message.role === "user");
	if (!user || !Array.isArray(user.content)) throw new Error("Expected multipart user content");
	return user.content;
}
function history(toolText = true): Message[] {
	return [
		{ role: "user", content: [{ type: "text", text: "Inspect this image" }, image], timestamp: 1 },
		assistant,
		{
			role: "toolResult",
			toolCallId: "call|1",
			toolName: "read",
			isError: false,
			timestamp: 3,
			content: toolText ? [{ type: "text", text: "File metadata" }, image] : [image],
		},
	];
}

describe("model input modality projection", () => {
	it.each([true, false])("tells text models when user images are omitted (with text: %s)", (withText) => {
		const messages: Message[] = [
			{ role: "user", content: withText ? [{ type: "text", text: "Inspect" }, image] : [image], timestamp: 1 },
		];
		const original = structuredClone(messages);
		const content = userContent(transformMessages(messages, textModel));
		expect(content.some((item) => item.type === "image")).toBe(false);
		expect(content.some((item) => item.type === "text" && item.text.includes("does not support image input"))).toBe(
			true,
		);
		if (withText) expect(content[0]).toEqual({ type: "text", text: "Inspect" });
		expect(messages).toEqual(original);
	});

	it.each([true, false])("omits tool images while preserving normalized call identity (with text: %s)", (withText) => {
		const result = transformMessages(history(withText), textModel, normalizeId);
		const tool = result.find((message) => message.role === "toolResult");
		expect(tool?.toolCallId).toBe("call_1");
		expect(tool?.toolName).toBe("read");
		expect(tool?.isError).toBe(false);
		expect(tool?.content.some((item) => item.type === "image")).toBe(false);
		expect(
			tool?.content.some((item) => item.type === "text" && item.text.includes("does not support image input")),
		).toBe(true);
		if (withText) expect(tool?.content[0]).toEqual({ type: "text", text: "File metadata" });
	});

	it("switching back to vision replays original images without mutating stored history", () => {
		const messages = history();
		const original = structuredClone(messages);
		transformMessages(messages, textModel, normalizeId);
		expect(messages).toEqual(original);
		const vision = transformMessages(messages, visionModel, normalizeId);
		expect(userContent(vision)).toEqual(original[0].role === "user" ? original[0].content : []);
		expect(vision.find((message) => message.role === "toolResult")?.content).toEqual([
			{ type: "text", text: "File metadata" },
			image,
		]);
		expect(messages).toEqual(original);
	});

	it("leaves ordinary text messages alone", () => {
		const message: Message = { role: "user", content: "Hello", timestamp: 1 };
		expect(transformMessages([message], textModel)).toEqual([message]);
	});
});

describe("Copilot transport headers follow model input capability", () => {
	it.each([false, true])("Completions declares vision only when supported: %s", async (supportsImages) => {
		const model: Model<"openai-completions"> = {
			...textModel,
			api: "openai-completions",
			provider: "github-copilot",
			input: supportsImages ? ["text", "image"] : ["text"],
		};
		const context = { messages: [{ role: "user" as const, content: [image], timestamp: 1 }] };
		const transport = createProviderTestTransport([
			new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
		]);
		const client = createOpenAICompletionsClient(model, context, "test-key", undefined, transport.fetch, 0);
		await expect(client.get("/models")).resolves.toEqual({ ok: true });
		expect(transport.requests).toHaveLength(1);
		expect(transport.requests[0]?.headers.get("Copilot-Vision-Request")).toBe(supportsImages ? "true" : null);
		expect(transport.requests[0]?.headers.get("X-Initiator")).toBe("user");
	});
	it.each([false, true])("Responses declares vision only when supported: %s", async (supportsImages) => {
		const model: Model<"openai-responses"> = {
			...textModel,
			api: "openai-responses",
			provider: "github-copilot",
			input: supportsImages ? ["text", "image"] : ["text"],
		};
		const context = { messages: [{ role: "user" as const, content: [image], timestamp: 1 }] };
		const transport = createProviderTestTransport([
			new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
		]);
		const client = createOpenAIResponsesClient(model, context, "test-key", { fetch: transport.fetch, maxRetries: 0 });
		await expect(client.get("/models")).resolves.toEqual({ ok: true });
		expect(transport.requests).toHaveLength(1);
		expect(transport.requests[0]?.headers.get("Copilot-Vision-Request")).toBe(supportsImages ? "true" : null);
		expect(transport.requests[0]?.headers.get("X-Initiator")).toBe("user");
	});
});
