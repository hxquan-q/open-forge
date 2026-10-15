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

export interface RunningTurnDraftReconcile {
	readonly items: ChatTimelineItem[];
	/** 折叠发生时，live 投影的 targetMessageId 需要从草稿 id 迁移到 canonical id。 */
	readonly retarget?: { readonly from: string; readonly to: string };
}

function lastUserId(messages: readonly ChatTimelineItem[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.kind === "user") return message.id;
	}
	return undefined;
}

/**
 * 重开运行中会话时，canonical 历史与 live 草稿可能各自持有同一运行回合的
 * assistant 内容：历史里是已落盘的部分（entry id），live 是 restore 出来的
 * 流式草稿（draft id，内容不少于历史）。不折叠会在回填提交后出现两条相邻
 * 回复（TASK-0152 的「切出再切回分裂」）。
 *
 * 折叠规则：canonical 尾部是 agent、current 尾部是仍在流式的草稿、且两边
 * 最后的 user 消息一致（同一回合边界）时，以草稿内容为准、换用 canonical
 * 的 id/entryId，使既有 span/占位映射与下次重开的身份保持连续；否则原样
 * 返回，交由 preserveMessagesAddedAfterSnapshot 处理。
 */
export function reconcileRunningTurnDraft(
	canonical: readonly ChatTimelineItem[],
	current: readonly ChatTimelineItem[],
): RunningTurnDraftReconcile {
	const canonicalTail = canonical.at(-1);
	const currentTail = current.at(-1);
	if (
		canonicalTail?.kind !== "agent" ||
		currentTail?.kind !== "agent" ||
		currentTail.phase !== "streaming" ||
		currentTail.endedAt !== undefined ||
		currentTail.id === canonicalTail.id
	) {
		return { items: [...canonical] };
	}
	const canonicalLastUser = lastUserId(canonical);
	const currentLastUser = lastUserId(current);
	if (canonicalLastUser === undefined || canonicalLastUser !== currentLastUser) {
		return { items: [...canonical] };
	}
	const folded: ChatTimelineItem = {
		...currentTail,
		id: canonicalTail.id,
		entryId: canonicalTail.entryId ?? currentTail.entryId,
	};
	return {
		items: [...canonical.slice(0, -1), folded],
		retarget: { from: currentTail.id, to: canonicalTail.id },
	};
}
