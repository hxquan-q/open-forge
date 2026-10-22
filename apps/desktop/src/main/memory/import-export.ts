// Modified by The Open Forge contributors.
import { readFileSync, writeFileSync } from "node:fs";
import { parseLegacyMemoryDocument, renderLegacyMemoryMarkdown } from "@vetta/coding-agent/memory";
import type { MemoryScope } from "@vetta/runtime-memory";
import {
	exportMemories,
	importLegacyEntries,
	SqliteMemoryErasure,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";

/**
 * Desktop 记忆导入/导出入口（TASK-0378）：按显式路径读取 MEMORY.md，
 * 不覆盖用户原件（导出写到调用方显式给定的目标路径）。
 * 迁移/预览/去重结果如实返回；已撤销来源不因再导入重生。
 */

export interface LegacyImportReport {
	readonly file: string;
	readonly fileHash: string;
	readonly entries: number;
	readonly imported: number;
	readonly skippedDuplicates: number;
	readonly skippedSuppressed: number;
}

export async function importLegacyMemoryFile(options: {
	readonly filePath: string;
	readonly memoryDirectory: string;
	readonly scope: MemoryScope;
}): Promise<LegacyImportReport> {
	const text = readFileSync(options.filePath, "utf8");
	const document = parseLegacyMemoryDocument(text);
	const store = await SqliteMemoryWorkerStore.open({
		databasePath: `${options.memoryDirectory}/memory.sqlite`,
		allowedScopes: [options.scope],
	});
	const erasure = await SqliteMemoryErasure.open({
		databasePath: `${options.memoryDirectory}/memory.sqlite`,
	});
	try {
		const outcome = await importLegacyEntries({
			store,
			scope: options.scope,
			entries: document.entries,
			isSourceSuppressed: (sourceId) => erasure.isSourceSuppressed(sourceId),
		});
		return {
			file: options.filePath,
			fileHash: document.fileHash,
			entries: document.entries.length,
			imported: outcome.imported,
			skippedDuplicates: outcome.skippedDuplicates,
			skippedSuppressed: outcome.skippedSuppressed,
		};
	} finally {
		await store.close();
		erasure.close();
	}
}

export async function exportMemoryMarkdown(options: {
	readonly targetPath: string;
	readonly memoryDirectory: string;
	readonly scope: MemoryScope;
}): Promise<{ readonly targetPath: string; readonly count: number }> {
	const store = await SqliteMemoryWorkerStore.open({
		databasePath: `${options.memoryDirectory}/memory.sqlite`,
		allowedScopes: [options.scope],
	});
	try {
		const result = await exportMemories({ store, scope: options.scope });
		writeFileSync(options.targetPath, `${result.markdown}\n`, "utf8");
		return { targetPath: options.targetPath, count: result.count };
	} finally {
		await store.close();
	}
}

/** 回滚合同：停用新 Feature（policy=off）不清数据；旧客户端高版本库拒绝打开。 */
export async function verifyRollbackContract(options: {
	readonly memoryDirectory: string;
	readonly scope: MemoryScope;
}): Promise<{ readonly schemaVersion: number; readonly openable: boolean }> {
	const store = await SqliteMemoryWorkerStore.open({
		databasePath: `${options.memoryDirectory}/memory.sqlite`,
		allowedScopes: [options.scope],
	});
	try {
		return { schemaVersion: store.schemaVersion, openable: true };
	} finally {
		await store.close();
	}
}

void renderLegacyMemoryMarkdown;
