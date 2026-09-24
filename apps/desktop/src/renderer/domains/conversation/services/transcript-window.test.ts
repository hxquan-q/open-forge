import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { ChatConversationItem, TranscriptPlaceholderItem } from "@shared/store/atoms";
import type { Message } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { beforeEach, describe, expect, it } from "vitest";
import { fullHistoryToChatWithSpans } from "./chat-service";
import {
	applyTranscriptWindow,
	clearTranscriptBacklog,
	isTranscriptItemEvictable,
	isTranscriptPlaceholder,
	materializeTranscriptItem,
	measureHistoryEntryFootprint,
	readTranscriptBacklog,
	registerTranscriptBacklog,
	TRANSCRIPT_SUMMARY_MAX_CHARS,
	type TranscriptBacklog,
	toTranscriptPlaceholder,
} from "./transcript-window";

function userEntry(entryId: string, text: string): HistoryEntry {
	return { type: "message", entryId, message: { role: "user", content: text, timestamp: 1 } };
}

function assistantMessage(text: string): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "openai",
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
		timestamp: 2,
	};
}

function assistantEntry(entryId: string, text: string): HistoryEntry {
	return { type: "message", entryId, message: assistantMessage(text) };
}

function toolResultEntry(entryId: string, toolCallId: string, output: string): HistoryEntry {
	return {
		type: "message",
		entryId,
		message: {
			role: "toolResult",
			toolCallId,
			toolName: "bash",
			content: [{ type: "text", text: output }],
			isError: false,
			timestamp: 3,
		},
	};
}

function sampleHistory(turns: number): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	for (let i = 0; i < turns; i += 1) {
		entries.push(userEntry(`u-${i}`, `question ${i}`));
		entries.push(assistantEntry(`a-${i}`, `answer ${i}`));
	}
	return entries;
}

function backlogFor(entries: HistoryEntry[]): {
	readonly messages: ChatConversationItem[];
	readonly backlog: TranscriptBacklog;
} {
	const projected = fullHistoryToChatWithSpans(entries, "media-session");
	return { messages: projected.messages, backlog: { entries, spans: projected.spans } };
}

