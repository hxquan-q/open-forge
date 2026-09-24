// Modified by The Open Forge contributors.
/**
 * TASK-0035 transcript 视口占位：视口+overscan 外的持久化消息降级为轻量占位，
 * 进入活动窗口时从原始 HistoryEntry backlog 按 span 切片重投影恢复。
 *
 * 不变量：
 * - JSONL/HistoryEntry backlog 是唯一事实源；占位不持有 blocks/正文/媒体字节。
 * - 占位↔完整互换保持 id/entryId/renderKey 与 timeline 位置不变。
 * - 流式/未完成/编辑中的 item 不降级；恢复失败保留可重试占位。
 */
import type { ChatConversationItem, ChatTimelineItem, TranscriptPlaceholderItem } from "@shared/store/atoms";
import type { HistoryEntry } from "@vetta/runtime-core";
import { fullHistoryToChatWithSpans, type TranscriptItemSpan } from "./chat-service";

export const TRANSCRIPT_SUMMARY_MAX_CHARS = 120;

export interface TranscriptBacklog {
	readonly entries: readonly HistoryEntry[];
	/** item.id → entry 区间（闭区间）。 */
	readonly spans: ReadonlyMap<string, TranscriptItemSpan>;
	readonly mediaSessionId?: string;
}

export interface TranscriptViewportRange {
	readonly startIndex: number;
	readonly endIndex: number;
}

/** 每会话一份 backlog；会话切换时整体替换，避免跨会话误恢复。 */
interface BacklogRecord {
	readonly backlog: TranscriptBacklog;
	readonly bytes: number;
}
const backlogs = new Map<string, BacklogRecord>();
/** 保留的 backlog 上限——主 transcript 同时只有一个活跃会话，留少量余量给会话快速来回切换。 */
const BACKLOG_LIMIT = 2;
/**
 * 恢复源整体字节预算（默认 ~128MB）：计数上限之外的字节约束，
 * 防止少数超长会话把恢复源膨胀成全量 transcript 驻留。
 */
export const TRANSCRIPT_BACKLOG_BYTE_BUDGET = 128 * 1024 * 1024;

/**
 * HistoryEntry 驻留字节近似：序列化长度 × UTF-16 双字节。
 * 按 footprint 计费——message content 的 tool args/results、text、
 * thinking、usage 全部计入，不只算用户可见文本。
 */
export function measureHistoryEntryFootprint(entry: HistoryEntry): number {
	return JSON.stringify(entry).length * 2;
}

export interface RegisterTranscriptBacklogOptions {
	/** 覆盖默认字节预算（宿主调优/测试注入）。 */
	readonly byteBudget?: number;
}

function totalBacklogBytes(): number {
	let total = 0;
	for (const record of backlogs.values()) total += record.bytes;
	return total;
}

export function registerTranscriptBacklog(
	sessionKey: string,
	backlog: TranscriptBacklog,
	options?: RegisterTranscriptBacklogOptions,
): void {
	backlogs.delete(sessionKey);
	let bytes = 0;
	for (const entry of backlog.entries) bytes += measureHistoryEntryFootprint(entry);
	backlogs.set(sessionKey, { backlog, bytes });
	const byteBudget = options?.byteBudget ?? TRANSCRIPT_BACKLOG_BYTE_BUDGET;
	// 计数与字节任一超限即按 LRU 驱逐；保底保留最后一份——
	// 它是最近注册（活跃）会话的恢复源，逐掉会打断占位恢复。
	while (backlogs.size > 1) {
		if (backlogs.size <= BACKLOG_LIMIT && totalBacklogBytes() <= byteBudget) break;
		const oldest = backlogs.keys().next().value;
		if (oldest === undefined) break;
		backlogs.delete(oldest);
	}
}

export function readTranscriptBacklog(sessionKey: string): TranscriptBacklog | undefined {
	return backlogs.get(sessionKey)?.backlog;
}

export function clearTranscriptBacklog(sessionKey?: string): void {
	if (sessionKey === undefined) backlogs.clear();
	else backlogs.delete(sessionKey);
}

export function isTranscriptPlaceholder(item: ChatTimelineItem): item is TranscriptPlaceholderItem {
	return item.kind === "placeholder";
}

function clipSummary(text: string): string {
	const chars = [...text.replaceAll(/\s+/g, " ").trim()];
	if (chars.length <= TRANSCRIPT_SUMMARY_MAX_CHARS) return chars.join("");
	return `${chars.slice(0, TRANSCRIPT_SUMMARY_MAX_CHARS).join("")}…`;
}

/** 从完整 item 抽取 ≤120 Unicode 字符摘要（不保留任何正文/媒体字段）。 */
function summarizeItem(item: ChatConversationItem): string {
	const raw =
		item.kind === "user"
			? item.text
			: item.kind === "agent"
				? (item.text ??
					item.blocks
						?.filter((b) => b.type === "text" || b.type === "thinking")
						.map((b) => b.text)
						.join(" ") ??
					"")
				: "";
	return clipSummary(raw);
}

