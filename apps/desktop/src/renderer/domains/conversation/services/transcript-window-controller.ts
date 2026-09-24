// Modified by The Open Forge contributors.
/**
 * transcript-window 的 atom 编排层：把 Virtuoso 上报的活动窗口范围应用到
 * chatMessagesAtom（占位降级/恢复），并为复制/分支等全文操作提供同步恢复。
 */
import type { ChatConversationItem } from "@shared/store/atoms";
import { activeSessionAtom, chatMessagesAtom, pendingMessageEditAtom } from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import {
	applyTranscriptWindow,
	materializeTranscriptItem,
	readTranscriptBacklog,
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