describe("toTranscriptPlaceholder", () => {
	it("user 消息降级保留身份与元数据，不携带正文/blocks", () => {
		const item = createConversationUserMessage({
			id: "u-1",
			entryId: "e-1",
			renderKey: "rk-1",
			parentId: "p-1",
			turnId: "t-1",
			authorId: "me",
			timestamp: 42,
			text: "hello",
			branch: { siblings: ["e-1", "e-2"], index: 0 },
			model: { provider: "qwen", id: "qwen3" },
		});
		const placeholder = toTranscriptPlaceholder(item);
		expect(placeholder).toMatchObject({
			kind: "placeholder",
			id: "u-1",
			entryId: "e-1",
			renderKey: "rk-1",
			parentId: "p-1",
			turnId: "t-1",
			authorId: "me",
			timestamp: 42,
			role: "user",
			summary: "hello",
			branch: { siblings: ["e-1", "e-2"], index: 0 },
			model: { provider: "qwen", id: "qwen3" },
			deliveryPhase: "completed",
		});
		expect(placeholder).not.toHaveProperty("text");
		expect(placeholder).not.toHaveProperty("blocks");
	});

	it("agent 消息降级保留 usages 与终态 phase，摘要取自正文或文本块", () => {
		const usages = [
			{
				input: 1,
				output: 2,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 3,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		];
		const item = createConversationAgentMessage({
			id: "a-1",
			entryId: "ea-1",
			phase: "failed",
			blocks: [{ type: "text", id: "b-1", text: "block text" }],
			usages,
		});
		const placeholder = toTranscriptPlaceholder(item);
		expect(placeholder).toMatchObject({
			kind: "placeholder",
			role: "assistant",
			summary: "block text",
			usages,
			phase: "failed",
		});
	});

	it("摘要折叠空白并裁剪到 120 字符", () => {
		const longText = `${"  word\n".repeat(60)}`;
		const item = createConversationUserMessage({ id: "u-2", text: longText });
		const placeholder = toTranscriptPlaceholder(item) as TranscriptPlaceholderItem;
		expect(placeholder.summary.endsWith("…")).toBe(true);
		expect([...placeholder.summary].length).toBe(TRANSCRIPT_SUMMARY_MAX_CHARS + 1);
		expect(placeholder.summary).not.toMatch(/\s{2,}/);
	});

	it("event 等非消息 item 不生成占位", () => {
		const event = {
			kind: "event" as const,
			id: "ev-1",
			event: { kind: "compaction" as const, summary: "s" },
		};
		expect(toTranscriptPlaceholder(event)).toBeUndefined();
	});
});

describe("isTranscriptItemEvictable", () => {
	it("流式/待发送/编辑中的 item 不降级", () => {
		const streaming = createConversationAgentMessage({ id: "a", phase: "streaming", blocks: [] });
		const pendingUser = createConversationUserMessage({ id: "u", text: "x", deliveryPhase: "pending" });
		expect(isTranscriptItemEvictable(streaming, {})).toBe(false);
		expect(isTranscriptItemEvictable(pendingUser, {})).toBe(false);
	});

	it("editingEntryId 命中的 item 不降级", () => {
		const editing = createConversationUserMessage({ id: "u", entryId: "e-edit", text: "x" });
		expect(isTranscriptItemEvictable(editing, { editingEntryId: "e-edit" })).toBe(false);
		expect(isTranscriptItemEvictable(editing, { editingEntryId: "other" })).toBe(true);
	});

	it("完成态 user / 终态 agent 可降级", () => {
		expect(isTranscriptItemEvictable(createConversationUserMessage({ id: "u", text: "x" }), {})).toBe(true);
		for (const phase of ["completed", "failed", "aborted"] as const) {
			expect(isTranscriptItemEvictable(createConversationAgentMessage({ id: "a", phase, blocks: [] }), {})).toBe(
				true,
			);
		}
	});
});

describe("fullHistoryToChatWithSpans", () => {
	it("span 连续覆盖全部 entry，marker 序列归入其后第一条 user 消息", () => {
		const entries: HistoryEntry[] = [
			{
				type: "prompt_ref_marker",
				promptRef: { kind: "skill", name: "vetta-testing" },
				timestamp: "2024-01-01T00:00:00Z",
			},
			userEntry("u-0", "q0"),
			assistantEntry("a-0", "a0"),
			userEntry("u-1", "q1"),
			assistantEntry("a-1", "a1"),
		];
		const { messages, spans } = fullHistoryToChatWithSpans(entries);
		expect(messages).toHaveLength(4);
		// marker(0) + user(1) 属于 user item 的 span。
		expect(spans.get("u-0")).toEqual({ start: 0, end: 1 });
		expect(spans.get("a-0")).toEqual({ start: 2, end: 2 });
		expect(spans.get("u-1")).toEqual({ start: 3, end: 3 });
		expect(spans.get("a-1")).toEqual({ start: 4, end: 4 });
		// 连续覆盖 [0, entries.length-1]。
		const ordered = messages.map((m) => spans.get(m.id));
		for (let i = 1; i < ordered.length; i += 1) {
			expect(ordered[i]?.start).toBe((ordered[i - 1]?.end ?? -2) + 1);
		}
	});
});

describe("applyTranscriptWindow", () => {
	beforeEach(() => clearTranscriptBacklog());

	it("窗口外完成态消息降级为占位并保持 id/位置，窗口内占位恢复为完整消息", () => {
		const entries = sampleHistory(6);
		const { messages, backlog } = backlogFor(entries);
		// 只留最后两条（索引 10/11）为完整。
		const applied = applyTranscriptWindow(messages, { startIndex: 10, endIndex: 11 }, backlog, {});
		expect(applied).toBeDefined();
		expect(applied?.evicted).toBe(10);
		const items = applied?.items ?? [];
		expect(items[0]?.kind).toBe("placeholder");
		expect(items[0]?.id).toBe(messages[0]?.id);
		expect(items[0]?.entryId).toBe("u-0");
		expect(items[10]?.kind).toBe("user");
		expect(items[11]?.kind).toBe("agent");

		// 滚回顶部：占位恢复。
		const restored = applyTranscriptWindow(items, { startIndex: 0, endIndex: 1 }, backlog, {});
		expect(restored?.restored).toBe(2);
		const first = restored?.items[0];
		expect(first?.kind).toBe("user");
		expect(first?.id).toBe(messages[0]?.id);
		expect(first?.entryId).toBe("u-0");
		if (first?.kind === "user") expect(first.text).toBe("question 0");
		// 此时 10/11 出了窗口——重新降级。
		expect(restored?.items[10]?.kind).toBe("placeholder");
		expect(restored?.items[11]?.kind).toBe("placeholder");
	});

	it("无变化时返回 undefined（沿用原数组引用）", () => {
		const entries = sampleHistory(2);
		const { messages, backlog } = backlogFor(entries);
		expect(applyTranscriptWindow(messages, { startIndex: 0, endIndex: 3 }, backlog, {})).toBeUndefined();
	});

	it("backlog 缺失或不覆盖该 item 时不降级（保证非持久化/live item 不被吃掉）", () => {
		const { messages } = backlogFor(sampleHistory(2));
		const applied = applyTranscriptWindow(messages, { startIndex: 2, endIndex: 3 }, undefined, {});
		expect(applied).toBeUndefined();
	});

	it("恢复沿用占位 id——无 entryId 的 agent 切片重投影下标不同也不改身份", () => {
		const entries: HistoryEntry[] = [
			userEntry("u-0", "q0"),
			{ type: "message", message: assistantMessage("a0") },
			userEntry("u-1", "q1"),
		];
		const { messages, backlog } = backlogFor(entries);
		const agentItem = messages[1];
		expect(agentItem?.kind).toBe("agent");
		const applied = applyTranscriptWindow(messages, { startIndex: 2, endIndex: 2 }, backlog, {});
		const placeholder = applied?.items[1];
		expect(placeholder?.kind).toBe("placeholder");
		expect(placeholder?.id).toBe(agentItem?.id);

		const restored = materializeTranscriptItem(placeholder as TranscriptPlaceholderItem, backlog);
		expect(restored?.id).toBe(agentItem?.id);
		expect(restored?.kind).toBe("agent");
		if (restored?.kind === "agent") {
			expect(restored.blocks.some((b) => b.type === "text" && b.text === "a0")).toBe(true);
		}
	});

	it("恢复失败保留占位（span 缺失时 materialize 返回 undefined）", () => {
		const { messages, backlog } = backlogFor(sampleHistory(2));
		const applied = applyTranscriptWindow(messages, { startIndex: 2, endIndex: 3 }, backlog, {});
		const placeholder = applied?.items[0] as TranscriptPlaceholderItem;
		expect(isTranscriptPlaceholder(placeholder)).toBe(true);
		expect(materializeTranscriptItem(placeholder, undefined)).toBeUndefined();
		expect(materializeTranscriptItem(placeholder, { entries: [], spans: new Map() })).toBeUndefined();
	});
});

describe("registerTranscriptBacklog", () => {
	beforeEach(() => clearTranscriptBacklog());

	it("按 sessionKey 读写，超限淘汰最旧", () => {
		const backlog: TranscriptBacklog = { entries: [], spans: new Map() };
		registerTranscriptBacklog("s1", backlog);
		registerTranscriptBacklog("s2", backlog);
		registerTranscriptBacklog("s3", backlog);
		expect(readTranscriptBacklog("s1")).toBeUndefined();
		expect(readTranscriptBacklog("s2")).toBe(backlog);
		expect(readTranscriptBacklog("s3")).toBe(backlog);
		clearTranscriptBacklog("s2");
		expect(readTranscriptBacklog("s2")).toBeUndefined();
	});
});

describe("backlog 字节预算", () => {
	beforeEach(() => clearTranscriptBacklog());

	function heavyBacklog(outputChars: number): TranscriptBacklog {
		return { entries: [toolResultEntry("e", "tc", "x".repeat(outputChars))], spans: new Map() };
	}

	it("footprint 按驻留计费：toolResult 重型 entry 远大于轻量 entry，且随 payload 缩放", () => {
		const heavy = measureHistoryEntryFootprint(toolResultEntry("e-1", "tc-1", "x".repeat(10_000)));
		const light = measureHistoryEntryFootprint(userEntry("e-2", "hi"));
		// 工具结果正文计入账单——按条目数或可见文本计费都会漏掉它。
		expect(heavy).toBeGreaterThan(20_000);
		expect(heavy).toBeGreaterThan(light * 50);
		const heavier = measureHistoryEntryFootprint(toolResultEntry("e-3", "tc-3", "x".repeat(20_000)));
		expect(heavier).toBeGreaterThan(heavy);
	});

	it("超字节预算驱逐最旧的非活跃 backlog", () => {
		const oneEntryBytes = measureHistoryEntryFootprint(toolResultEntry("e", "tc", "x".repeat(5000)));
		// 预算恰好容纳两份重 backlog，第三份注册后最旧的被逐。
		const byteBudget = oneEntryBytes * 2 + 1;
		registerTranscriptBacklog("s1", heavyBacklog(5000), { byteBudget });
		registerTranscriptBacklog("s2", heavyBacklog(5000), { byteBudget });
		expect(readTranscriptBacklog("s1")).toBeDefined();
		expect(readTranscriptBacklog("s2")).toBeDefined();

		registerTranscriptBacklog("s3", heavyBacklog(5000), { byteBudget });
		expect(readTranscriptBacklog("s1")).toBeUndefined();
		expect(readTranscriptBacklog("s2")).toBeDefined();
		expect(readTranscriptBacklog("s3")).toBeDefined();
	});

	it("仅剩一份时即使超预算也不驱逐（活跃会话恢复源保底）", () => {
		const backlog = heavyBacklog(5000);
		registerTranscriptBacklog("s1", backlog, { byteBudget: 1 });
		expect(readTranscriptBacklog("s1")).toBe(backlog);
	});

	it("同 key 重复注册不重复计费", () => {
		const backlog = heavyBacklog(5000);
		const heavyEntry = backlog.entries[0];
		const smallEntry = userEntry("x", "y");
		const small = { entries: [smallEntry], spans: new Map() };
		// 预算恰好容纳 s1+s2 各一份；若 s1 重注册时旧字节泄漏进总额，s2 会被误逐。
		const byteBudget =
			(heavyEntry ? measureHistoryEntryFootprint(heavyEntry) : 0) + measureHistoryEntryFootprint(smallEntry) + 1;
		registerTranscriptBacklog("s1", backlog, { byteBudget });
		registerTranscriptBacklog("s2", small, { byteBudget });
		registerTranscriptBacklog("s1", backlog, { byteBudget });
		expect(readTranscriptBacklog("s2")).toBeDefined();
		expect(readTranscriptBacklog("s1")).toBe(backlog);
	});

	it("被逐会话重新注册后占位照常恢复（驱逐不打断恢复合同）", () => {
		const entries = sampleHistory(4);
		const { messages, backlog } = backlogFor(entries);
		registerTranscriptBacklog("s1", backlog);
		// 视口外降级出占位。
		const applied = applyTranscriptWindow(messages, { startIndex: 6, endIndex: 7 }, backlog, {});
		const placeholder = applied?.items[0] as TranscriptPlaceholderItem;
		expect(placeholder.kind).toBe("placeholder");

		// 另一会话的极小预算注册把 s1 挤出。
		registerTranscriptBacklog("s2", { entries: [userEntry("x", "y")], spans: new Map() }, { byteBudget: 1 });
		expect(readTranscriptBacklog("s1")).toBeUndefined();
		expect(materializeTranscriptItem(placeholder, readTranscriptBacklog("s1"))).toBeUndefined();

		// 切回 s1：canonical backfill 重新注册，占位照常恢复。
		registerTranscriptBacklog("s1", backlog);
		const restored = materializeTranscriptItem(placeholder, readTranscriptBacklog("s1"));
		expect(restored?.kind).toBe("user");
		expect(restored?.id).toBe(messages[0]?.id);
	});
});
