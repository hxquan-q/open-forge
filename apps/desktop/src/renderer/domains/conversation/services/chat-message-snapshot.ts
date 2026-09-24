import type { ChatTimelineItem } from "@shared/store/atoms";

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
 */
export function preserveMessagesAddedAfterSnapshot(
	_preview: readonly ChatTimelineItem[],
	canonical: readonly ChatTimelineItem[],
	current: readonly ChatTimelineItem[],
): ChatTimelineItem[] {
	const persistedIds = new Set(canonical.map((message) => message.id));
	const additions = current.filter((message) => !persistedIds.has(message.id));
	return additions.length === 0 ? (canonical as ChatTimelineItem[]) : [...canonical, ...additions];
}
