// Copyright The Open Forge contributors.

import type { WeKnoraStreamEvent } from "@preload/api";
import { describe, expect, it } from "vitest";
import { applyStreamEvent, type WeKnoraChatMessage } from "./atoms";

const REQUEST_ID = "r1";

function streamingAssistant(): WeKnoraChatMessage[] {
	return [{ id: "a1", role: "assistant", text: "", thinking: "", status: "streaming" }];
}

function apply(messages: WeKnoraChatMessage[], event: WeKnoraStreamEvent): WeKnoraChatMessage[] {
	return applyStreamEvent(messages, event, REQUEST_ID);
}

describe("applyStreamEvent · AC-25 思考/回答分区", () => {
	it("流式期间 delta 即时累积到 text（不缓冲）", () => {
		const after = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "进行中" });
		expect(after[0]?.text).toBe("进行中");
		expect(after[0]?.thinking).toBe("");
	});

	it("answer.promoted：尾段留作正式回答，前缀切到 thinking", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "旁白。" });
		messages = apply(messages, { type: "answer.delta", requestId: REQUEST_ID, text: "正式回答" });
		messages = apply(messages, {
			type: "answer.promoted",
			requestId: REQUEST_ID,
			promotedLength: "正式回答".length,
		});
		expect(messages[0]?.thinking).toBe("旁白。");
		expect(messages[0]?.text).toBe("正式回答");
	});

	it("未调工具的直答：promotedLength = 全文 → thinking 为空", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "直答" });
		messages = apply(messages, { type: "answer.promoted", requestId: REQUEST_ID, promotedLength: 2 });
		expect(messages[0]?.thinking).toBe("");
		expect(messages[0]?.text).toBe("直答");
	});

	it("整段都是旁白（promotedLength = 0）→ 全部归 thinking", () => {
		let messages = apply(streamingAssistant(), { type: "answer.delta", requestId: REQUEST_ID, text: "只是旁白。" });
		messages = apply(messages, { type: "answer.promoted", requestId: REQUEST_ID, promotedLength: 0 });
		expect(messages[0]?.thinking).toBe("只是旁白。");
		expect(messages[0]?.text).toBe("");
	});

	it("requestId 不匹配的 promoted 被丢弃，不串台", () => {
		const messages = apply(streamingAssistant(), { type: "answer.promoted", requestId: "other", promotedLength: 0 });
		expect(messages[0]?.thinking).toBe("");
	});
});
