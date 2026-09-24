// Copyright The Open Forge contributors.
import { classifyDiffLine } from "../../conversation/components/blocks/tool-views/shared/parse-diff";

/**
 * 把多文件 Unified Diff 按文件切开。解析与染色沿用既有 `parse-diff.ts`（本模块只分组，
 * 不重写解析），因此 Canvas 与聊天里的 diff 视图对同一份文本给出一致结论。
 */
export interface CanvasDiffFile {
	readonly path: string;
	readonly diff: string;
	readonly added: number;
	readonly removed: number;
}

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const PLUS_HEADER = /^\+\+\+ b\/(.+)$/;

export function groupCanvasDiffFiles(content: string): readonly CanvasDiffFile[] {
	const lines = content.split("\n");
	const groups: { path: string; lines: string[] }[] = [];
	let current: { path: string; lines: string[] } | undefined;

	for (const line of lines) {
		const fileHeader = FILE_HEADER.exec(line);
		if (fileHeader) {
			// `diff --git` 起新文件：a/ 与 b/ 路径相同时取规范化的 b 侧。
			current = { path: fileHeader[2] ?? fileHeader[1], lines: [line] };
			groups.push(current);
			continue;
		}
		if (!current) {
			// 没有 `diff --git` 头：先占位，等 `+++` 行回填路径（单文件 diff 的常见形态）。
			current = { path: "", lines: [] };
			groups.push(current);
		}
		const plusHeader = PLUS_HEADER.exec(line);
		if (plusHeader?.[1] && current.path === "") current.path = plusHeader[1];
		current.lines.push(line);
	}

	return groups
		.map((group) => ({
			path: group.path || "diff",
			diff: group.lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
			...countLines(group.lines),
		}))
		.filter((file) => file.diff.length > 0);
}

function countLines(lines: readonly string[]): { readonly added: number; readonly removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of lines) {
		const kind = classifyDiffLine(line);
		if (kind === "added") added += 1;
		if (kind === "removed") removed += 1;
	}
	return { added, removed };
}
