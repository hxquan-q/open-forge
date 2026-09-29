// Copyright The Open Forge contributors.
import type { HistoryEntry } from "@vetta/runtime-core";

/**
 * HistoryEntry 的稳定身份签名（TASK-0050）：`entryId` 优先，缺失时退回
 * 条目内容的 FNV-1a 哈希。游标校验与窗口差分共用同一规则——main 的
 * `conversations/session-history-page.ts` 与 renderer 的
 * `transcript-window.ts` 都从这里取，保证两侧对「同一 entry」的判定一致。
 */
export function historyEntrySignature(entry: HistoryEntry | undefined): string {
	if (!entry) return "∅";
	const withId = entry as { entryId?: string };
	if (typeof withId.entryId === "string" && withId.entryId.length > 0) {
		return `id:${withId.entryId}`;
	}
	// timing/marker 类条目没有 entryId，用内容哈希锚定；同一历史源内
	// JSON 形状稳定，改写任一字节都会失配。
	let hash = 0x811c9dc5;
	const text = JSON.stringify(entry);
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `h:${hash.toString(36)}`;
}
