import type { HistoryPage } from "@preload/api-types/session";
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { ChatConversationItem, ChatTimelineItem, TranscriptPlaceholderItem } from "@shared/store/atoms";
import type { Message } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { beforeEach, describe, expect, it } from "vitest";
import { fullHistoryToChatWithSpans } from "./chat-service";
import { patchLiveItemWithCanonical } from "./live-history-patch";
import {
	applyTranscriptWindow,
	clearTranscriptBacklog,
	isTranscriptItemEvictable,
	isTranscriptPlaceholder,
	materializeTranscriptItem,
	measureHistoryEntryFootprint,
	mergeTranscriptHeadPage,
	prependTranscriptPage,
	readTranscriptBacklog,
	reconcileWindowedProjection,
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
				promptRef: { kind: "skill", name: "open-forge-testing" },
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

// ── TASK-0050 游标分页窗口 ──────────────────────────────────────────────

/** HistoryEntry 是联合类型，timing/marker 类条目没有 entryId。 */
function entryIdOf(entry: HistoryEntry): string | undefined {
	return "entryId" in entry ? entry.entryId : undefined;
}

function headPage(entries: HistoryEntry[], overrides?: Partial<HistoryPage>): HistoryPage {
	return { history: entries, hasMore: false, head: true, ...overrides };
}

describe("prependTranscriptPage", () => {
	it("更早页拼到窗口前面，顺序旧→新", () => {
		const windowEntries = [userEntry("u-4", "q4"), assistantEntry("a-4", "a4")];
		const older = headPage([userEntry("u-2", "q2"), userEntry("u-3", "q3")], {
			nextBeforeEntry: "cursor-0",
			hasMore: true,
			head: false,
		});
		const merged = prependTranscriptPage(windowEntries, older);
		expect(merged.map(entryIdOf)).toEqual(["u-2", "u-3", "u-4", "a-4"]);
	});
});

describe("mergeTranscriptHeadPage", () => {
	it("append-only：页覆盖窗口末端并带新增尾部 → extend，整页成为窗口", () => {
		const windowEntries = [userEntry("u-1", "q1"), assistantEntry("a-1", "a1")];
		const page = headPage([...windowEntries, userEntry("u-2", "q2"), assistantEntry("a-2", "a2")]);
		const merge = mergeTranscriptHeadPage(windowEntries, page);
		expect(merge.kind).toBe("extend");
		expect(merge.kind === "extend" ? merge.entries.map(entryIdOf) : []).toEqual(["u-1", "a-1", "u-2", "a-2"]);
	});

	it("窗口已翻过多页：页只覆盖窗口后缀，更旧的已加载前缀原样保留", () => {
		const older = [userEntry("u-0", "q0"), assistantEntry("a-0", "a0")];
		const tail = [userEntry("u-1", "q1"), assistantEntry("a-1", "a1")];
		const windowEntries = [...older, ...tail];
		// 新 head 页覆盖 tail 并追加一条。
		const page = headPage([...tail, userEntry("u-2", "q2")]);
		const merge = mergeTranscriptHeadPage(windowEntries, page);
		expect(merge.kind).toBe("extend");
		expect(merge.kind === "extend" ? merge.entries.map(entryIdOf) : []).toEqual(["u-0", "a-0", "u-1", "a-1", "u-2"]);
	});

	it("页与窗口完全一致 → unchanged（不产生新数组给调用方提交）", () => {
		const windowEntries = [userEntry("u-1", "q1"), assistantEntry("a-1", "a1")];
		expect(mergeTranscriptHeadPage(windowEntries, headPage([...windowEntries])).kind).toBe("unchanged");
	});

	it("窗口内条目被改写（编辑/分支/压缩）→ replaced，整窗回到这一页", () => {
		const windowEntries = [userEntry("u-1", "q1"), userEntry("u-2", "q2"), assistantEntry("a-2", "a2")];
		// u-2 被编辑改写 → 重叠区签名失配。
		const page = headPage([userEntry("u-1", "q1"), userEntry("u-2x", "q2 edited"), assistantEntry("a-2", "a2")]);
		const merge = mergeTranscriptHeadPage(windowEntries, page);
		expect(merge.kind).toBe("replaced");
		expect(merge.kind === "replaced" ? merge.entries.map(entryIdOf) : []).toEqual(["u-1", "u-2x", "a-2"]);
	});

	it("窗口末端条目在页中不存在（尾部被删/重写）→ replaced", () => {
		const windowEntries = [userEntry("u-1", "q1"), userEntry("u-2", "q2")];
		const page = headPage([userEntry("u-9", "other")]);
		expect(mergeTranscriptHeadPage(windowEntries, page).kind).toBe("replaced");
	});

	it("空窗口 → replaced 为整页（初始窗口建立）", () => {
		const page = headPage([userEntry("u-1", "q1")]);
		const merge = mergeTranscriptHeadPage([], page);
		expect(merge.kind).toBe("replaced");
		expect(merge.kind === "replaced" ? merge.entries.map(entryIdOf) : []).toEqual(["u-1"]);
	});

	it("无 entryId 的同形条目签名重复：按最靠后匹配锚定窗口末端", () => {
		// 无 id 的 marker 条目内容相同 → FNV 签名相同；末端锚应取页中最后一次出现。
		const marker = (t: string): HistoryEntry => ({
			type: "prompt_ref_marker",
			promptRef: { kind: "skill", name: "same" },
			timestamp: t,
		});
		const windowEntries = [marker("t1"), marker("t1")];
		const page = headPage([marker("t1"), marker("t1"), marker("t1")]);
		const merge = mergeTranscriptHeadPage(windowEntries, page);
		expect(merge.kind).toBe("extend");
		expect(merge.kind === "extend" ? merge.entries.length : 0).toBe(3);
	});
});

describe("reconcileWindowedProjection", () => {
	function completedUser(id: string, entryId: string, text: string): ChatTimelineItem {
		return createConversationUserMessage({ id, entryId, text, deliveryPhase: "completed" });
	}
	function completedAgent(id: string, entryId: string): ChatTimelineItem {
		return createConversationAgentMessage({ id, entryId, phase: "completed", blocks: [] });
	}

	it("durable key 回收 live 对象：同 entryId 的占位/消息原对象沿用", () => {
		const liveUser = completedUser("live-u", "u-1", "q1");
		const liveAgent = completedAgent("live-a", "a-1");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationAgentMessage({ id: "proj-a", entryId: "a-1", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([liveUser, liveAgent], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items).toHaveLength(2);
		// patch 在字段无差异时原样返回 live 对象。
		expect(result.items[0]).toBe(liveUser);
		expect(result.items[1]).toBe(liveAgent);
		expect(result.canonicalItemIndexes).toHaveLength(2);
		expect(result.prependedCount).toBe(0);
	});

	it("占位 item 按 role 归一键命中投影 item 并原样复用（不打补丁）", () => {
		const placeholder: TranscriptPlaceholderItem = {
			kind: "placeholder",
			id: "ph-a",
			entryId: "a-1",
			renderKey: "rk",
			turnId: "t-1",
			authorId: "agent",
			role: "assistant",
			summary: "…",
			phase: "completed",
		};
		const canonical: ChatConversationItem[] = [
			createConversationAgentMessage({ id: "proj-a", entryId: "a-1", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([placeholder], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items[0]).toBe(placeholder);
	});

	it("向上翻页：头部新投影 item 计入 prependedCount，旧窗 item 复用", () => {
		const liveUser = completedUser("live-u", "u-1", "q1");
		const liveAgent = completedAgent("live-a", "a-1");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u0", entryId: "u-0", text: "q0" }),
			createConversationAgentMessage({ id: "proj-a0", entryId: "a-0", phase: "completed", blocks: [] }),
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationAgentMessage({ id: "proj-a", entryId: "a-1", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([liveUser, liveAgent], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items).toHaveLength(4);
		expect(result.prependedCount).toBe(2);
		expect(result.items[2]).toBe(liveUser);
		expect(result.items[3]).toBe(liveAgent);
	});

	it("patch 回填 canonical 元数据但保留 live 正文/blocks", () => {
		const liveAgent = createConversationAgentMessage({
			id: "live-a",
			phase: "completed",
			blocks: [{ type: "text", id: "b1", text: "live blocks" }],
		});
		const canonical = createConversationAgentMessage({
			id: "proj-a",
			entryId: "a-1",
			phase: "completed",
			blocks: [{ type: "text", id: "b1", text: "canonical blocks" }],
			endedAt: 999,
		});
		const result = reconcileWindowedProjection([liveAgent], [canonical], {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		const merged = result.items[0];
		expect(merged?.kind).toBe("agent");
		if (merged?.kind === "agent") {
			expect(merged.entryId).toBe("a-1");
			expect(merged.endedAt).toBe(999);
			expect(merged.blocks[0]).toMatchObject({ text: "live blocks" });
		}
	});

	it("excludeLiveIds 剔除过期乐观气泡；live-only 尾部（流式）保持在末尾", () => {
		const expired = createConversationUserMessage({ id: "opt-old", text: "ghost", deliveryPhase: "pending" });
		const streaming = createConversationAgentMessage({ id: "live-stream", phase: "streaming", blocks: [] });
		const liveUser = completedUser("live-u", "u-1", "q1");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
		];
		const result = reconcileWindowedProjection([liveUser, expired, streaming], canonical, {
			excludeLiveIds: new Set(["opt-old"]),
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items).toHaveLength(2);
		expect(result.items[0]).toBe(liveUser);
		expect(result.items[1]?.id).toBe("live-stream");
		expect(result.canonicalItemIndexes).toHaveLength(1);
	});

	it("夹在已消费项之间的 live-only 项保持因果位置，不平铺到回复末尾", () => {
		// 队列镜像气泡在 live 里排在它触发的回复之前；窗口化提交若把未消费
		// live-only 项一律追加尾部，气泡会跑到回复之后（BUG-0068）。
		const liveUser = completedUser("live-u", "u-1", "q1");
		const mirror = createConversationUserMessage({ id: "opt-2", text: "followup", deliveryPhase: "pending" });
		const liveAgent = completedAgent("live-a", "a-2");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationAgentMessage({ id: "proj-a", entryId: "a-2", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([liveUser, mirror, liveAgent], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items.map((item) => item.id)).toEqual(["live-u", "opt-2", "live-a"]);
	});

	it("live-only 项没有已消费前驱时锚定到最近已消费后继之前", () => {
		const mirror = createConversationUserMessage({ id: "opt-1", text: "followup", deliveryPhase: "pending" });
		const liveUser = completedUser("live-u", "u-1", "q1");
		const liveAgent = completedAgent("live-a", "a-1");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationAgentMessage({ id: "proj-a", entryId: "a-1", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([mirror, liveUser, liveAgent], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items.map((item) => item.id)).toEqual(["opt-1", "live-u", "live-a"]);
	});

	it("(b) 槽位文本不匹配的排队幽灵保持尾部，镜像气泡仍锚到孪生槽前", () => {
		// (b) 的依据是「该槽位最可能是规范孪生」：锚定槽的 user 文本必须与
		// 气泡一致才锚定中段；孪生永远不会入模的排队幽灵（如取消失败回队
		// 留下的镜像）插进中段会跑到比它更晚的已发送消息之前（BUG-0073）。
		const liveUser = completedUser("live-u", "u-1", "q1");
		const mirror = createConversationUserMessage({ id: "opt-2", text: "followup", deliveryPhase: "pending" });
		const ghost = createConversationUserMessage({ id: "opt-ghost", text: "还在排队", deliveryPhase: "pending" });
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationUserMessage({ id: "proj-u10", entryId: "u-10", text: "followup" }),
			createConversationAgentMessage({ id: "proj-a10", entryId: "a-10", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([liveUser, mirror, ghost], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items.map((item) => item.id)).toEqual(["live-u", "opt-2", "proj-u10", "proj-a10", "opt-ghost"]);
	});

	it("首部锚定的 live-only 项不计入 prependedCount", () => {
		// (a) 锚定到结果头部的 pending 是既有 live 行的重排，不是新前插内容；
		// loadOlderTranscriptPage 拿 prependedCount 前移 Virtuoso firstItemIndex，
		// 多计一行滚动锚点就跳一行（BUG-0073）。
		const pendingHead = createConversationUserMessage({ id: "opt-head", text: "早期气泡", deliveryPhase: "pending" });
		const liveUser = completedUser("live-u", "u-1", "q1");
		const liveAgent = completedAgent("live-a", "a-1");
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
			createConversationAgentMessage({ id: "proj-a", entryId: "a-1", phase: "completed", blocks: [] }),
		];
		const result = reconcileWindowedProjection([pendingHead, liveUser, liveAgent], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items.map((item) => item.id)).toEqual(["opt-head", "live-u", "live-a"]);
		expect(result.prependedCount).toBe(0);
	});

	it("完全无已消费邻居的 live-only 项仍追加尾部", () => {
		const streaming = createConversationAgentMessage({ id: "live-stream", phase: "streaming", blocks: [] });
		const canonical: ChatConversationItem[] = [
			createConversationUserMessage({ id: "proj-u", entryId: "u-1", text: "q1" }),
		];
		const result = reconcileWindowedProjection([streaming], canonical, {
			patchLiveItem: patchLiveItemWithCanonical,
		});
		expect(result.items.map((item) => item.id)).toEqual(["proj-u", "live-stream"]);
	});

	it("无 entryId 的 live 项按 kind 有序配对；kind 不匹配的项不被消费", () => {
		// live: [无 key 的 event, 无 key 的 completed agent]；
		// canonical: [无 key agent, 无 key event]——顺序相反也要各自配上。
		const liveEvent: ChatTimelineItem = {
			kind: "event",
			id: "ev-live",
			event: { kind: "notice", text: "n" } as never,
		};
		const liveAgent = createConversationAgentMessage({ id: "a-live", phase: "completed", blocks: [] });
		const canonicalAgent = createConversationAgentMessage({
			id: "a-proj",
			phase: "completed",
			blocks: [{ type: "text", id: "x", text: "c" }],
		});
		const canonicalEvent: ChatConversationItem = {
			kind: "event",
			id: "ev-proj",
			event: { kind: "notice", text: "n2" } as never,
		};
		const result = reconcileWindowedProjection([liveEvent, liveAgent], [canonicalAgent, canonicalEvent]);
		// canonicalAgent 配对 liveAgent（kind agent）；canonicalEvent 配对 liveEvent。
		expect(result.items[0]?.id).toBe("a-live");
		expect(result.items[1]?.id).toBe("ev-live");
		expect(result.canonicalItemIndexes).toHaveLength(2);
	});
});
