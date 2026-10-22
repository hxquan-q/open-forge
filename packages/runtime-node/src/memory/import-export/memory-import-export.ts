// Modified by The Open Forge contributors.
import type { MemoryScope } from "@vetta/runtime-memory";
import type { SqliteMemoryWorkerStore } from "../worker/memory-worker.js";

/**
 * 记忆导入/导出（TASK-0378）。
 *
 * - 导入：legacy 条目 → remember（kind=preference、validFrom=unknown 不猜测、
 *   来源 role=legacy-import 携带 hash）；同一来源重复导入幂等；已撤销来源
 *   不因再导入重生；不覆盖/不修改用户原文件。
 * - 导出：仅授权 scope 的当前有效记忆 → Markdown（版本+时间标记）。
 */

export interface ImportOutcome {
	readonly imported: number;
	readonly skippedDuplicates: number;
	readonly skippedSuppressed: number;
}

export async function importLegacyEntries(options: {
	readonly store: SqliteMemoryWorkerStore;
	readonly scope: MemoryScope;
	readonly entries: readonly { readonly content: string; readonly sourceId: string }[];
}): Promise<ImportOutcome> {
	let imported = 0;
	let skippedDuplicates = 0;
	let skippedSuppressed = 0;
	for (const entry of options.entries) {
		const already = await hasSource(options.store, options.scope, entry.sourceId);
		if (already) {
			skippedDuplicates += 1;
			continue;
		}
		try {
			await options.store.write(options.scope, {
				action: "remember",
				content: entry.content,
				kind: "preference",
				scopeName: options.scope.name,
				validFrom: "",
				sources: [{ sourceId: entry.sourceId, role: "legacy-import", retainsExcerpt: false }],
			});
			imported += 1;
		} catch (error) {
			if (error instanceof Error && /已被遗忘|MEMORY_SUPPRESSED/.test(error.message)) {
				skippedSuppressed += 1;
				continue;
			}
			throw error;
		}
	}
	return { imported, skippedDuplicates, skippedSuppressed };
}

async function hasSource(store: SqliteMemoryWorkerStore, scope: MemoryScope, sourceId: string): Promise<boolean> {
	// 导入幂等判定：遍历当前记忆的来源（S2 规模下可接受；后续以 ledger 表加速）。
	const revisions = await store.read(scope, { asOf: new Date().toISOString() });
	for (const revision of revisions) {
		const sources = await store.listSources(revision.memoryId, scope);
		if (sources.some((source) => source.sourceId === sourceId)) {
			return true;
		}
	}
	return false;
}

export interface ExportEntry {
	readonly memoryId: string;
	readonly content: string;
	readonly validFrom: string;
	readonly recordedAt: string;
}

export async function exportMemories(options: {
	readonly store: SqliteMemoryWorkerStore;
	readonly scope: MemoryScope;
	readonly formatVersion?: 1;
	readonly now?: () => string;
}): Promise<{ readonly markdown: string; readonly count: number }> {
	const entries = await options.store.read(options.scope, { asOf: new Date().toISOString() });
	const exportedAt = (options.now ?? (() => new Date().toISOString()))();
	const version = options.formatVersion ?? 1;
	const header = `<!-- open-forge memory export v${version} exportedAt=${exportedAt} -->`;
	const body = entries.map((entry) => `${entry.content}\n---`).join("\n");
	return { markdown: `${header}\n\n${body}`, count: entries.length };
}
