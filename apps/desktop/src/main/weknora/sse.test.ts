// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { createWeKnoraStreamParser, type WeKnoraStreamParser } from "./sse.js";
import type { WeKnoraStreamEvent } from "./types.js";

const REQUEST_ID = "req-1";

function feed(parser: WeKnoraStreamParser, chunks: string[]): WeKnoraStreamEvent[] {
	const events: WeKnoraStreamEvent[] = [];
	for (const chunk of chunks) events.push(...parser.push(chunk));
	return events;
}

/** 只统计 push 阶段的事件（不含 finish 的终态收敛）。 */
function parseChunks(chunks: string[], sessionId = "fallback-session"): WeKnoraStreamEvent[] {
	return feed(createWeKnoraStreamParser({ requestId: REQUEST_ID, sessionId }), chunks);
}

describe("createWeKnoraStreamParser", () => {
	it("单个 answer 事件 → 一个 answer.delta", () => {
		expect(parseChunks(['data: {"response_type":"answer","content":"你好"}\n\n'])).toEqual([
			{ type: "answer.delta", requestId: REQUEST_ID, text: "你好" },
		]);
	});

	it("一个事件被切成 3 个 chunk 到达 → 仍合成 1 个事件", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		expect(parser.push('data: {"response_type":"ans')).toEqual([]);
		expect(parser.push('wer","content":"分')).toEqual([]);
		expect(parser.push('片"}\n\n')).toEqual([{ type: "answer.delta", requestId: REQUEST_ID, text: "分片" }]);
	});

	it("多行 data 以 \\n 拼接后解析", () => {
		expect(parseChunks(['data: {"response_type":"answer",\ndata: "content":"拼接"}\n\n'])).toEqual([
			{ type: "answer.delta", requestId: REQUEST_ID, text: "拼接" },
		]);
	});

	it("空行才算一个事件边界", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		expect(parser.push('data: {"response_type":"answer","content":"a"}\n')).toEqual([]);
		expect(parser.push("\n")).toEqual([{ type: "answer.delta", requestId: REQUEST_ID, text: "a" }]);
	});

	it("带 event:message 行（实测形态）→ 正常解析，event 行被忽略", () => {
		expect(parseChunks(['event: message\ndata: {"response_type":"answer","content":"ok"}\n\n'])).toEqual([
			{ type: "answer.delta", requestId: REQUEST_ID, text: "ok" },
		]);
	});

	it("忽略 tool_call / tool_result（不产出任何事件）", () => {
		expect(
			parseChunks([
				'event: message\ndata: {"response_type":"tool_call","content":"call"}\n\n',
				'data: {"response_type":"tool_result","content":"result"}\n\n',
			]),
		).toEqual([]);
	});

	it("超大事件（F4：300KB 的 tool_result）被忽略且不影响后续 answer", () => {
		const big = "x".repeat(300 * 1024);
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events = parser.push(`data: ${JSON.stringify({ response_type: "tool_result", content: big })}\n\n`);
		expect(events).toEqual([]);
		events.push(...parser.push('data: {"response_type":"answer","content":"after"}\n\n'));
		expect(events).toEqual([{ type: "answer.delta", requestId: REQUEST_ID, text: "after" }]);
	});

	it("error 幂等（F3）：连发两条完全相同的 error 只产出一次", () => {
		const frame = 'data: {"response_type":"error","content":"boom"}\n\n';
		expect(parseChunks([frame, frame])).toEqual([
			{ type: "turn.failed", requestId: REQUEST_ID, error: { code: "stream_error", detail: "boom" } },
		]);
	});

	it("首个 agent_query 事件 → turn.started，载荷含 session_id", () => {
		expect(
			parseChunks(['data: {"response_type":"agent_query","session_id":"sess-9","assistant_message_id":"m1"}\n\n']),
		).toEqual([{ type: "turn.started", requestId: REQUEST_ID, sessionId: "sess-9" }]);
	});

	it("agent_query 未带 session_id 时回退到构造时的 sessionId", () => {
		expect(parseChunks(['data: {"response_type":"agent_query"}\n\n'], "sess-fallback")).toEqual([
			{ type: "turn.started", requestId: REQUEST_ID, sessionId: "sess-fallback" },
		]);
	});

	it("EOF 处不完整事件被丢弃，不抛错", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events = parser.push(
			'data: {"response_type":"complete"}\n\ndata: {"response_type":"answer","content":"tail"}',
		);
		expect(events).toEqual([{ type: "turn.completed", requestId: REQUEST_ID }]);
		expect(parser.finish()).toEqual([]);
	});

	it("SSE error 事件 → stream_error", () => {
		expect(parseChunks(['data: {"response_type":"error","content":"bad"}\n\n'])).toEqual([
			{ type: "turn.failed", requestId: REQUEST_ID, error: { code: "stream_error", detail: "bad" } },
		]);
	});

	it("流自然结束但没收到 complete → stream_interrupted", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events = feed(parser, ['data: {"response_type":"answer","content":"partial"}\n\n']);
		events.push(...parser.finish());
		expect(events).toEqual([
			{ type: "answer.delta", requestId: REQUEST_ID, text: "partial" },
			{ type: "turn.failed", requestId: REQUEST_ID, error: { code: "stream_interrupted" } },
		]);
	});

	it("收到 complete 后 finish 不再产出 stream_interrupted", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events = feed(parser, ['data: {"response_type":"complete"}\n\n']);
		events.push(...parser.finish());
		expect(events).toEqual([{ type: "turn.completed", requestId: REQUEST_ID }]);
	});

	it("references 事件 → refs 列表", () => {
		expect(
			parseChunks([
				'data: {"response_type":"references","knowledge_references":[{"url":"https://a","title":"A"}]}\n\n',
			]),
		).toEqual([{ type: "references", requestId: REQUEST_ID, refs: [{ url: "https://a", title: "A" }] }]);
	});

	it("字节分片跨越 UTF-8 多字节边界时仍正确解码", () => {
		const encoder = new TextEncoder();
		const prefix = 'data: {"response_type":"answer","content":"';
		const full = encoder.encode(`${prefix}金蝶"}\n\n`);
		// 切在「金」的第一个字节之后，验证 TextDecoder 的 stream 模式
		const cut = encoder.encode(prefix).length + 1;
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events: WeKnoraStreamEvent[] = [];
		events.push(...parser.push(full.slice(0, cut)));
		events.push(...parser.push(full.slice(cut)));
		expect(events).toEqual([{ type: "answer.delta", requestId: REQUEST_ID, text: "金蝶" }]);
	});
});

