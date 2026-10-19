// Copyright The Open Forge contributors.
import type { ConversationDocumentEntry } from "./document.js";

/**
 * 会话文档条目的只读查找索引。
 *
 * 消除命令/选择路径上随条目数线性增长的重复扫描：`byId` 服务于存在性守卫、
 * 条目查找与父链行走；`childrenByParent` 服务于子节点遍历。数组与内部结构
 * 均为只读，调用方不得原地变更。
 */
export interface ConversationDocumentEntriesIndex {
	readonly byId: ReadonlyMap<string, ConversationDocumentEntry>;
	/** 键为 parentId（根条目为 null）；值按条目出现顺序排列。 */
	readonly childrenByParent: ReadonlyMap<string | null, readonly ConversationDocumentEntry[]>;
}

const indexes = new WeakMap<readonly ConversationDocumentEntry[], ConversationDocumentEntriesIndex>();

/**
 * 按条目数组的对象身份记忆化的索引。
 *
 * 不改变条目列表的命令（如 `session.name.set`、`active_leaf.set`、
 * `branch.select`）返回 `{...document}` 时复用同一 entries 数组引用，这些修订
 * 间的重复查询共享一次索引构建；条目变更类命令创建新数组，自动按新数组重建。
 * 正确性依赖「条目数组不原地变更」的文档只读不变量。
 */
export function conversationDocumentEntriesIndex(
	entries: readonly ConversationDocumentEntry[],
): ConversationDocumentEntriesIndex {
	const cached = indexes.get(entries);
	if (cached) return cached;
	const byId = new Map<string, ConversationDocumentEntry>();
	const childrenByParent = new Map<string | null, ConversationDocumentEntry[]>();
	for (const entry of entries) {
		byId.set(entry.id, entry);
		const siblings = childrenByParent.get(entry.parentId);
		if (siblings) {
			siblings.push(entry);
		} else {
			childrenByParent.set(entry.parentId, [entry]);
		}
	}
	const index: ConversationDocumentEntriesIndex = { byId, childrenByParent };
	indexes.set(entries, index);
	return index;
}
