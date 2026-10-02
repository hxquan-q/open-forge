import type { ChatTimelineItem } from "@shared/store/atoms";
import { mergeWithCausalAnchors } from "./pending-user-anchor";

/**
 * Reconcile two independently mapped views of the same persisted history.
 *
 * Viewer preview and Runtime hydration intentionally use separate I/O paths, so
 * they cannot share object identity on their own.  This hydration-boundary
 * comparison preserves the preview objects for messages whose serialized
 * contract is unchanged. React.memo can then retain already-painted rows while
 * still replacing any message that Runtime canonicalization actually changed.
 *
 * ChatTimelineItem is a JSON-compatible renderer DTO（占位项同样不含函数/循环引用）。
 * Keep this comparison out of render paths: it is only meant for the one-off
 * preview -> canonical handoff.
 */
export function shareChatMessageSnapshot<T extends ChatTimelineItem>(
	preview: readonly T[],
	canonical: readonly T[],
): { messages: T[]; reusedCount: number } {
	if (preview === canonical) {
		return { messages: preview as T[], reusedCount: preview.length };
	}
	if (preview.length === 0 || canonical.length === 0) {
		return { messages: canonical as T[], reusedCount: 0 };
	}

	const previewById = new Map(preview.map((message) => [message.id, message]));
	let reusedCount = 0;
	const messages = canonical.map((message) => {
		const candidate = previewById.get(message.id);
		if (candidate === undefined || JSON.stringify(candidate) !== JSON.stringify(message)) {
			return message;
		}
		reusedCount += 1;
		return candidate;
	});

	if (
		reusedCount === preview.length &&
		reusedCount === canonical.length &&
		messages.every((message, index) => message === preview[index])
	) {
		return { messages: preview as T[], reusedCount };
	}
	return { messages, reusedCount };
}

/**
 * Keeps renderer-only rows accepted after a Viewer snapshot was committed while
 * replacing that persisted base with Runtime-canonical history.
 *
 * Live-only user 项按因果位置归位：夹在持久化项之间的乐观/镜像用户
 * 气泡必须留在它触发的回复之前——平铺到末尾会产生「用户消息显示在
 * 回复之后」的错序（BUG-0068）。没有可锚定位置的项维持尾部追加。
 */
export function preserveMessagesAddedAfterSnapshot(
	_preview: readonly ChatTimelineItem[],
	canonical: readonly ChatTimelineItem[],
	current: readonly ChatTimelineItem[],
): ChatTimelineItem[] {
	const persistedIds = new Set(canonical.map((message) => message.id));
	if (current.every((message) => persistedIds.has(message.id))) {
		return canonical as ChatTimelineItem[];
	}
	// live-only user 项按因果位置归位（BUG-0068），管线收编进共享助手；
	// 既非 pending 也未落在 canonical 的项由助手丢弃（= current 中已被
	// canonical 覆盖的项之外不存在此形态，防御性兜底）。
	const canonicalIndexById = new Map(canonical.map((message, index) => [message.id, index]));
	return mergeWithCausalAnchors({
		base: canonical as ChatTimelineItem[],
		order: current,
		isPendingIndex: (i) => !persistedIds.has(current[i].id),
		landedBaseIndex: (i) => canonicalIndexById.get(current[i].id),
	}).items;
}
