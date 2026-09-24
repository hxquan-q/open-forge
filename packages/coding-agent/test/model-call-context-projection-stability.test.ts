import type { Api, AssistantMessage, Message, Model, UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	createModelCallDecayBoundary,
	type ModelCallContextProjectionOptions,
	projectModelCallContext,
} from "../src/compaction/runtime/model-call-context-projection.js";

describe("model call context projection stability", () => {
	it("projects byte-identical context for repeated calls on the same history", async () => {
		const messages: Message[] = [user("request", 1)];
		for (let index = 0; index < 12; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}

		const first = await project(messages);
		const second = await project(messages);

		// 衰减是消息流的纯函数：同输入投影逐字节相同，thinking 剪枝无墙钟翻转。
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		// 未被裁剪的消息保持对象引用，未改写的尾部窗口身份稳定。
		expect(second.messages[second.messages.length - 1]).toBe(messages[messages.length - 1]);
	});

	it("clears thinking exactly at the count-window exit inside the projection", async () => {
		const messages: Message[] = [user("request", 1)];
		for (let index = 0; index < 12; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}

		const projected = await project(messages);

		// 12 条带签名 thinking：最老 4 条出窗即清（签名保留、文本清空），最近 8 条保持引用。
		const projectedMessages = projected.messages;
		for (let index = 1; index <= 4; index += 1) {
			expect(thinkingText(projectedMessages[index])).toBe("");
			expect(thinkingSignature(projectedMessages[index])).toBe("sig");
		}
		for (let index = 5; index <= 12; index += 1) {
			expect(projectedMessages[index]).toBe(messages[index]);
		}
	});

	it("freezes the clear set for every projection of one turn while the stream grows", async () => {
		const boundary = createModelCallDecayBoundary();
		const messages: Message[] = [user("request", 1)];
		for (let index = 0; index < 12; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}

		const first = await project(messages, { decayBoundary: boundary });
		// 模拟 Turn 内工具循环追加 4 条带 thinking 的 assistant 消息。
		for (let index = 12; index < 16; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}
		const second = await project(messages, { decayBoundary: boundary });

		// Turn 内 append-only：清除集合冻结在准入时的最老 4 条（下标 1..4），
		// 尽管计数窗已滑到会清 1..8——无中间翻转，无 prefix_rewrite 信号源。
		expect(clearedThinkingIndices(first.messages)).toEqual([1, 2, 3, 4]);
		expect(clearedThinkingIndices(second.messages)).toEqual([1, 2, 3, 4]);
		// 已见前缀逐条身份稳定（含已清空消息的备忘复用），观察器全等快路径全程命中。
		for (let index = 1; index <= 12; index += 1) {
			expect(second.messages[index]).toBe(first.messages[index]);
		}
		// 新追加的尾部消息本 Turn 内不受衰减剪枝影响，身份原样保留。
		expect(second.messages[16]).toBe(messages[16]);
	});

	it("grows the frozen clear set monotonically across turn rebinds", async () => {
		const firstTurn = createModelCallDecayBoundary();
		const messages: Message[] = [user("request", 1)];
		for (let index = 0; index < 12; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}
		const first = await project(messages, { decayBoundary: firstTurn });
		for (let index = 12; index < 16; index += 1) {
			messages.push(thinkingAssistant(`thought ${index}`, index + 2));
		}

		// 跨 Turn 重新绑定：清除集合按 grown 流重算，单调只增、不回翻。
		const second = await project(messages, { decayBoundary: createModelCallDecayBoundary() });

		expect(clearedThinkingIndices(second.messages)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		for (let index = 1; index <= 4; index += 1) {
			// 上一 Turn 已清的消息在新 Turn 保持相同的清除字节。
			expect(JSON.stringify(second.messages[index])).toBe(JSON.stringify(first.messages[index]));
		}
	});
});

async function project(
	messages: readonly Message[],
	options: ModelCallContextProjectionOptions = {},
): Promise<{ messages: readonly Message[] }> {
	const result = await projectModelCallContext(
		{
			sessionId: "session-1",
			turnId: "turn-1",
			messages,
			modelBinding: { model: MODEL },
		},
		undefined,
		new AbortController().signal,
		options,
	);
	return result;
}

function clearedThinkingIndices(messages: readonly Message[]): number[] {
	const indices: number[] = [];
	messages.forEach((message, index) => {
		if (message.role === "assistant" && thinkingText(message) === "" && thinkingSignature(message) !== undefined) {
			indices.push(index);
		}
	});
	return indices;
}

function user(content: string, timestamp: number): UserMessage {
	return { role: "user", content, timestamp };
}

function thinkingAssistant(thinking: string, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [
			{ type: "thinking", thinking, thinkingSignature: "sig" },
			{ type: "text", text: `answer ${thinking}` },
		],
		api: "anthropic-messages",
		provider: "test",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
	};
}

function thinkingText(message: Message | undefined): string {
	if (!message || message.role !== "assistant") return "";
	for (const block of message.content) {
		if (block.type === "thinking") return block.thinking;
	}
	return "";
}

function thinkingSignature(message: Message | undefined): string | undefined {
	if (!message || message.role !== "assistant") return undefined;
	for (const block of message.content) {
		if (block.type === "thinking") return block.thinkingSignature;
	}
	return undefined;
}

const MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "anthropic-messages",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 4_096,
};