/** 占位构造；非消息类 item（event 等）与恢复所需 span 缺失时返回 undefined。 */
export function toTranscriptPlaceholder(item: ChatConversationItem): TranscriptPlaceholderItem | undefined {
	if (item.kind === "user") {
		return {
			kind: "placeholder",
			id: item.id,
			entryId: item.entryId,
			renderKey: item.renderKey,
			parentId: item.parentId,
			turnId: item.turnId,
			authorId: item.authorId,
			timestamp: item.timestamp,
			role: "user",
			summary: summarizeItem(item),
			branch: item.branch,
			model: item.model,
			deliveryPhase: item.deliveryPhase,
		};
	}
	if (item.kind === "agent") {
		return {
			kind: "placeholder",
			id: item.id,
			entryId: item.entryId,
			renderKey: item.renderKey,
			parentId: item.parentId,
			turnId: item.turnId,
			authorId: item.authorId,
			timestamp: item.timestamp,
			role: "assistant",
			summary: summarizeItem(item),
			usages: item.usages,
			phase:
				item.phase === "completed" || item.phase === "failed" || item.phase === "aborted"
					? item.phase
					: "completed",
		};
	}
	return undefined;
}

export interface TranscriptEvictionContext {
	/** 正在编辑/重发中的 entryId（pendingMessageEdit）。 */
	readonly editingEntryId?: string;
}

/**
 * 是否允许降级为占位：仅限持久化完成态消息；流式/等待/发送中/编辑中一律排除。
 */
export function isTranscriptItemEvictable(
	item: ChatTimelineItem,
	ctx: TranscriptEvictionContext,
): item is ChatConversationItem {
	if (item.kind !== "user" && item.kind !== "agent") return false;
	if (item.entryId && item.entryId === ctx.editingEntryId) return false;
	if (item.kind === "user") {
		return item.deliveryPhase === "completed";
	}
	return item.phase === "completed" || item.phase === "failed" || item.phase === "aborted";
}

/** 占位 → 完整消息；backlog/span 缺失或投影不出对应 item 时返回 undefined（调用方保留占位）。 */
export function materializeTranscriptItem(
	placeholder: TranscriptPlaceholderItem,
	backlog: TranscriptBacklog | undefined,
): ChatConversationItem | undefined {
	const span = backlog?.spans.get(placeholder.id);
	if (!backlog || !span) return undefined;
	const slice = backlog.entries.slice(span.start, span.end + 1);
	const projected = fullHistoryToChatWithSpans(slice, backlog.mediaSessionId).messages;
	const restored =
		projected.length === 1
			? projected[0]
			: projected.find((item) => item.id === placeholder.id || item.entryId === placeholder.entryId);
	if (!restored) return undefined;
	if (restored.kind !== "user" && restored.kind !== "agent") return undefined;
	// 无 entryId 的 agent item 投影 id 是 hist-asst-{index}，切片重投影下标不同——
	// 统一沿用占位 id，保证 renderKey/timeline 身份稳定。
	if (restored.id !== placeholder.id || restored.entryId !== placeholder.entryId) {
		return { ...restored, id: placeholder.id, entryId: placeholder.entryId };
	}
	return restored;
}

export interface TranscriptWindowApplyResult {
	readonly items: ChatTimelineItem[];
	readonly restored: number;
	readonly evicted: number;
}

/**
 * 应用视口窗口：[range] 内的占位恢复、范围外的可降级完整 item 降级。
 * 无变化时返回 undefined，调用方直接沿用原数组引用避免无效渲染。
 */
export function applyTranscriptWindow(
	items: readonly ChatTimelineItem[],
	range: TranscriptViewportRange,
	backlog: TranscriptBacklog | undefined,
	ctx: TranscriptEvictionContext,
): TranscriptWindowApplyResult | undefined {
	const next = items.slice();
	let restored = 0;
	let evicted = 0;
	const upper = Math.min(range.endIndex, next.length - 1);
	const lower = Math.max(range.startIndex, 0);
	for (let i = lower; i <= upper; i += 1) {
		const item = next[i];
		if (item.kind !== "placeholder") continue;
		const full = materializeTranscriptItem(item, backlog);
		if (full) {
			next[i] = full;
			restored += 1;
		}
	}
	for (let i = 0; i < next.length; i += 1) {
		if (i >= lower && i <= upper) continue;
		const item = next[i];
		if (!isTranscriptItemEvictable(item, ctx)) continue;
		const placeholder = toTranscriptPlaceholder(item);
		if (placeholder && backlog?.spans.has(placeholder.id)) {
			next[i] = placeholder;
			evicted += 1;
		}
	}
	if (restored === 0 && evicted === 0) return undefined;
	return { items: next, restored, evicted };
}
