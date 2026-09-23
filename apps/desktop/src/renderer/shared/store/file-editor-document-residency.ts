import type { FileEditorDocumentState } from "./file-atoms";

/** 编辑器文档缓存的常驻上限；脏草稿与打开中的文档不参与淘汰，但计入判定基数。 */
export const MAX_FILE_EDITOR_DOCUMENTS = 32;

export function isEditorDocumentClean(document: FileEditorDocumentState): boolean {
	// isEditorDocumentDirty（domains/file-preview/services/editor-document-state.ts）
	// 的反面。未保存草稿只活在内存里，淘汰脏文档等于静默丢用户数据。
	return document.draftContent === document.savedContent;
}

/**
 * 把编辑器文档缓存压回上限内：按 Map 插入序（最旧优先）淘汰「干净且未被
 * 挂载编辑器引用」的文档。全部条目都不可淘汰（脏 / 打开中）时允许超限——
 * 「绝不丢草稿」优先于严格上界，实际驻留量由用户编辑活动天然约束。
 */
export function evictCleanEditorDocuments(
	documents: Map<string, FileEditorDocumentState>,
	openCounts: ReadonlyMap<string, number>,
	limit: number = MAX_FILE_EDITOR_DOCUMENTS,
): Map<string, FileEditorDocumentState> {
	if (documents.size <= limit) return documents;
	const next = new Map(documents);
	// 只删除当前遍历到的键、不做重插，Map 遍历安全。
	for (const path of next.keys()) {
		if (next.size <= limit) break;
		if ((openCounts.get(path) ?? 0) > 0) continue;
		const document = next.get(path);
		if (document === undefined || !isEditorDocumentClean(document)) continue;
		next.delete(path);
	}
	return next;
}
