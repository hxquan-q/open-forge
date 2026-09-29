// Copyright The Open Forge contributors.

import type { ViewerHistoryUpdate } from "@preload/api-types/session";
import type { HistoryEntry } from "@vetta/runtime-core";

/**
 * 应用一条 viewer 增量载荷到本地保留的 raw entries（TASK-0050）。
 * `fullHistoryToChat` 的 marker/toolCall 归并是跨条目的，不能只对增量
 * 片段做映射——所以这里只维护 raw 数组，映射仍由调用方整体执行。
 */
export function applyViewerHistoryUpdate(entries: HistoryEntry[], update: ViewerHistoryUpdate): HistoryEntry[] {
	switch (update.kind) {
		case "snapshot":
			return update.history;
		case "append":
			return [...entries, ...update.appended];
		case "reset":
			return update.page.history;
		default:
			return entries;
	}
}
