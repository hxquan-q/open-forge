// Modified by The Open Forge contributors.

import { REVIEW_DIFF_MAX_BYTES } from "@vetta/runtime-storage/conversation";
import * as Diff from "diff";

/**
 * 展示用上下文 diff：行首 `+`/`-`/` ` 前缀 + 行号，未变化区域折叠为 ` ...`。
 * 从 edit/edit-text.ts 上移到 shared，供 Edit 与 Write 的审查统计共用；
 * 行号展示格式是既有 UI 合同，改动必须同步 renderer 的 parse-diff 分类口径。
 */
export function generateDiffString(
	oldContent: string,
	newContent: string,
	contextLines = 4,
): { readonly diff: string; readonly firstChangedLine: number | undefined } {
	const parts = Diff.diffLines(oldContent, newContent);
	const output: string[] = [];
	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");
	const lineNumberWidth = String(Math.max(oldLines.length, newLines.length)).length;
	let oldLineNumber = 1;
	let newLineNumber = 1;
	let lastWasChange = false;
	let firstChangedLine: number | undefined;

	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		const raw = part.value.split("\n");
		if (raw.at(-1) === "") raw.pop();

		if (part.added || part.removed) {
			firstChangedLine ??= newLineNumber;
			for (const line of raw) {
				if (part.added) {
					output.push(`+${String(newLineNumber).padStart(lineNumberWidth, " ")} ${line}`);
					newLineNumber++;
				} else {
					output.push(`-${String(oldLineNumber).padStart(lineNumberWidth, " ")} ${line}`);
					oldLineNumber++;
				}
			}
			lastWasChange = true;
			continue;
		}

		const nextPart = parts[index + 1];
		const nextPartIsChange = nextPart !== undefined && (nextPart.added === true || nextPart.removed === true);
		if (!lastWasChange && !nextPartIsChange) {
			oldLineNumber += raw.length;
			newLineNumber += raw.length;
			lastWasChange = false;
			continue;
		}

		let linesToShow = raw;
		let skipStart = 0;
		let skipEnd = 0;
		if (!lastWasChange) {
			skipStart = Math.max(0, raw.length - contextLines);
			linesToShow = raw.slice(skipStart);
		}
		if (!nextPartIsChange && linesToShow.length > contextLines) {
			skipEnd = linesToShow.length - contextLines;
			linesToShow = linesToShow.slice(0, contextLines);
		}
		if (skipStart > 0) {
			output.push(` ${"".padStart(lineNumberWidth, " ")} ...`);
			oldLineNumber += skipStart;
			newLineNumber += skipStart;
		}
		for (const line of linesToShow) {
			output.push(` ${String(oldLineNumber).padStart(lineNumberWidth, " ")} ${line}`);
			oldLineNumber++;
			newLineNumber++;
		}
		if (skipEnd > 0) {
			output.push(` ${"".padStart(lineNumberWidth, " ")} ...`);
			oldLineNumber += skipEnd;
			newLineNumber += skipEnd;
		}
		lastWasChange = false;
	}

	return { diff: output.join("\n"), firstChangedLine };
}

/**
 * 增删行统计。此格式中变更行一定全部出现（折叠只作用于上下文），
 * 所以前缀行计数等于真实增删行数，与 renderer `parseDiff` 的统计口径一致。
 */
export function countDiffRows(diff: string): { readonly addedLines: number; readonly removedLines: number } {
	let addedLines = 0;
	let removedLines = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) addedLines += 1;
		else if (line.startsWith("-") && !line.startsWith("---")) removedLines += 1;
	}
	return { addedLines, removedLines };
}

/** diff 预览的界值判定：二进制或超界时调用方必须跳过 diff 与行统计。 */
export interface ReviewPreviewBounds {
	readonly binary: boolean;
	readonly truncated: boolean;
}

export function reviewPreviewBounds(beforeText: string, afterText: string): ReviewPreviewBounds {
	if (beforeText.includes("\0") || afterText.includes("\0")) {
		return { binary: true, truncated: false };
	}
	if (
		Buffer.byteLength(beforeText, "utf8") > REVIEW_DIFF_MAX_BYTES ||
		Buffer.byteLength(afterText, "utf8") > REVIEW_DIFF_MAX_BYTES
	) {
		return { binary: false, truncated: true };
	}
	return { binary: false, truncated: false };
}
