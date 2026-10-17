// Copyright The Open Forge contributors.
/**
 * `data-vetd-source` 值的跨代解析（TASK-0315）：
 * - v1 `frames/x.tsx:42`（仅行号——旧引擎实例落的历史快照、升级前的缓存）；
 * - v2 `frames/x.tsx:42:9`（文件:行:列，列 1-based 与编辑器一致）。
 *
 * 值在生产构建里不存在（source 为 null），在旧实例里可能是任一形态；所有消费方
 * （vetd_notes 输出、备注锚保鲜、后续 AST 写回指纹）统一走这里，别各自 split(":")。
 */

export interface SourceLocator {
	/** 相对设计根的 posix 路径，如 `frames/login.tsx`。 */
	file: string;
	line: number;
	/** v1 值没有列号。 */
	column: number | null;
}

/**
 * 文件段限定不含冒号：值域是引擎生成的 posix 相对路径（无盘符无冒号），多段数字
 * （如 `x:42:9:7`）匹配不上即判 null——宁可拒绝也不把行号误吞进文件名。
 */
const LOCATOR_PATTERN = /^([^:]+):(\d+)(?::(\d+))?$/;

/** 解析失败（空值、畸形、非正数行列）一律返回 null，不抛。 */
export function parseSourceLocator(value: string | null | undefined): SourceLocator | null {
	if (typeof value !== "string" || value.length === 0) return null;
	const match = LOCATOR_PATTERN.exec(value);
	if (!match) return null;
	const line = Number(match[2]);
	const column = match[3] === undefined ? null : Number(match[3]);
	if (!Number.isInteger(line) || line < 1) return null;
	if (column !== null && (!Number.isInteger(column) || column < 1)) return null;
	return { file: match[1], line, column };
}