// ---------------------------------------------------------------------------
// AC-25：思考 / 正式回答的分区切分（切分规则 = 「最后一次 tool 活动」）
// ---------------------------------------------------------------------------

/** 把一个 SSE 帧对象序列化成 `data: ...\n\n`。 */
function frame(payload: Record<string, unknown>): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

function answerFrame(content: string): string {
	return frame({ response_type: "answer", content });
}

function toolFrame(responseType: "tool_call" | "tool_result"): string {
	return frame({ response_type: responseType, content: "x" });
}

const completeFrame = frame({ response_type: "complete" });

/**
 * 按渲染层的同一规则把事件流归约成 `{ thinking, answer }`（终态字段）：
 * `answer.delta` 先累积到 `text`；`answer.promoted` 把尾部 `promotedLength` 个字符留在 `text`（正式回答），
 * 其余前缀转为 `thinking`。无提升事件时全部留在 `text`（视为正式回答）。
 */
function split(events: WeKnoraStreamEvent[]): { thinking: string; answer: string } {
	let text = "";
	let thinking = "";
	for (const event of events) {
		if (event.type === "answer.delta") {
			text += event.text;
		} else if (event.type === "answer.promoted") {
			const moved = Math.min(event.promotedLength, text.length);
			thinking = text.slice(0, text.length - moved);
			text = text.slice(text.length - moved);
		}
	}
	return { thinking, answer: text };
}

