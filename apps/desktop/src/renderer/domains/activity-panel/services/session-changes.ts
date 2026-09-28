// Copyright The Open Forge contributors.
import { parseDiff } from "../../conversation/components/blocks/tool-views/shared/parse-diff";

/**
 * Canvas「任务变更」的数据聚合：把当前会话里带 diff 的工具结果按文件收敛成累计视图。
 *
 * 只读投影：输入是消息时间线，输出是纯数据，不写会话事实、不改文件、不建第二套存储。
 * 同一文件被改多次时只保留最新一次差异（每次 diff 都相对当时内容，最后一次即累计结果），
 * 并用 `changes` 标注被改过几次；不做 hunk 合并。
 */
export type SessionChangeStatus = "added" | "modified" | "deleted";

export interface SessionChangeToolCall {
	readonly toolName: string;
	readonly args: Readonly<Record<string, unknown>>;
	readonly diff?: string;
}

export interface SessionChangeFile {
	readonly path: string;
	readonly diff: string;
	readonly status: SessionChangeStatus;
	readonly added: number;
	readonly removed: number;
	/** 同一文件在会话里被改过几次。 */
	readonly changes: number;
}

export interface SessionChangeOverview {
	readonly files: readonly SessionChangeFile[];
	readonly added: number;
	readonly removed: number;
}

const CHANGE_TOOLS = new Set(["edit", "edit_file", "write", "write_to_file", "apply_patch", "artifact"]);
const PATH_KEYS = ["file_path", "path", "target_file", "filePath", "file"] as const;

/** 结构化的时间线条目：只依赖块数组，避免把聚合绑死在具体 ViewModel 上。 */
export interface SessionTimelineBlockLike {
	readonly type?: string;
	readonly toolName?: string;
	readonly args?: Readonly<Record<string, unknown>>;
	readonly uiDetails?: { readonly diff?: string };
}

/**
 * 输入放宽到 `unknown[]`：时间线是联合类型（用户消息与占位项都没有 `blocks`），
 * 收窄放在这里做，调用方不需要为了类型对齐而断言。
 */
export function sessionChangeCallsFromTimeline(items: readonly unknown[]): readonly SessionChangeToolCall[] {
	const calls: SessionChangeToolCall[] = [];
	for (const item of items) {
		for (const block of readTimelineBlocks(item)) {
			if (block.type !== "tool_call" || typeof block.toolName !== "string") continue;
			if (!CHANGE_TOOLS.has(block.toolName)) continue;
			const diff = block.uiDetails?.diff;
			if (typeof diff !== "string" || diff.trim() === "") continue;
			calls.push({ toolName: block.toolName, args: block.args ?? {}, diff });
		}
	}
	return calls;
}

function readTimelineBlocks(item: unknown): readonly SessionTimelineBlockLike[] {
	if (typeof item !== "object" || item === null) return [];
	const blocks = (item as { readonly blocks?: unknown }).blocks;
	if (!Array.isArray(blocks)) return [];
	return blocks.filter(isTimelineBlockLike);
}

function isTimelineBlockLike(value: unknown): value is SessionTimelineBlockLike {
	return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function collectSessionChanges(calls: readonly SessionChangeToolCall[]): SessionChangeOverview {
	const byPath = new Map<string, SessionChangeFile>();
	let added = 0;
	let removed = 0;

	for (const call of calls) {
		const diff = call.diff;
		if (typeof diff !== "string" || diff.trim() === "") continue;
		const path = changePath(call);
		// 缺少可识别路径的变更无法归入任何文件，静默跳过而不是伪造一个文件名。
		if (!path) continue;
		const { stats } = parseDiff(diff);
		added += stats.added;
		removed += stats.removed;
		const previous = byPath.get(path);
		byPath.set(path, {
			path,
			diff,
			status: changeStatus(diff),
			added: stats.added,
			removed: stats.removed,
			changes: (previous?.changes ?? 0) + 1,
		});
	}

	return { files: [...byPath.values()], added, removed };
}

function changePath(call: SessionChangeToolCall): string | undefined {
	for (const key of PATH_KEYS) {
		const value = call.args[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

/** 新建文件的标准头是 `--- /dev/null`，删除则是 `+++ /dev/null`。 */
function changeStatus(diff: string): SessionChangeStatus {
	if (/^--- \/dev\/null$/m.test(diff)) return "added";
	if (/^\+\+\+ \/dev\/null$/m.test(diff)) return "deleted";
	return "modified";
}
