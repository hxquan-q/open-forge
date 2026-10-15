// Copyright The Open Forge contributors.
import type { HistoryEntry } from "@vetta/runtime-core";
import type {
	HistoryPage,
	HistoryPageRequest,
	HistoryPageResult,
	ViewerHistoryUpdate,
} from "../../preload/api-types/session.js";
// 签名规则与 renderer 的 transcript-window 差分共用，单一事实源在 shared 侧。
import { historyEntrySignature } from "../../shared/history-entry-signature.js";

/**
 * transcript 窗口化第 2 步（TASK-0050）：有界历史页。
 *
 * 游标是服务端生成的不透明字符串，Renderer 原样回传。编码内容为
 * `end:<exclusiveIndex>:<sig>`：`end` 是「本页第一条之后」的下标，
 * `sig` 是该下标处条目的身份签名（entryId 或内容哈希）。append-only
 * 增长不改写既有下标处的条目，游标保持有效；分支切换、编辑、删除或
 * compaction 改写会让签名失配，返回 stale 而不是伪空页。
 */

export const HISTORY_PAGE_DEFAULT_LIMIT = 100;
export const HISTORY_PAGE_MAX_LIMIT = 200;
export const HISTORY_PAGE_MAX_TAIL_TURNS = 10;

/**
 * 把 IPC 传入的分页 options 收窄成 HistoryPageRequest。任一字段出现即进入
 * 分页模式；字段非法（非整数/越界/非对象）抛 TypeError，由 IPC 层按参数
 * 错误回传。
 */
export function parseHistoryPageRequest(options: unknown): HistoryPageRequest {
	if (!options || typeof options !== "object" || Array.isArray(options)) {
		throw new TypeError("options must be an object");
	}
	const { limit, beforeEntry, tailTurns } = options as {
		limit?: unknown;
		beforeEntry?: unknown;
		tailTurns?: unknown;
	};
	if (
		limit !== undefined &&
		(!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > HISTORY_PAGE_MAX_LIMIT)
	) {
		throw new TypeError(`options.limit must be an integer between 1 and ${HISTORY_PAGE_MAX_LIMIT}`);
	}
	if (beforeEntry !== undefined && typeof beforeEntry !== "string") {
		throw new TypeError("options.beforeEntry must be a string cursor returned by a previous page");
	}
	if (
		tailTurns !== undefined &&
		(!Number.isInteger(tailTurns) || (tailTurns as number) < 1 || (tailTurns as number) > HISTORY_PAGE_MAX_TAIL_TURNS)
	) {
		throw new TypeError(`options.tailTurns must be an integer between 1 and ${HISTORY_PAGE_MAX_TAIL_TURNS}`);
	}
	return {
		...(limit !== undefined ? { limit: limit as number } : {}),
		...(beforeEntry !== undefined ? { beforeEntry: beforeEntry as string } : {}),
		...(tailTurns !== undefined ? { tailTurns: tailTurns as number } : {}),
	};
}

// 既有调用方保留 re-export 路径。
export { historyEntrySignature };

function encodeCursor(endExclusive: number, boundary: HistoryEntry | undefined): string {
	const raw = `e:${endExclusive}:${historyEntrySignature(boundary)}`;
	return Buffer.from(raw, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { end: number; sig: string } | null {
	try {
		const raw = Buffer.from(cursor, "base64url").toString("utf8");
		const match = /^e:(\d+):(.+)$/.exec(raw);
		if (!match) return null;
		return { end: Number.parseInt(match[1]!, 10), sig: match[2]! };
	} catch {
		return null;
	}
}

function resolveLimit(limit: number | undefined): number {
	if (limit === undefined) return HISTORY_PAGE_DEFAULT_LIMIT;
	if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_PAGE_MAX_LIMIT) {
		throw new TypeError(`options.limit must be an integer between 1 and ${HISTORY_PAGE_MAX_LIMIT}`);
	}
	return limit;
}

function tailStartByTurns(history: readonly HistoryEntry[], tailTurns: number): number {
	let remainingTurns = tailTurns;
	for (let index = history.length - 1; index >= 0; index -= 1) {
		const entry = history[index];
		if (entry?.type !== "message" || entry.message.role !== "user") continue;
		remainingTurns -= 1;
		if (remainingTurns === 0) return index;
	}
	return 0;
}

/**
 * 从完整历史 projection 中裁出一页。Main 现阶段仍读全量再裁剪（任务
 * 明确允许的过渡形态），游标签名保证裁剪边界在改写时可检测。
 */
export function sliceHistoryPage(history: readonly HistoryEntry[]): HistoryPage;
export function sliceHistoryPage(history: readonly HistoryEntry[], request: HistoryPageRequest): HistoryPageResult;
export function sliceHistoryPage(
	history: readonly HistoryEntry[],
	request: HistoryPageRequest = {},
): HistoryPageResult {
	const limit = resolveLimit(request.limit);

	if (request.beforeEntry !== undefined) {
		const cursor = decodeCursor(request.beforeEntry);
		if (!cursor) return { stale: true };
		const boundary = history[cursor.end];
		if (cursor.end > history.length || historyEntrySignature(boundary) !== cursor.sig) {
			return { stale: true };
		}
		const start = Math.max(0, cursor.end - limit);
		const page = history.slice(start, cursor.end);
		return {
			history: [...page],
			nextBeforeEntry: start > 0 ? encodeCursor(start, history[start]) : undefined,
			hasMore: start > 0,
			head: false,
		};
	}

	const tailStart = request.tailTurns !== undefined ? tailStartByTurns(history, request.tailTurns) : 0;
	const end = history.length;
	const start = Math.max(tailStart, end - limit);
	const page = history.slice(start, end);
	return {
		history: [...page],
		nextBeforeEntry: start > 0 ? encodeCursor(start, history[start]) : undefined,
		hasMore: start > 0,
		head: true,
	};
}

// read-only viewer 订阅的增量载荷类型见 preload api-types/session.ts
// （ViewerHistoryUpdate）：JSONL 是 append-only 的，常规写入只增量下发
// 新增条目；非追加改写回有界最新页并标记 reset。

function isPrefix(prev: readonly HistoryEntry[], next: readonly HistoryEntry[]): boolean {
	if (next.length < prev.length) return false;
	for (let index = 0; index < prev.length; index += 1) {
		if (historyEntrySignature(next[index]) !== historyEntrySignature(prev[index])) return false;
	}
	return true;
}

/**
 * 比较订阅方上一轮已知历史与最新快照：
 * - prev 为空（首次推送）→ snapshot 全量；
 * - prev 是 next 的真前缀 → append 增量；
 * - 完全相等 → null（调用方跳过本次推送）；
 * - 其余 → reset + 有界尾页。
 */
export function diffViewerHistory(
	prev: readonly HistoryEntry[] | null,
	next: readonly HistoryEntry[],
): ViewerHistoryUpdate | null {
	// 无 beforeEntry 的尾页切片不可能 stale，由重载签名直接收窄为 HistoryPage。
	const reset = (): ViewerHistoryUpdate => ({ kind: "reset", page: sliceHistoryPage(next) });
	if (prev === null) return { kind: "snapshot", history: [...next] };
	if (next.length === prev.length) {
		return isPrefix(prev, next) ? null : reset();
	}
	if (isPrefix(prev, next)) {
		return { kind: "append", appended: next.slice(prev.length) };
	}
	return reset();
}
