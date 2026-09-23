import type { AgentMessage } from "@vetta/agent-core";
import type { AssistantMessage, ToolResultMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { DEFAULT_MICROCOMPACT_OPTIONS, microcompact } from "../src/compaction/index.js";

describe("microcompact", () => {
	it("clears thinking outside the count window regardless of wall clock", () => {
		const messages = thinkingHistory(12, () => signedThinking());

		const projected = microcompact(messages, {
			keepRecent: 8,
			maxAgeMs: 0,
			pruneToolResults: false,
			now: 1_000_000,
		});

		// 出窗即清：最老 4 条 thinking 文本清空、签名保留；最近 8 条原样保留。
		for (let index = 0; index < 4; index += 1) {
			expect(thinkingText(projected[index])).toBe("");
			expect(thinkingSignature(projected[index])).toBe("sig");
		}
		for (let index = 4; index < 12; index += 1) {
			expect(projected[index]).toBe(messages[index]);
		}
	});

	it("is deterministic across wall-clock values when the age gate is disabled", () => {
		const messages = thinkingHistory(12, () => signedThinking());

		const early = microcompact(messages, { keepRecent: 8, maxAgeMs: 0, pruneToolResults: false, now: 0 });
		const late = microcompact(messages, {
			keepRecent: 8,
			maxAgeMs: 0,
			pruneToolResults: false,
			now: 1_000_000_000_000,
		});

		expect(JSON.stringify(early)).toBe(JSON.stringify(late));
	});

	it("returns the input array untouched when nothing exits the window", () => {
		const messages = thinkingHistory(8, () => signedThinking());

		const projected = microcompact(messages, { keepRecent: 8, maxAgeMs: 0, pruneToolResults: false });

		expect(projected).toBe(messages);
	});

	it("only clears newly exited messages as the count window slides", () => {
		const messages = thinkingHistory(12, () => signedThinking());

		const afterNine = microcompact(messages.slice(0, 9), { keepRecent: 8, maxAgeMs: 0, pruneToolResults: false });
		const afterTen = microcompact(messages.slice(0, 10), { keepRecent: 8, maxAgeMs: 0, pruneToolResults: false });

		// 清除决策单调：窗口滑动只新增清除（index 1），已清形态保持字节一致，永不回翻。
		expect(clearedThinkingIndices(afterNine)).toEqual([0]);
		expect(clearedThinkingIndices(afterTen)).toEqual([0, 1]);
		expect(JSON.stringify(afterNine[0])).toBe(JSON.stringify(afterTen[0]));
		expect(afterTen[2]).toBe(messages[2]);
	});

	it("keeps signed thinking with cleared text and removes unsigned blocks entirely", () => {
		const messages = thinkingHistory(10, (index) => (index % 2 === 0 ? signedThinking() : unsignedThinking()));

		const projected = microcompact(messages, { keepRecent: 8, maxAgeMs: 0, pruneToolResults: false });

		// index 0（带签名）：保留签名、清空文本；index 1（无签名）：整块移除，仅剩 text 块。
		expect(thinkingBlocks(projected[0])).toEqual([{ type: "thinking", thinking: "", thinkingSignature: "sig" }]);
		expect(thinkingBlocks(projected[1])).toEqual([]);
	});

	it("still applies the legacy age gate when maxAgeMs is positive", () => {
		const messages: AgentMessage[] = [];
		for (let index = 0; index < 10; index += 1) {
			// 注意时间戳不能用 0：legacy 门以 truthy timestamp 为前提。
			messages.push(
				thinkingAssistant(`answer ${index}`, index % 2 === 0 ? 1_000 : 99_999, true, {
					type: "thinking",
					thinking: `thought ${index}`,
					thinkingSignature: "sig",
				}),
			);
		}

		const projected = microcompact(messages, {
			keepRecent: 8,
			maxAgeMs: 30_000,
			pruneToolResults: false,
			now: 100_000,
		});

		// 出窗的 2 条里只有时间戳早于 now-30s 的被清；年轻的一条保留。
		expect(thinkingText(projected[0])).toBe("");
		expect(thinkingText(projected[1])).toBe("thought 1");
	});

	it("keeps default options pruning tool results by count", () => {
		const messages = toolResultHistory(10);

		const projected = microcompact(messages, { keepRecent: 8, maxAgeMs: 0 });

		const cleared = projected.slice(0, 2);
		for (const message of cleared) {
			expect(message).toMatchObject({
				role: "toolResult",
				content: [{ type: "text", text: "[tool result cleared — old context]" }],
			});
		}
		// 幂等：对输出重跑，已清结果按占位符身份保持原引用。
		const rerun = microcompact(projected, { keepRecent: 8, maxAgeMs: 0 });
		expect(rerun[0]).toBe(projected[0]);
		expect(rerun[1]).toBe(projected[1]);
	});

	it("exposes a 30s default age gate for direct callers", () => {
		expect(DEFAULT_MICROCOMPACT_OPTIONS).toMatchObject({ keepRecent: 8, maxAgeMs: 30 * 1000 });
	});
});

function thinkingHistory(
	count: number,
	blockFor: (index: number) => AssistantMessage["content"][number],
): AgentMessage[] {
	const messages: AgentMessage[] = [];
	for (let index = 0; index < count; index += 1) {
		const block = blockFor(index);
		const signed = block.type === "thinking" && "thinkingSignature" in block;
		messages.push(thinkingAssistant(`thought ${index}`, 99_999, signed, block));
	}
	return messages;
}

function signedThinking(): AssistantMessage["content"][number] {
	return { type: "thinking", thinking: "signed", thinkingSignature: "sig" };
}

function unsignedThinking(): AssistantMessage["content"][number] {
	return { type: "thinking", thinking: "unsigned" };
}

function thinkingAssistant(
	text: string,
	timestamp: number,
	signed: boolean,
	thinkingBlock?: AssistantMessage["content"][number],
): AssistantMessage {
	const block = thinkingBlock ?? (signed ? signedThinking() : unsignedThinking());
	return {
		role: "assistant",
		content: [{ ...block }, { type: "text", text }],
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

function toolResultHistory(count: number): AgentMessage[] {
	const messages: AgentMessage[] = [];
	for (let index = 0; index < count; index += 1) {
		const result: ToolResultMessage = {
			role: "toolResult",
			toolCallId: `call-${index}`,
			toolName: "read",
			content: [{ type: "text", text: "x".repeat(1024) }],
			isError: false,
			timestamp: 1,
		};
		messages.push(result);
	}
	return messages;
}

function thinkingBlocks(message: AgentMessage | undefined): AssistantMessage["content"] {
	if (!message || message.role !== "assistant") return [];
	return (message as AssistantMessage).content.filter((block) => block.type === "thinking");
}

function thinkingText(message: AgentMessage | undefined): string {
	const blocks = thinkingBlocks(message);
	if (blocks.length === 0) return "";
	const block = blocks[0];
	return block.type === "thinking" ? block.thinking : "";
}

function thinkingSignature(message: AgentMessage | undefined): string | undefined {
	const blocks = thinkingBlocks(message);
	const block = blocks[0];
	return block && block.type === "thinking" ? block.thinkingSignature : undefined;
}

function clearedThinkingIndices(messages: readonly AgentMessage[]): number[] {
	const indices: number[] = [];
	messages.forEach((message, index) => {
		if (message.role === "assistant" && thinkingText(message) === "") indices.push(index);
	});
	return indices;
}
