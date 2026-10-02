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
	const canonicalIndexById = new Map(canonical.map((message, index) => [message.id, index]));
	// live-only user 项按因果位置归位（BUG-0068）：
	// (a) current 中有持久化后继 → 锚到其后继的 canonical 位置之前；
	// (b) 否则取最近持久化前驱，锚到 canonical 中其后第一个 user 项之前——
	//     该位置最可能是它的规范孪生槽；
	// (c) 都不满足（项晚于 canonical 尾部 / 无持久化邻居 / 非 user 项）
	//     → 维持尾部追加。
	const insertBefore = new Map<number, ChatTimelineItem[]>();
	const tailOnly: ChatTimelineItem[] = [];
	const nextCanonicalUserIndex = (from: number): number => {
		for (let k = from + 1; k < canonical.length; k += 1) {
			if (canonical[k].kind === "user") return k;
		}
		return -1;
	};
	for (let i = 0; i < current.length; i += 1) {
		const item = current[i];
		if (persistedIds.has(item.id)) continue;
		if (item.kind !== "user") {
			tailOnly.push(item);
			continue;
		}
		let anchor = -1;
		for (let j = i + 1; j < current.length; j += 1) {
			const index = canonicalIndexById.get(current[j].id);
			if (index !== undefined) {
				anchor = index;
				break;
			}
		}
		if (anchor < 0) {
			let predecessor = -1;
			for (let j = i - 1; j >= 0; j -= 1) {
				const index = canonicalIndexById.get(current[j].id);
				if (index !== undefined) {
					predecessor = index;
					break;
				}
			}
			if (predecessor >= 0) anchor = nextCanonicalUserIndex(predecessor);
		}
		if (anchor >= 0) {
			const group = insertBefore.get(anchor) ?? [];
			group.push(item);
			insertBefore.set(anchor, group);
			continue;
		}
		tailOnly.push(item);
	}
	const merged: ChatTimelineItem[] = [];
	for (let i = 0; i < canonical.length; i += 1) {
		const beforeGroup = insertBefore.get(i);
		if (beforeGroup) merged.push(...beforeGroup);
		merged.push(canonical[i]);
	}
	merged.push(...tailOnly);
	return merged;
}
