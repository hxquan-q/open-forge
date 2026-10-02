// Modified by The Open Forge contributors.
/**
 * transcript-window 的 atom 编排层：把 Virtuoso 上报的活动窗口范围应用到
 * chatMessagesAtom（占位降级/恢复），并为复制/分支等全文操作提供同步恢复。
 * TASK-0050 起同时承载游标分页窗口的编排：向上翻页、head 页延展与整窗重置。
 */

import type { ChatConversationItem } from "@shared/store/atoms";
import {
	activeSessionAtom,
	chatMessagesAtom,
	pendingMessageEditAtom,
	TRANSCRIPT_WINDOW_FIRST_INDEX,
	transcriptWindowStateAtom,
} from "@shared/store/atoms";
import type { HistoryEntry } from "@vetta/runtime-core";
import { getDefaultStore } from "jotai";
import { fullHistoryToChatWithSpans, type TranscriptItemSpan } from "./chat-service";
import { patchLiveItemWithCanonical } from "./live-history-patch";
import { reconcileOptimisticUserMessagesTail } from "./optimistic-user-message-cache";
import {
	applyTranscriptWindow,
	materializeTranscriptItem,
	mergeTranscriptHeadPage,
	prependTranscriptPage,
	readTranscriptBacklog,
	reconcileWindowedProjection,
	registerTranscriptBacklog,
	type TranscriptBacklog,
	type TranscriptViewportRange,
} from "./transcript-window";

function activeBacklog(): TranscriptBacklog | undefined {
	const sessionPath = getDefaultStore().get(activeSessionAtom)?.sessionPath;
	return sessionPath ? readTranscriptBacklog(sessionPath) : undefined;
}

/**
 * 全量历史 → chatMessages 的统一提交入口：注册 backlog 后由调用方写入 atom。
 * 恢复源必须与实际提交的 entries 同一份，span 才与 item.id 对齐。
 */
export function registerActiveTranscriptBacklog(sessionKey: string, backlog: TranscriptBacklog): void {
	registerTranscriptBacklog(sessionKey, backlog);
}

/** Virtuoso rangeChanged → 应用窗口。范围即渲染范围（已含 top:320/bottom:80 缓冲）。 */
export function noteTranscriptViewportRange(range: TranscriptViewportRange): void {
	const store = getDefaultStore();
	const backlog = activeBacklog();
	const editingEntryId = store.get(pendingMessageEditAtom)?.entryId;
	store.set(chatMessagesAtom, (previous) => {
		const applied = applyTranscriptWindow(previous, range, backlog, { editingEntryId });
		return applied?.items ?? previous;
	});
}

/**
 * 全文操作（复制/编辑/分支源）前同步恢复目标 item。
 * 返回恢复后的完整 item；目标不是占位或恢复失败时返回 undefined。
 */
export function ensureTranscriptItemRestored(itemId: string): ChatConversationItem | undefined {
	const store = getDefaultStore();
	const backlog = activeBacklog();
	let restored: ChatConversationItem | undefined;
	store.set(chatMessagesAtom, (previous) =>
		previous.map((item) => {
			if (item.id !== itemId || item.kind !== "placeholder") return item;
			const full = materializeTranscriptItem(item, backlog);
			if (full) restored = full;
			return full ?? item;
		}),
	);
	return restored;
}

// ── TASK-0050 游标分页窗口编排 ──────────────────────────────────────────
// 不变量：
// - backlog.entries 与 chatMessages 的 durable 段一一对应（同一 entries
//   投影出的 item.id 与 spans 对齐）；live-only 尾部（乐观/流式）不进 backlog。
// - firstItemIndex 在 messages 写入前更新，两 atom 同一同步块提交，
//   React 自动 batch 保证 Virtuoso 看到的是一致的一帧。
// - await 边界之后一律复核 activeSession 仍为该 sessionPath。

const windowOpsInFlight = new Set<string>();

function resetWindowState(sessionPath: string | null, hasMore: boolean): void {
	getDefaultStore().set(transcriptWindowStateAtom, {
		sessionPath,
		firstItemIndex: TRANSCRIPT_WINDOW_FIRST_INDEX,
		hasMore,
		loadingOlder: false,
	});
}

/** 会话切换/销毁时清空窗口态（backlog 本体由调用方按 sessionPath 注销）。 */
export function resetTranscriptWindowState(): void {
	resetWindowState(null, false);
}

/** 登记窗口化 backlog 并同步视图态（不改 chatMessages）。 */
export function commitTranscriptWindow(
	sessionPath: string,
	backlog: TranscriptBacklog,
	options?: { resetFirstIndex?: boolean },
): void {
	registerTranscriptBacklog(sessionPath, backlog);
	const store = getDefaultStore();
	if (options?.resetFirstIndex) {
		resetWindowState(sessionPath, backlog.hasMore === true);
		return;
	}
	store.set(transcriptWindowStateAtom, (prev) => ({
		sessionPath,
		firstItemIndex: prev.sessionPath === sessionPath ? prev.firstItemIndex : TRANSCRIPT_WINDOW_FIRST_INDEX,
		hasMore: backlog.hasMore === true,
		loadingOlder: false,
	}));
}

