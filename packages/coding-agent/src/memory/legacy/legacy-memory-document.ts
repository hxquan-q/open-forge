// Modified by The Open Forge contributors.

/**
 * 旧 MEMORY.md 解析（TASK-0378，REQ-0027 兼容路线）。
 *
 * legacy 格式（ADR-0009）：分隔符行（`---`）切分的条目列表。解析合同：
 * - 保留分隔符与内容原样（不重排/不改写用户文件）；
 * - 每条记录首个非空行为内容，其余行为上下文（合并为多行内容）；
 * - Journal 仅有损辅助：不解析为确定事实，只供人工预览；
 * - 导入项携带 legacy 来源 hash（文件内容哈希+条目序号），重复导入同一
 *   文件幂等；文件变更后 hash 不同，需预览确认；
 * - 缺失时间显式 unknown，不猜测。
 */

export interface LegacyMemoryEntry {
	readonly index: number;
	readonly content: string;
	/** 来源指纹：legacy 文件 hash + 条目序号；导入幂等键的一部分。 */
	readonly sourceId: string;
}

export interface LegacyMemoryDocument {
	readonly entries: readonly LegacyMemoryEntry[];
	/** 整个文件内容 hash（变更检测）。 */
	readonly fileHash: string;
}

export function hashLegacyContent(content: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < content.length; index += 1) {
		hash ^= content.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `fnv1a-${hash.toString(16)}-${content.length}`;
}

/** 解析 MEMORY.md：按分隔符（仅 `---` 整行）切块；首尾空块丢弃。 */
export function parseLegacyMemoryDocument(text: string): LegacyMemoryDocument {
	const fileHash = hashLegacyContent(text);
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const blocks: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (/^---\s*$/.test(line)) {
			blocks.push(current.join("\n"));
			current = [];
			continue;
		}
		current.push(line);
	}
	blocks.push(current.join("\n"));
	const entries: LegacyMemoryEntry[] = [];
	let index = 0;
	for (const block of blocks) {
		const trimmed = block.trim();
		if (trimmed === "") continue;
		entries.push({
			index,
			content: trimmed,
			sourceId: `legacy:${fileHash}#${index}`,
		});
		index += 1;
	}
	return { entries, fileHash };
}

/** Markdown 按需导出：版本与导出时间标记；仅包含调用方授权 scope 的条目。 */
export function renderLegacyMemoryMarkdown(
	entries: readonly { content: string }[],
	options: { readonly exportedAt: string; readonly formatVersion: 1 },
): string {
	const header = `<!-- open-forge memory export v${options.formatVersion} exportedAt=${options.exportedAt} -->`;
	return [header, "", ...entries.map((entry) => `${entry.content}\n---`)].join("\n");
}