describe("createWeKnoraStreamParser · AC-25 思考/回答分区", () => {
	it("旁白 + 工具 + 长回答：旁白归 thinking，末段归 answer", () => {
		const events = parseChunks([
			answerFrame("我来帮你查一下。"),
			toolFrame("tool_call"),
			toolFrame("tool_result"),
			answerFrame("现在给出正式回答。"),
			completeFrame,
		]);
		expect(split(events)).toEqual({ thinking: "我来帮你查一下。", answer: "现在给出正式回答。" });
	});

	it("未调工具的直答：全部归 answer（关键退化用例）", () => {
		const events = parseChunks([answerFrame("你好"), answerFrame("，这是直答。"), completeFrame]);
		expect(split(events)).toEqual({ thinking: "", answer: "你好，这是直答。" });
	});

	it("工具前有文本：归 thinking", () => {
		const events = parseChunks([answerFrame("先搜索一下。"), toolFrame("tool_call"), completeFrame]);
		expect(split(events)).toEqual({ thinking: "先搜索一下。", answer: "" });
	});

	it("连续两次工具循环：两段旁白都归 thinking，只有末段归 answer", () => {
		const events = parseChunks([
			answerFrame("旁白一。"),
			toolFrame("tool_call"),
			answerFrame("旁白二。"),
			toolFrame("tool_result"),
			answerFrame("正式回答。"),
			completeFrame,
		]);
		expect(split(events)).toEqual({ thinking: "旁白一。旁白二。", answer: "正式回答。" });
	});

	it("只有工具、无文本：不产生空事件，也不产生提升", () => {
		const events = parseChunks([toolFrame("tool_call"), toolFrame("tool_result"), completeFrame]);
		expect(events).toEqual([{ type: "turn.completed", requestId: REQUEST_ID }]);
		expect(events.some((event) => event.type === "answer.promoted")).toBe(false);
	});

	it("complete 后的提升：末段被正确标为 answer，且提升事件在 completed 之前", () => {
		const events = parseChunks([
			answerFrame("思考段。"),
			toolFrame("tool_call"),
			answerFrame("正式回答正文。"),
			completeFrame,
		]);
		const promoted = events.find((event) => event.type === "answer.promoted");
		expect(promoted).toEqual({
			type: "answer.promoted",
			requestId: REQUEST_ID,
			promotedLength: "正式回答正文。".length,
		});
		expect(events.indexOf(promoted as WeKnoraStreamEvent)).toBeLessThan(
			events.findIndex((event) => event.type === "turn.completed"),
		);
		expect(split(events)).toEqual({ thinking: "思考段。", answer: "正式回答正文。" });
	});

	it("多块分片的旁白：分片合并后仍正确归类", () => {
		const events = parseChunks([
			answerFrame("分"),
			answerFrame("片"),
			answerFrame("的"),
			answerFrame("旁白"),
			toolFrame("tool_call"),
			answerFrame("回答"),
			completeFrame,
		]);
		expect(split(events)).toEqual({ thinking: "分片的旁白", answer: "回答" });
	});

	it("流式期间即时透传：未收到 complete 前文本已产出（不缓冲）", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		expect(parser.push(answerFrame("进行中"))).toEqual([
			{ type: "answer.delta", requestId: REQUEST_ID, text: "进行中" },
		]);
	});

	it("未收到 complete（流中断）时不产生提升事件", () => {
		const parser = createWeKnoraStreamParser({ requestId: REQUEST_ID });
		const events = parser.push(answerFrame("半截回答"));
		events.push(...parser.finish());
		expect(events.some((event) => event.type === "answer.promoted")).toBe(false);
	});
});