interface WindowedCommitInput {
	readonly sessionPath: string;
	readonly mediaSessionId: string;
	readonly entries: HistoryEntry[];
	readonly cursor: { nextBeforeEntry?: string; hasMore: boolean };
	readonly unbounded?: boolean;
	readonly patchCanonical?: (items: ChatConversationItem[]) => ChatConversationItem[];
}

/**
 * 「重投影 + reconcile」统一落库：对 optimistic 做尾对齐确认，按 durable
 * key 回收 live item，spans 重映射到结果 id，写 backlog 与 messages。
 * 返回 reconcile 结果（含 prependedCount 供调用方做滚动锚点补偿）。
 */
function commitWindowedProjection(input: WindowedCommitInput): { prependedCount: number } {
	const store = getDefaultStore();
	const projected = fullHistoryToChatWithSpans([...input.entries], input.mediaSessionId);
	// confirm 只回填字段不改序不插入，items[i] 与 projected.messages[i] 一一对应。
	const optimistic = reconcileOptimisticUserMessagesTail(input.mediaSessionId, projected.messages);
	const canonical = input.patchCanonical?.(optimistic.items) ?? optimistic.items;
	const live = store.get(chatMessagesAtom);
	const reconciled = reconcileWindowedProjection(live, canonical, {
		// confirmed 气泡已被 canonical 吸收、expired 已判死：两类都从 live 剔除，
		// 否则无 entryId 的旧气泡会以 live-only 尾部残留成重复消息。
		excludeLiveIds: new Set([...optimistic.confirmedIds, ...optimistic.expiredIds]),
		patchLiveItem: patchLiveItemWithCanonical,
	});
	const spans = new Map<string, TranscriptItemSpan>();
	for (let i = 0; i < reconciled.canonicalItemIndexes.length; i += 1) {
		const source = projected.messages[i];
		const target = reconciled.items[reconciled.canonicalItemIndexes[i]];
		const span = source ? projected.spans.get(source.id) : undefined;
		if (span && target) spans.set(target.id, span);
	}
	commitTranscriptWindow(input.sessionPath, {
		entries: input.entries,
		spans,
		mediaSessionId: input.mediaSessionId,
		nextBeforeEntry: input.cursor.nextBeforeEntry,
		hasMore: input.cursor.hasMore,
		unbounded: input.unbounded,
	});
	store.set(chatMessagesAtom, reconciled.items);
	return { prependedCount: reconciled.prependedCount };
}

/**
 * 向上翻一页（scroll-to-top 触发）。返回前插的 item 数，调用方据此前移
 * Virtuoso firstItemIndex；0 表示没有插入（到头/在途/无窗口）。
 */
export async function loadOlderTranscriptPage(): Promise<number> {
	const store = getDefaultStore();
	const session = store.get(activeSessionAtom);
	const sessionPath = session?.sessionPath;
	if (!session || !sessionPath) return 0;
	const backlog = readTranscriptBacklog(sessionPath);
	if (!backlog || backlog.unbounded || !backlog.hasMore || !backlog.nextBeforeEntry) return 0;
	if (windowOpsInFlight.has(sessionPath)) return 0;
	windowOpsInFlight.add(sessionPath);
	store.set(transcriptWindowStateAtom, (prev) => ({ ...prev, loadingOlder: true }));
	try {
		const page = await window.vetta.session.openViewer(sessionPath, {
			beforeEntry: backlog.nextBeforeEntry,
		});
		if (store.get(activeSessionAtom)?.sessionPath !== sessionPath) return 0;
		if ("stale" in page) {
			// 游标失效 = 历史被外部改写；按合同回退 head 页对账。
			await refreshTranscriptTail({ sessionPath });
			return 0;
		}
		const merged = prependTranscriptPage(backlog.entries, page);
		const { prependedCount } = commitWindowedProjection({
			sessionPath,
			mediaSessionId: backlog.mediaSessionId ?? session.runtimeId,
			entries: merged,
			cursor: { nextBeforeEntry: page.nextBeforeEntry, hasMore: page.hasMore },
		});
		if (prependedCount > 0) {
			store.set(transcriptWindowStateAtom, (prev) => ({
				...prev,
				sessionPath,
				firstItemIndex: prev.firstItemIndex - prependedCount,
			}));
		}
		return prependedCount;
	} finally {
		windowOpsInFlight.delete(sessionPath);
		getDefaultStore().set(transcriptWindowStateAtom, (prev) => ({ ...prev, loadingOlder: false }));
	}
}

