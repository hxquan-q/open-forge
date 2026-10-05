import type { ConversationUserMessageViewModel } from "@shared/conversation";
import type { ChatConversationItem, ChatTimelineItem } from "@shared/store/atoms";

interface PendingOptimisticUserMessage {
	message: ConversationUserMessageViewModel;
	precedingUserCount: number;
	/**
	 * 队列镜像补的气泡只有 displayText，没有规范消息才有的 attachments /
	 * promptRef 元数据；这类气泡只按文本 + 序号吸收（ADR-0060）。
	 */
	matchTextOnly?: boolean;
	/** 已经历多少次"规范历史已到达该序号却仍未确认"的对账。 */
	unresolvedReconciles?: number;
}

/**
 * 对不上账的乐观气泡最多再撑过这么多次对账。
 * 正常气泡在消息落盘后的第一次全量历史回流就会被确认；撑不过这个上限的，
 * 说明它根本不会出现在规范历史里（例如队列镜像补出的内部消息），继续留着
 * 只会每次对账都被重新追加到列表末尾，形成永久残留且位置错乱。
 */
const MAX_UNRESOLVED_RECONCILES = 3;

const pendingByRuntimeId = new Map<string, PendingOptimisticUserMessage[]>();

/**
 * Keep a user bubble until the canonical history confirms the corresponding
 * user-message ordinal. Session switching clears the active message atom, so
 * this cache bridges the short window between optimistic rendering and the
 * runtime persisting the turn-start events.
 */
export function rememberOptimisticUserMessage(
	runtimeId: string,
	message: ConversationUserMessageViewModel,
	currentMessages: readonly ChatTimelineItem[],
	options?: { matchTextOnly?: boolean },
): void {
	const pending = pendingByRuntimeId.get(runtimeId) ?? [];
	pendingByRuntimeId.set(runtimeId, [
		...pending,
		{
			message,
			precedingUserCount: currentMessages.filter((item) => item.kind === "user").length,
			...(options?.matchTextOnly ? { matchTextOnly: true } : {}),
		},
	]);
}

/**
 * Reconcile a freshly loaded canonical history with optimistic user bubbles.
 * Text is checked at the recorded ordinal so an identical older prompt cannot
 * accidentally acknowledge a newer pending send.
 */
export function reconcileOptimisticUserMessages<T extends ChatConversationItem>(
	runtimeId: string,
	history: readonly T[],
): (T | ConversationUserMessageViewModel)[] {
	const pending = pendingByRuntimeId.get(runtimeId);
	if (!pending?.length) return [...history];

	const canonicalUsers = history.filter(
		(message): message is T & ConversationUserMessageViewModel => message.kind === "user",
	);
	const confirmedSnapshots = new Map<
		ConversationUserMessageViewModel,
		ConversationUserMessageViewModel["inputSegments"]
	>();
	const unresolved: PendingOptimisticUserMessage[] = [];
	for (const entry of pending) {
		const canonical = canonicalUsers[entry.precedingUserCount];
		// 规范历史还没写到这个序号：本轮消息仍在落盘途中，无条件保留。
		if (!canonical) {
			unresolved.push(entry);
			continue;
		}
		const confirmed = entry.matchTextOnly
			? sameUserText(canonical.text, entry.message.text)
			: sameUserMessage(canonical, entry.message);
		if (confirmed) {
			if (!entry.matchTextOnly && entry.message.inputSegments) {
				confirmedSnapshots.set(canonical, entry.message.inputSegments);
			}
			continue;
		}
		const attempts = (entry.unresolvedReconciles ?? 0) + 1;
		if (attempts > MAX_UNRESOLVED_RECONCILES) continue;
		unresolved.push({ ...entry, unresolvedReconciles: attempts });
	}

	if (unresolved.length === 0) {
		pendingByRuntimeId.delete(runtimeId);
		return applyConfirmedInputSnapshots(history, confirmedSnapshots);
	}
	pendingByRuntimeId.set(runtimeId, unresolved);

	const historyIds = new Set(history.map((message) => message.id));
	return insertUnresolvedOptimisticMessages(
		applyConfirmedInputSnapshots(history, confirmedSnapshots),
		unresolved,
		historyIds,
	);
}

function insertUnresolvedOptimisticMessages<T extends ChatConversationItem>(
	history: readonly T[],
	unresolved: readonly PendingOptimisticUserMessage[],
	historyIds: ReadonlySet<string>,
): (T | ConversationUserMessageViewModel)[] {
	const canonicalUserCount = history.filter((message) => message.kind === "user").length;
	const byPrecedingUserCount = new Map<number, ConversationUserMessageViewModel[]>();
	const tailFallback: ConversationUserMessageViewModel[] = [];
	for (const { message, precedingUserCount } of unresolved) {
		if (historyIds.has(message.id)) continue;
		// 序号还没被规范历史写到（precedingUserCount > canonicalUserCount）的
		// 气泡，其真实前驱在缺失条目之后，保持尾部兜底；序号被更早落盘的
		// 发送占用（队列消费场景）的气泡按发送序号落位——追加到尾部会
		// 把它挪到它触发的回复之后（BUG-0068）。
		if (precedingUserCount > canonicalUserCount) {
			tailFallback.push(message);
			continue;
		}
		const messages = byPrecedingUserCount.get(precedingUserCount) ?? [];
		messages.push(message);
		byPrecedingUserCount.set(precedingUserCount, messages);
	}

	const result: (T | ConversationUserMessageViewModel)[] = [];
	const appendAtUserOrdinal = (ordinal: number): void => {
		const messages = byPrecedingUserCount.get(ordinal);
		if (messages) result.push(...messages);
	};
	appendAtUserOrdinal(0);
	let userCount = 0;
	for (const message of history) {
		result.push(message);
		if (message.kind !== "user") continue;
		userCount += 1;
		appendAtUserOrdinal(userCount);
	}
	result.push(...tailFallback);
	return result;
}

