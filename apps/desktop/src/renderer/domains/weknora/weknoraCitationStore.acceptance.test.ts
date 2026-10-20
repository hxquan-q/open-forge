// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import type { WeKnoraChatMessage } from "./atoms";
import { applyStreamEvent } from "./atoms";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-12 store 零改动)。
 *
 * 角度:引用渲染是"渲染层变换、store 数据零改动"(01-spec 红线级决策 D1)。本文件从流引擎
 * 落库侧证明:含 kb/web 标签的 delta **逐字符**进 `text`;`answer.promoted` 的切分点仍按
 * **原文长度**计数(标签字符照算)——T00 发现的最大暗坑(promotedLength 语义)不因引用
 * 功能回归。展示侧剥离由 MessageBubble/MessageList 验收文件背书,两侧合起来才是完整 AC-12。
 */

const REQUEST_ID = "r-acc";

function streamingAssistant(): WeKnoraChatMessage[] {
	return [{ id: "a1", role: "assistant", text: "", thinking: "", status: "streaming" }];
}

const KB_A = '<kb doc="a.md" chunk_id="c1" kb_id="b1" />';
const KB_B = '<kb doc="b.md" chunk_id="c2" kb_id="b2" />';
const THINKING_PART = `先想 ${KB_A} 想`;
const ANSWER_PART = `结论 ${KB_B} 完`;
const FULL_TEXT = THINKING_PART + ANSWER_PART;

describe("applyStreamEvent 验收 · 含标签文本零改动(AC-12)", () => {
	it("含标签 delta 逐字符落库:标签不是明文乱码也不被剥,text === delta 拼接", () => {
		let messages = streamingAssistant();
		// 模拟真实流式分片:边界故意切在标签中间(流不保证标签原子到达)。
		const deltas = [FULL_TEXT.slice(0, 9), FULL_TEXT.slice(9, 30), FULL_TEXT.slice(30)];
		for (const delta of deltas) {
			messages = applyStreamEvent(
				messages,
				{ type: "answer.delta", requestId: REQUEST_ID, text: delta },
				REQUEST_ID,
			);
		}
		expect(messages[0]?.text).toBe(FULL_TEXT);
		expect(messages[0]?.text).toContain(KB_A);
		expect(messages[0]?.text).toContain(KB_B);
	});

	it("answer.promoted 切分点按原文长度计数:标签字符照算,thinking/text 各含完整标签原文", () => {
		let messages = streamingAssistant();
		messages = applyStreamEvent(
			messages,
			{ type: "answer.delta", requestId: REQUEST_ID, text: FULL_TEXT },
			REQUEST_ID,
		);
		messages = applyStreamEvent(
			messages,
			{ type: "answer.promoted", requestId: REQUEST_ID, promotedLength: ANSWER_PART.length },
			REQUEST_ID,
		);
		expect(messages[0]?.thinking).toBe(THINKING_PART);
		expect(messages[0]?.text).toBe(ANSWER_PART);
		// 两侧原文都未被动过(D1:渲染层才剥,库里的标签原样保留)。
		expect(messages[0]?.thinking).toContain(KB_A);
		expect(messages[0]?.text).toContain(KB_B);
	});

	it("终态完成后 store 文本仍含标签(历史回看/再次渲染的数据源不变)", () => {
		let messages = streamingAssistant();
		messages = applyStreamEvent(
			messages,
			{ type: "answer.delta", requestId: REQUEST_ID, text: FULL_TEXT },
			REQUEST_ID,
		);
		messages = applyStreamEvent(
			messages,
			{ type: "answer.promoted", requestId: REQUEST_ID, promotedLength: ANSWER_PART.length },
			REQUEST_ID,
		);
		messages = applyStreamEvent(messages, { type: "turn.completed", requestId: REQUEST_ID }, REQUEST_ID);
		expect(messages[0]?.status).toBe("complete");
		expect(messages[0]?.text).toBe(ANSWER_PART);
		expect(messages[0]?.thinking).toBe(THINKING_PART);
	});

	it("promotedLength 超过已到文本长度:按现状语义收敛(不因标签而改变截断行为)", () => {
		let messages = streamingAssistant();
		messages = applyStreamEvent(
			messages,
			{ type: "answer.delta", requestId: REQUEST_ID, text: `短 ${KB_A}` },
			REQUEST_ID,
		);
		// 现状语义:min(promotedLength, text.length) 全部判给正文,thinking 收敛为空串。
		messages = applyStreamEvent(
			messages,
			{ type: "answer.promoted", requestId: REQUEST_ID, promotedLength: 999 },
			REQUEST_ID,
		);
		expect(messages[0]?.text).toBe(`短 ${KB_A}`);
		expect(messages[0]?.thinking).toBe("");
	});
});
