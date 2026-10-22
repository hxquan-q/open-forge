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

import type { HistoryPage } from "@preload/api-types/session";
import type { ChatConversationItem, ChatTimelineItem, TranscriptPlaceholderItem } from "@shared/store/atoms";
import type { HistoryEntry } from "@vetta/runtime-core";
import { historyEntrySignature } from "@/shared/history-entry-signature";
import { fullHistoryToChatWithSpans, type TranscriptItemSpan } from "./chat-service";
import { mergeWithCausalAnchors } from "./pending-user-anchor";

export const TRANSCRIPT_SUMMARY_MAX_CHARS = 120;

export interface TranscriptBacklog {
	readonly entries: readonly HistoryEntry[];
	/** item.id → entry 区间（闭区间）。 */
	readonly spans: ReadonlyMap<string, TranscriptItemSpan>;
	readonly mediaSessionId?: string;
	/**
	 * 已加载窗口旧端的翻页游标（TASK-0050）。`hasMore === true` 时按
	 * `nextBeforeEntry` 回传给 openViewer 取上一页；undefined/false 表示
	 * 已加载到历史起点或该 backlog 由无界全量路径注册。
	 */
	readonly nextBeforeEntry?: string;
	readonly hasMore?: boolean;
	/**
	 * 用户在「大历史」对话框里显式选择全量加载的会话标记：该窗口即完整
	 * transcript，agent_end/compaction 等回载仍走全量 getFullHistory，
	 * 不把视图收窄成尾页。
	 */
	readonly unbounded?: boolean;
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

// ── TASK-0050 游标分页窗口 ──────────────────────────────────────────────
// backlog.entries 是「已加载窗口」：总是历史的一个连续后缀。向上翻页在
// 头部拼入更早的页，agent_end/外部追加在尾部延展，分支/压缩等改写整窗
// 重置。窗口合并只操作 HistoryEntry；消息层的 reconcile 负责在重投影后
// 回收 live item（占位态、renderKey、流式草稿不动）。

export { prependTranscriptPage } from "./transcript-history-page-merge";

export type TranscriptHeadMerge =
	| { readonly kind: "extend"; readonly entries: HistoryEntry[] }
	| { readonly kind: "replaced"; readonly entries: HistoryEntry[] }
	| { readonly kind: "unchanged" };

/**
 * 用最新 head 页推进已加载窗口末端。
 *
 * 窗口末条在页中的位置把页切成两段：`[0..k]` 与窗口后缀重叠、
 * `(k..]` 是新增。重叠区逐条签名比对——任一失配说明窗口内发生过
 * 改写（编辑/分支/压缩），已加载前缀不再可信，返回 `replaced` 让
 * 调用方整窗重置为这一页。窗口比页更长时（窗口翻过几页），页只
 * 覆盖窗口后缀，多出的窗口前缀原样保留。
 */
export function mergeTranscriptHeadPage(
	windowEntries: readonly HistoryEntry[],
	page: HistoryPage,
): TranscriptHeadMerge {
	const pageEntries = page.history;
	if (windowEntries.length === 0) {
		return { kind: "replaced", entries: [...pageEntries] };
	}
	const endSignature = historyEntrySignature(windowEntries[windowEntries.length - 1]);
	// 内容签名可能重复（无 id 的同形条目），取最后一次出现：append-only
	// 语境下最靠后的匹配才是窗口末端当前位置。
	let overlapEnd = -1;
	for (let i = pageEntries.length - 1; i >= 0; i -= 1) {
		if (historyEntrySignature(pageEntries[i]) === endSignature) {
			overlapEnd = i;
			break;
		}
	}
	if (overlapEnd < 0) {
		return { kind: "replaced", entries: [...pageEntries] };
	}
	const covered = Math.min(overlapEnd + 1, windowEntries.length);
	const windowOverlapStart = windowEntries.length - covered;
	const pageOverlapStart = overlapEnd - covered + 1;
	for (let j = 0; j < covered; j += 1) {
		if (
			historyEntrySignature(windowEntries[windowOverlapStart + j]) !==
			historyEntrySignature(pageEntries[pageOverlapStart + j])
		) {
			return { kind: "replaced", entries: [...pageEntries] };
		}
	}
	// 页整体落在窗口覆盖区内（含窗口翻过旧页、页只盖后缀的情形）→
	// 合并结果与窗口逐条同签，什么也没变。
	if (pageEntries.length === covered) return { kind: "unchanged" };
	const prefix = windowEntries.slice(0, windowOverlapStart);
	return { kind: "extend", entries: [...prefix, ...pageEntries] };
}

/** durable item 的对位键：占位用 role 归一到投影侧 kind（assistant ↔ agent）。 */
function transcriptItemKey(item: ChatTimelineItem): string | undefined {
	const entryId = "entryId" in item ? item.entryId : undefined;
	if (!entryId) return undefined;
	if (item.kind === "placeholder") {
		return `${item.role === "assistant" ? "agent" : item.role}:${entryId}`;
	}
	return `${item.kind}:${entryId}`;
}

/**
 * 无 entryId 的 item 只能按序配对；只有处于可降级（已持久化终态）的
 * live item 才允许被投影 item 吸收——流式/待发送/编辑中的一律跳过，
 * 它们不属于 canonical，必须原样留在尾部。
 */
function isPairableLiveItem(item: ChatTimelineItem): boolean {
	if (item.kind === "placeholder" || item.kind === "event") return true;
	if (item.kind === "user") return item.deliveryPhase === "completed";
	if (item.kind === "agent") {
		return item.phase === "completed" || item.phase === "failed" || item.phase === "aborted";
	}
	return false;
}

function stableRenderKey<T extends ChatTimelineItem>(item: T): T {
	if ("renderKey" in item && item.renderKey) return item;
	return { ...item, renderKey: item.id };
}

export interface ReconcileWindowedResult {
	readonly items: ChatTimelineItem[];
	/** 结果头部连续「非 live 复用」的条数——向上翻页时 Virtuoso 的锚点位移。 */
	readonly prependedCount: number;
	/**
	 * projected[i] 在 items 中的落点下标：live-only 项会按 live 锚点穿插进
	 * canonical 序列之间，items 下标与 projected 下标不再一一对应，span /
	 * canonical 计数等按此映射定位（BUG-0068）。其长度即 projected 条数。
	 */
	readonly canonicalItemIndexes: readonly number[];
}

export interface ReconcileWindowedOptions {
	/** 需要从 live 中剔除的 item id（过期乐观气泡等）。 */
	readonly excludeLiveIds?: ReadonlySet<string>;
	/**
	 * durable 配对成功后的字段回填（entryId/branch/时间/usages）。
	 * 占位 item 恒按原样复用；patch 返回 null 时落到 canonical 新对象。
	 */
	readonly patchLiveItem?: (
		liveItem: ChatTimelineItem,
		canonicalItem: ChatConversationItem,
	) => ChatTimelineItem | null;
}

/**
 * 重投影后的窗口 reconcile：projected 是合并窗口（新 entries）投出的完整
 * item 序列，按 durable key 回收 live item 对象，保住占位态与渲染身份；
 * 无 key 的投影项与未消费的 live-only 项按 kind FIFO 配对（仅限终态），
 * 仍对不上的投影项直接用新对象。未消费的 live-only 项按 live 中最近的
 * 已消费前驱/后继锚定回原位——镜像用户气泡必须留在它触发的回复之前；
 * 完全没有已消费邻居时才追加尾部（BUG-0068）。
 *
 * 已加载窗口内被改写掉的 durable item（key 不在 projected 中）会被丢弃——
 * 这是「replaced」之外的轻量失配兜底；调用方若已知改写发生应直接重置。
 */
export function reconcileWindowedProjection(
	live: readonly ChatTimelineItem[],
	projected: readonly ChatConversationItem[],
	options?: ReconcileWindowedOptions,
): ReconcileWindowedResult {
	const excluded = options?.excludeLiveIds;
	const liveByKey = new Map<string, number[]>();
	// 对象身份直查：上游乐观对账会把同一个 live item 对象直接插回 canonical，
	// 身份命中优先于 key/pair 配对，避免重复入列。
	const liveByIdentity = new Map<ChatTimelineItem, number>();
	for (let i = 0; i < live.length; i += 1) {
		const item = live[i];
		if (excluded?.has(item.id)) continue;
		liveByIdentity.set(item, i);
		const key = transcriptItemKey(item);
		if (!key) continue;
		const list = liveByKey.get(key);
		if (list) list.push(i);
		else liveByKey.set(key, [i]);
	}
	const consumed = new Set<number>();
	const items: ChatTimelineItem[] = [];
	// live 下标 → items 下标：已消费 live 项的落点，供 live-only 项锚定回原位。
	const landedIndex = new Map<number, number>();
	const fromLive = new Array<boolean>(projected.length).fill(false);
	// 无 key item 的有序配对队列：只收集终态 durable，live-only 项不进队列。
	// 查找时按 kind 命中最早未消费项；不匹配的项留在原位供后续配对。
	const pairQueue: number[] = [];
	for (let i = 0; i < live.length; i += 1) {
		const item = live[i];
		if (excluded?.has(item.id)) continue;
		if (transcriptItemKey(item) === undefined && isPairableLiveItem(item)) pairQueue.push(i);
	}
	const pairNext = (kind: ChatConversationItem["kind"]): number | undefined => {
		for (let q = 0; q < pairQueue.length; q += 1) {
			const index = pairQueue[q];
			if (consumed.has(index)) continue;
			if (live[index].kind !== kind) continue;
			return index;
		}
		return undefined;
	};
	const patch = options?.patchLiveItem;
	const adoptLive = (index: number, canonical: ChatConversationItem): ChatTimelineItem => {
		const liveItem = live[index];
		// 占位不持有正文，字段都在 durable 身份上——原样复用保住降级态。
		// 未打补丁的 live 项也原样复用：补 renderKey 会换对象身份，React 重挂。
		if (!patch || liveItem.kind === "placeholder") return liveItem;
		return patch(liveItem, canonical) ?? stableRenderKey(canonical);
	};

	for (let i = 0; i < projected.length; i += 1) {
		const canonical = projected[i];
		const key = transcriptItemKey(canonical);
		let reuseIndex: number | undefined = liveByIdentity.get(canonical);
		if (reuseIndex !== undefined && consumed.has(reuseIndex)) reuseIndex = undefined;
		if (reuseIndex === undefined && key) {
			const candidates = liveByKey.get(key);
			reuseIndex = candidates?.find((index) => !consumed.has(index));
		}
		// canonical 带 key 但 live 侧没有对应 key 时，仍允许按序吸收无 key 的
		// 终态 live 项（如尚未回填 entryId 的已完成消息）——pairQueue 只收
		// 无 key 项，不会错配到别的 durable 条目上。
		if (reuseIndex === undefined) {
			reuseIndex = pairNext(canonical.kind);
		}
		if (reuseIndex !== undefined) {
			consumed.add(reuseIndex);
			items.push(adoptLive(reuseIndex, canonical));
			fromLive[i] = true;
			landedIndex.set(reuseIndex, items.length - 1);
		} else {
			items.push(stableRenderKey(canonical));
		}
	}
	// 未消费的 live-only 项按因果位置归位（BUG-0068），管线收编进共享助手；
	// 既非 pending 也未 landed 的项（= durable 但被改写）由助手丢弃（原语义）。
	const anchored = mergeWithCausalAnchors({
		base: items,
		order: live,
		isPendingIndex: (i) => !consumed.has(i) && !excluded?.has(live[i].id) && transcriptItemKey(live[i]) === undefined,
		landedBaseIndex: (i) => landedIndex.get(i),
	});
	const merged = anchored.items;
	const canonicalItemIndexes = anchored.baseIndexes;
	// 只统计头部连续「非 live 复用」的 projected 条目：首部锚定的 live-only
	// 项是既有 live 行的重排而非新前插内容，计入会让 loadOlderTranscriptPage
	// 对 Virtuoso firstItemIndex 多移相应行数，滚动锚点跳行（BUG-0073）。
	let prependedCount = 0;
	for (let k = 0; k < projected.length && !fromLive[k]; k += 1) {
		if (canonicalItemIndexes[k] !== prependedCount) break;
		prependedCount += 1;
	}
	return { items: merged, prependedCount, canonicalItemIndexes };
}
