import type { UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { messagesEqual, reconcileRuntimeMessageEnvelopes } from "../../src/kernel/runtime-message-context.js";
import type { RuntimeMessageEnvelope } from "../../src/runtime-execution-observation.js";

describe("runtime message context", () => {
	it("retains an opaque identity when text has equivalent string and content-block representations", () => {
		const candidate = opaque(textBlocks("context", 1));

		expect(reconcileRuntimeMessageEnvelopes([text("context", 1)], [candidate])).toEqual([candidate]);
	});

	it("does not associate an identity with a message from a different timestamp", () => {
		const candidate = opaque(textBlocks("context", 1));

		expect(reconcileRuntimeMessageEnvelopes([text("context", 2)], [candidate])).toEqual([
			{ kind: "message", message: text("context", 2) },
		]);
	});

	it("treats structurally equal messages as equal regardless of key insertion order", () => {
		const left: UserMessage = { role: "user", content: [{ type: "text", text: "context" }], timestamp: 1 };
		const right = { timestamp: 1, content: [{ text: "context", type: "text" }], role: "user" } as UserMessage;

		expect(messagesEqual(left, right)).toBe(true);
		expect(messagesEqual(right, left)).toBe(true);
	});

	it("keeps distinguishing messages that differ in content", () => {
		const left: UserMessage = { role: "user", content: "context", timestamp: 1 };
		const right: UserMessage = { role: "user", content: [{ type: "text", text: "other" }], timestamp: 1 };

		expect(messagesEqual(left, right)).toBe(false);
	});

	it("returns consistent verdicts across repeated comparisons of the same instances", () => {
		const left: UserMessage = { role: "user", content: "context", timestamp: 1 };
		const right: UserMessage = { role: "user", content: [{ type: "text", text: "context" }], timestamp: 1 };

		// 规范化序列化被缓存后，重复判等（相邻调用的前缀比较）结论必须一致。
		expect(messagesEqual(left, right)).toBe(true);
		expect(messagesEqual(left, right)).toBe(true);
		expect(messagesEqual(right, left)).toBe(true);
		expect(messagesEqual(left, { ...left, timestamp: 2 })).toBe(false);
	});
});

function opaque(modelMessage: UserMessage): RuntimeMessageEnvelope {
	return { kind: "opaque", identity: { role: "custom" }, modelMessage, timestamp: modelMessage.timestamp };
}

function text(content: string, timestamp: number): UserMessage {
	return { role: "user", content, timestamp };
}

function textBlocks(content: string, timestamp: number): UserMessage {
	return { role: "user", content: [{ type: "text", text: content }], timestamp };
}