export interface TranscriptTailRefreshOptions {
	/** 指定操作的 sessionPath；缺省取当前活跃会话。 */
	readonly sessionPath?: string;
	/** await 之后的提交闸（agent_end 的队列序守卫等）；返回 false 则整次刷新丢弃。 */
	readonly shouldCommit?: () => boolean;
	/** canonical 落库前的字段补丁（如 agent_end 的计时回填）。 */
	readonly patchCanonical?: (items: ChatConversationItem[]) => ChatConversationItem[];
}

/**
 * 用最新 head 页推进窗口末端：append-only 增量延展、改写整窗重置，
 * 已加载旧页不被清空。返回 false 表示该会话不在窗口化路径
 * （unbounded 全量或无 backlog），调用方回退旧的全量刷新。
 */
export async function refreshTranscriptTail(options?: TranscriptTailRefreshOptions): Promise<boolean> {
	const store = getDefaultStore();
	const session = store.get(activeSessionAtom);
	const sessionPath = options?.sessionPath ?? session?.sessionPath;
	if (!sessionPath || !session) return false;
	const backlog = readTranscriptBacklog(sessionPath);
	if (!backlog || backlog.unbounded) return false;
	const page = await window.vetta.session.openViewer(sessionPath, {});
	if (store.get(activeSessionAtom)?.sessionPath !== sessionPath) return true;
	if ("stale" in page) return true; // head 页不可能 stale；防御性短路。
	const merge = mergeTranscriptHeadPage(backlog.entries, page);
	if (merge.kind === "unchanged") return true;
	if (options?.shouldCommit && !options.shouldCommit()) return true;
	const entries = merge.entries;
	commitWindowedProjection({
		sessionPath,
		mediaSessionId: backlog.mediaSessionId ?? session.runtimeId,
		entries,
		cursor:
			merge.kind === "replaced"
				? { nextBeforeEntry: page.nextBeforeEntry, hasMore: page.hasMore }
				: { nextBeforeEntry: backlog.nextBeforeEntry, hasMore: backlog.hasMore === true },
		patchCanonical: options?.patchCanonical,
	});
	return true;
}

/**
 * 整窗重置为最新 head 页（编辑/重发/分支切换/手动压缩后的回载）：
 * 已加载旧页可能已被改写，按合同清空游标重来；live-only 尾部仍保留。
 * 返回 false 时该会话不在窗口化路径，调用方回退旧全量刷新。
 */
export async function resetTranscriptWindowToTail(sessionPath?: string): Promise<boolean> {
	const store = getDefaultStore();
	const session = store.get(activeSessionAtom);
	const path = sessionPath ?? session?.sessionPath;
	if (!path || !session) return false;
	const backlog = readTranscriptBacklog(path);
	if (backlog?.unbounded) return false;
	const page = await window.vetta.session.openViewer(path, {});
	if (store.get(activeSessionAtom)?.sessionPath !== path) return true;
	if ("stale" in page) return true;
	commitWindowedProjection({
		sessionPath: path,
		mediaSessionId: backlog?.mediaSessionId ?? session.runtimeId,
		entries: page.history,
		cursor: { nextBeforeEntry: page.nextBeforeEntry, hasMore: page.hasMore },
	});
	resetWindowState(path, page.hasMore);
	return true;
}

/** drain 的防御上限：每页一次 IPC 往返，500 页 ≈ 数万条 entry，远超实际会话规模。 */
const DRAIN_MAX_PAGES = 500;

/**
 * 全文操作（导出 HTML）前的窗口排空：沿游标把所有未加载旧页拉进窗口，
 * 再把视口占位逐条物化回完整消息。返回 false 表示无活跃会话或 backlog
 * 缺失——调用方按「现有什么导出什么」继续；unbounded 会话立即 true。
 */
export async function drainActiveTranscriptWindow(): Promise<boolean> {
	const store = getDefaultStore();
	const session = store.get(activeSessionAtom);
	const sessionPath = session?.sessionPath;
	if (!session || !sessionPath) return false;
	if (!readTranscriptBacklog(sessionPath)) return false;
	for (let i = 0; i < DRAIN_MAX_PAGES; i += 1) {
		const backlog = readTranscriptBacklog(sessionPath);
		if (!backlog || backlog.unbounded) return true;
		if (!backlog.hasMore || !backlog.nextBeforeEntry) break;
		const prepended = await loadOlderTranscriptPage();
		if (store.get(activeSessionAtom)?.sessionPath !== sessionPath) return false;
		// 0 = 到头/stale 已回退 head 对账/在途守卫——都无法再推进，就此打住。
		if (prepended === 0) break;
	}
	const backlog = readTranscriptBacklog(sessionPath);
	if (!backlog) return false;
	const live = store.get(chatMessagesAtom);
	let restored = 0;
	const next = live.map((item) => {
		if (item.kind !== "placeholder") return item;
		const full = materializeTranscriptItem(item, backlog);
		if (full) restored += 1;
		return full ?? item;
	});
	if (restored > 0) store.set(chatMessagesAtom, next);
	return true;
}
