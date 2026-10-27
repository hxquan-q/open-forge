// Modified by The Open Forge contributors.

import { pathBasename } from "@shared/lib/utils";
import { chatMessagesAtom, inlineFilePreviewAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

/** 会改文件的写类工具（与 Canvas「任务变更」的口径一致，见 services/session-changes.ts）。 */
const CHANGE_TOOLS = new Set(["edit", "edit_file", "write", "write_to_file", "apply_patch", "artifact"]);
const PATH_KEYS = ["file_path", "path", "target_file", "filePath", "file"] as const;

interface TimelineToolBlockLike {
	readonly type?: string;
	readonly toolName?: string;
	readonly args?: Readonly<Record<string, unknown>>;
}

function readTimelineBlocks(item: unknown): readonly TimelineToolBlockLike[] {
	if (typeof item !== "object" || item === null) return [];
	const blocks = (item as { readonly blocks?: unknown }).blocks;
	if (!Array.isArray(blocks)) return [];
	return blocks.filter(
		(block): block is TimelineToolBlockLike =>
			typeof block === "object" && block !== null && typeof (block as { type?: unknown }).type === "string",
	);
}

function extractPath(args: Readonly<Record<string, unknown>> | undefined): string | null {
	for (const key of PATH_KEYS) {
		const value = args?.[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

/** 相对路径按项目根补全（Windows 下正斜杠 fs 亦可读）；绝对路径原样。 */
function toAbsolutePath(cwd: string, target: string): string {
	if (/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(target)) return target;
	return `${cwd.replace(/[\\/]+$/, "")}/${target}`;
}

/**
 * 时间线里最近一次写类工具调用的目标文件（含进行中的调用）；没有则 null。
 * 从末尾向前扫：最新消息、最新块优先。
 */
export function latestAiEditTarget(items: readonly unknown[]): string | null {
	for (let i = items.length - 1; i >= 0; i--) {
		const blocks = readTimelineBlocks(items[i]);
		for (let j = blocks.length - 1; j >= 0; j--) {
			const block = blocks[j];
			if (block.type !== "tool_call" || typeof block.toolName !== "string") continue;
			if (!CHANGE_TOOLS.has(block.toolName)) continue;
			const target = extractPath(block.args);
			if (target) return target;
		}
	}
	return null;
}

/**
 * 文件页签的「跟随 AI 编辑」：AI 正在/刚刚编辑哪个文件，就把内嵌预览切到哪个文件，
 * 用户在右栏能直观看到实际产出。每次目标变化写一次 inlineFilePreviewAtom；
 * 同一文件连续编辑不重复触发（预览内容随文件变化自动刷新）。
 */
export function useFollowAiFileEdits(cwd: string | undefined | null): void {
	const messages = useAtomValue(chatMessagesAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const lastFollowedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!cwd) return;
		const target = latestAiEditTarget(messages);
		if (!target) return;
		const absolute = toAbsolutePath(cwd, target);
		if (lastFollowedRef.current === absolute) return;
		lastFollowedRef.current = absolute;
		setPreview({ name: pathBasename(absolute), path: absolute });
	}, [cwd, messages, setPreview]);
}