export interface TailOptimisticReconcile<T extends ChatConversationItem> {
	/** 已回填 confirmed inputSegments 的 canonical 序列（不插入未决气泡）。 */
	readonly items: (T | ConversationUserMessageViewModel)[];
	/** 已被 canonical 吸收的乐观气泡 id：调用方从 live 列表剔除旧气泡对象。 */
	readonly confirmedIds: ReadonlySet<string>;
	/** 超过最大对账次数、应从 live 列表移除的乐观气泡 id。 */
	readonly expiredIds: ReadonlySet<string>;
}

/**
 * 窗口化 tail reconcile（TASK-0050）：canonical 只是历史的尾部一页，
 * `precedingUserCount` 的全局序号基线不可得——改为尾部对齐：第 i 个未决
 * 乐观气泡应对位 canonical 倒数第 (P - i) 个 user 消息。落盘未完成时
 * 序号对应到更早的 user 上，文本不匹配 → 维持未决，与原语义一致。
 * 未决气泡由调用方的窗口 reconcile 作为 live-only 尾部项保留，不在这里
 * 插回 canonical——序列顺序只由历史决定。
 */
export function reconcileOptimisticUserMessagesTail<T extends ChatConversationItem>(
	runtimeId: string,
	history: readonly T[],
): TailOptimisticReconcile<T> {
	const pending = pendingByRuntimeId.get(runtimeId);
	if (!pending?.length) return { items: [...history], confirmedIds: new Set(), expiredIds: new Set() };

	const canonicalUsers = history.filter(
		(message): message is T & ConversationUserMessageViewModel => message.kind === "user",
	);
	const confirmedSnapshots = new Map<
		ConversationUserMessageViewModel,
		ConversationUserMessageViewModel["inputSegments"]
	>();
	const expiredIds = new Set<string>();
	const confirmedIds = new Set<string>();
	const unresolved: PendingOptimisticUserMessage[] = [];
	for (let i = 0; i < pending.length; i += 1) {
		const entry = pending[i];
		const canonical = canonicalUsers[canonicalUsers.length - pending.length + i];
		if (!canonical) {
			unresolved.push(entry);
			continue;
		}
		const confirmed = entry.matchTextOnly
			? sameUserText(canonical.text, entry.message.text)
			: sameUserMessage(canonical, entry.message);
		if (confirmed) {
			confirmedIds.add(entry.message.id);
			if (!entry.matchTextOnly && entry.message.inputSegments) {
				confirmedSnapshots.set(canonical, entry.message.inputSegments);
			}
			continue;
		}
		const attempts = (entry.unresolvedReconciles ?? 0) + 1;
		if (attempts > MAX_UNRESOLVED_RECONCILES) {
			expiredIds.add(entry.message.id);
			continue;
		}
		unresolved.push({ ...entry, unresolvedReconciles: attempts });
	}

	if (unresolved.length === 0) pendingByRuntimeId.delete(runtimeId);
	else pendingByRuntimeId.set(runtimeId, unresolved);
	return { items: applyConfirmedInputSnapshots(history, confirmedSnapshots), confirmedIds, expiredIds };
}

function applyConfirmedInputSnapshots<T extends ChatTimelineItem>(
	history: readonly T[],
	snapshots: ReadonlyMap<ConversationUserMessageViewModel, ConversationUserMessageViewModel["inputSegments"]>,
): (T | ConversationUserMessageViewModel)[] {
	if (snapshots.size === 0) return [...history];
	return history.map((message): T | ConversationUserMessageViewModel => {
		if (message.kind !== "user") return message;
		const inputSegments = snapshots.get(message as ConversationUserMessageViewModel);
		return inputSegments ? { ...message, inputSegments } : message;
	});
}

export function clearOptimisticUserMessages(runtimeId?: string): void {
	if (runtimeId) {
		pendingByRuntimeId.delete(runtimeId);
		return;
	}
	pendingByRuntimeId.clear();
}

function sameUserMessage(
	canonical: ConversationUserMessageViewModel,
	optimistic: ConversationUserMessageViewModel,
): boolean {
	return (
		sameUserText(canonical.text, optimistic.text) &&
		canonical.settingsAssistTabId === optimistic.settingsAssistTabId &&
		samePromptRef(canonical.promptRef, optimistic.promptRef) &&
		sameAttachments(canonical.attachments, optimistic.attachments)
	);
}

/**
 * 规范文本与气泡文本的吸收判等：附件-only 消息落盘为占位句是已知漂移。
 * 乐观对账与因果锚定（pending-user-anchor 的孪生槽校验）共用同一语义，
 * 避免两层各写一份判等造成吸收与锚定结论漂移。
 */
export function sameUserText(canonical: string, optimistic: string): boolean {
	return canonical === optimistic || (optimistic === "" && canonical === "(see attached content)");
}

function samePromptRef(
	a: ConversationUserMessageViewModel["promptRef"],
	b: ConversationUserMessageViewModel["promptRef"],
): boolean {
	if (!a || !b) return a === b;
	return a.kind === b.kind && a.name === b.name;
}

function sameAttachments(
	a: ConversationUserMessageViewModel["attachments"],
	b: ConversationUserMessageViewModel["attachments"],
): boolean {
	const left = a ?? [];
	const right = b ?? [];
	return (
		left.length === right.length &&
		left.every((item, index) => item.kind === right[index]?.kind && item.path === right[index]?.path)
	);
}
