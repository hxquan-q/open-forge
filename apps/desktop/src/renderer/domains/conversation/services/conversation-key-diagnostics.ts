// Copyright The Open Forge contributors.
import { conversationItemRenderKey } from "@shared/conversation";
import type { ChatTimelineItem } from "@shared/store/atoms";

/**
 * 消息列表重复渲染 key 的结构化诊断（BUG-0123）。
 *
 * 列表项身份来自 `conversationItemRenderKey`（`renderKey ?? entryId ?? id`）。重复必然来自
 * 「多个来源合并进同一个列表数组」——持久层对同一文件内的重复事件 id 有硬校验。React 自带的
 * 重复 key 告警只有一句通用文案，无法指明是哪一层合并产生的；这里补上键、次数与每项的
 * 身份字段和数组下标，用来一次钉死来源。
 *
 * 只读诊断，不改变渲染行为；只记身份字段，不记消息正文。
 */
export interface ConversationKeyIdentity {
	/** 在传入列表中的下标；两个重复项的下标是定位「哪一层合并」的关键。 */
	readonly index: number;
	readonly kind: string;
	readonly id: string;
	readonly entryId?: string;
	readonly renderKey?: string;
	readonly role?: string;
}

export interface DuplicateConversationKey {
	readonly key: string;
	readonly count: number;
	readonly items: readonly ConversationKeyIdentity[];
}

/** 返回所有出现多于一次的渲染键，按首次出现顺序排列。 */
export function findDuplicateConversationKeys(items: readonly ChatTimelineItem[]): DuplicateConversationKey[] {
	const byKey = new Map<string, ConversationKeyIdentity[]>();
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		const key = conversationItemRenderKey(item);
		const identity = identityOf(item, index);
		const bucket = byKey.get(key);
		if (bucket) bucket.push(identity);
		else byKey.set(key, [identity]);
	}
	const duplicates: DuplicateConversationKey[] = [];
	for (const [key, bucket] of byKey) {
		if (bucket.length > 1) duplicates.push({ key, count: bucket.length, items: bucket });
	}
	return duplicates;
}

/** 仅在发现重复时发出一次结构化告警；列表健康时零输出。 */
export function reportDuplicateConversationKeys(sessionId: string | null, items: readonly ChatTimelineItem[]): void {
	const duplicates = findDuplicateConversationKeys(items);
	if (duplicates.length === 0) return;
	console.warn("[conversation-keys] duplicate render keys", {
		sessionId,
		total: items.length,
		duplicates,
	});
}

function identityOf(item: ChatTimelineItem, index: number): ConversationKeyIdentity {
	const role = "role" in item ? item.role : undefined;
	return {
		index,
		kind: item.kind,
		id: item.id,
		...(item.entryId ? { entryId: item.entryId } : {}),
		...(item.renderKey ? { renderKey: item.renderKey } : {}),
		...(typeof role === "string" ? { role } : {}),
	};
}
