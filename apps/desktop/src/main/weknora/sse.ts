// Copyright The Open Forge contributors.

import { createErrorDeduplicator, normalizeStreamError, streamInterruptedError } from "./errors.js";
import type { WeKnoraKnowledgeReference, WeKnoraStreamEvent } from "./types.js";

/**
 * WeKnora 的 SSE 增量解析器（纯函数式，无 I/O —— 不碰 fetch / reader，只吃字节或文本）。
 *
 * 协议要点（T00 实测）：
 * - 每个事件都带 `event:message` 行 → **忽略 `event:` 行**，只按 `data:` + 空行边界解析（F2）。
 * - `tool_call` / `tool_result` 是 agent 中间过程，不是回答 → **不产出任何事件**，但会**重置
 *   回答分区窗口**（见下）。
 * - 单个事件可能极大（实测一条 `tool_result` 含搜索结果全文，整条流 281KB）→ **不设事件大小上限**（F4）。
 * - 同一次失败可能连发两条相同 `error` → 由 errors.ts 的去重器保证只报一次（F3）。
 * - 流自然结束但没收到 `complete` → `stream_interrupted`。
 * - EOF 处不完整的事件按协议丢弃。
 *
 * ## 思考 / 回答分区（AC-25）
 *
 * 实测 447 事件流证实：旁白与正式回答**走同一种 `answer` 事件**，类型上无法区分，区别只在位置 ——
 * 旁白短且夹在 tool 活动之间，正式回答在**最后一个 tool 活动之后**。故按「最后一次 tool 活动」切分：
 * 之前的文本 = 思考（`thinking`），之后的 = 正式回答（`answer`）。
 *
 * 分片到达时无法预知后面是否还有工具活动，因此：
 * - 每个 `answer.delta` 一律先归 `thinking`（保守），**流式期间即时透传，不缓冲**。
 * - `tool_call` / `tool_result` 到达 → 把「距上次工具活动的累积长度」清零（`sawTool` 语义）。
 * - `complete` 到达 → 发出 `answer.promoted`，把该累积长度提升为正式回答。
 *
 * 退化情形：全程未调用任何工具 → 累积长度即全文 → 全部提升为正式回答，**不会被误判成思考**。
 */
export interface WeKnoraStreamParser {
	/** 喂入一块字节或文本，返回本块内已完整（遇到空行边界）的事件。 */
	push(chunk: Uint8Array | string): WeKnoraStreamEvent[];
	/** 自然结束：丢弃未完成事件；若整条流未收敛则产出 `stream_interrupted`。 */
	finish(): WeKnoraStreamEvent[];
}

export interface WeKnoraStreamParserOptions {
	/** 本次请求的 requestId，注入到每个事件。 */
	requestId: string;
	/** `agent_query` 帧未携带 `session_id` 时的回退值。 */
	sessionId?: string;
}

export function createWeKnoraStreamParser(options: WeKnoraStreamParserOptions): WeKnoraStreamParser {
	const { requestId } = options;
	const decoder = new TextDecoder();
	const dedupe = createErrorDeduplicator();

	let buffer = "";
	let dataLines: string[] = [];
	let started = false;
	/** 已收敛（收到 complete 或 error）—— 之后不再产出终态事件。 */
	let settled = false;
	/**
	 * 距「最后一次 tool 活动」以来累积的回答文本长度（AC-25）。
	 *
	 * 即票面状态机里的 `sawTool`：出现过工具活动后每次工具都把它清零；未调工具时它等于全文长度。
	 * `complete` 时以此长度把尾部文本提升为正式回答。
	 */
	let trailingAnswerLength = 0;
	/** 整条流累积的回答文本总长度；仅用于判断「有文本才发提升事件」（无文本不产空事件）。 */
	let totalAnswerLength = 0;

	const mapData = (data: string): WeKnoraStreamEvent[] => {
		const payload = parseJson(data);
		const record = asRecord(payload);
		if (!record) return [];
		const responseType = asString(record.response_type);

		switch (responseType) {
			case "agent_query": {
				if (started) return [];
				started = true;
				const sessionId = asString(record.session_id) ?? options.sessionId ?? "";
				return [{ type: "turn.started", requestId, sessionId }];
			}
			case "answer": {
				const content = asString(record.content);
				if (!content) return [];
				// 即时透传（不缓冲）；先按「思考」暂存，是否提升为正式回答要等 complete 才知道（AC-25）。
				trailingAnswerLength += content.length;
				totalAnswerLength += content.length;
				return [{ type: "answer.delta", requestId, text: content }];
			}
			case "references": {
				const refs = parseReferences(record.knowledge_references);
				if (refs.length === 0) return [];
				return [{ type: "references", requestId, refs }];
			}
			case "complete": {
				if (settled) return [];
				settled = true;
				const events: WeKnoraStreamEvent[] = [];
				// 把「最后一次 tool 活动之后」累积的文本提升为正式回答；promotedLength=0 表示整段都是思考。
				// 全程无文本时不产出空事件（票面「只有工具、无文本」用例）。
				if (totalAnswerLength > 0) {
					events.push({ type: "answer.promoted", requestId, promotedLength: trailingAnswerLength });
				}
				events.push({ type: "turn.completed", requestId });
				return events;
			}
			case "error": {
				const error = normalizeStreamError(asString(record.content));
				if (!dedupe.shouldReport(error)) return [];
				settled = true;
				return [{ type: "turn.failed", requestId, error }];
			}
			// tool_call / tool_result：agent 中间过程，不产出事件；但标记「最后一次 tool 活动」，
			// 把回答分区窗口清零 —— 之后的文本才是潜在的正式回答（AC-25）。
			case "tool_call":
			case "tool_result":
				trailingAnswerLength = 0;
				return [];
			// 其它未知类型：忽略，不产出事件。
			default:
				return [];
		}
	};

	const dispatch = (): WeKnoraStreamEvent[] => {
		if (dataLines.length === 0) return [];
		const data = dataLines.join("\n");
		dataLines = [];
		return mapData(data);
	};

	const handleLine = (line: string): WeKnoraStreamEvent[] => {
		if (line === "") return dispatch();
		if (line.startsWith(":")) return []; // 注释行
		if (line.startsWith("data:")) {
			// SSE 规范：冒号后可选一个空格，只去掉一个。
			const value = line.slice(5);
			dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
			return [];
		}
		// event: / id: / retry: 及其它字段一律忽略。
		return [];
	};

	return {
		push(chunk) {
			buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
			const events: WeKnoraStreamEvent[] = [];
			let index = buffer.indexOf("\n");
			while (index !== -1) {
				let line = buffer.slice(0, index);
				if (line.endsWith("\r")) line = line.slice(0, -1);
				buffer = buffer.slice(index + 1);
				events.push(...handleLine(line));
				index = buffer.indexOf("\n");
			}
			return events;
		},
		finish() {
			buffer = "";
			dataLines = [];
			if (settled) return [];
			settled = true;
			return [{ type: "turn.failed", requestId, error: streamInterruptedError() }];
		},
	};
}

function parseJson(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function parseReferences(raw: unknown): WeKnoraKnowledgeReference[] {
	if (!Array.isArray(raw)) return [];
	const refs: WeKnoraKnowledgeReference[] = [];
	for (const item of raw) {
		const record = asRecord(item);
		if (record) refs.push(record as WeKnoraKnowledgeReference);
	}
	return refs;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
