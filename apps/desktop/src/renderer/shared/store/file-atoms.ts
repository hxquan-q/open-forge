// Modified by The Open Forge contributors.
import { atom } from "jotai";
import {
	FILE_EXPLORER_PREFERENCES_KEY,
	type FileExplorerPreferences,
	normalizeFileExplorerPreferences,
	readFileExplorerPreferences,
} from "../lib/file-explorer-preferences";
import { evictCleanEditorDocuments, isEditorDocumentClean } from "./file-editor-document-residency";

const fileExplorerPreferencesStateAtom = atom(readFileExplorerPreferences());
export const fileExplorerPreferencesAtom = atom(
	(get) => get(fileExplorerPreferencesStateAtom),
	(_get, set, value: FileExplorerPreferences) => {
		const preferences = normalizeFileExplorerPreferences(value);
		localStorage.setItem(FILE_EXPLORER_PREFERENCES_KEY, JSON.stringify(preferences));
		set(fileExplorerPreferencesStateAtom, preferences);
	},
);

export interface FsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export interface FileEditorDocumentState {
	path: string;
	savedContent: string;
	draftContent: string;
	revision: string;
	hasBom: boolean;
	lineEnding: "lf" | "crlf";
	size: number;
	modifiedAt: number;
	conflictRevision?: string;
	/**
	 * CodeMirror remount identity. Stable across save/draft edits; only bumps when
	 * the buffer is replaced from disk (open/reload/external clean replace).
	 */
	editorGeneration: number;
}

export const fileTreeCacheAtom = atom<Map<string, FsEntry[]>>(new Map());
export const expandedDirsAtom = atom<Set<string>>(new Set<string>());
export const loadingDirsAtom = atom<Set<string>>(new Set<string>());
export const fileContextMenuAtom = atom<{ x: number; y: number; entry: FsEntry; isRoot?: boolean } | null>(null);
export const renamingPathAtom = atom<string | null>(null);
const fileEditorDocumentsStateAtom = atom<Map<string, FileEditorDocumentState>>(new Map());
/**
 * 挂载中编辑器的引用计数（key 为文件 path）。inlineFilePreviewContextAtom 是
 * 全局 atom，路由过渡期两个 FileTabContent 可能对同一 path 重复登记，所以用
 * 计数而非集合；归零的键必须删除，否则把无界累积复刻进新结构。
 */
export const fileEditorOpenDocumentCountsAtom = atom<Map<string, number>>(new Map());
/**
 * 编辑器文档缓存（path → 双份全文）。写入统一经 evictCleanEditorDocuments
 * 有界化：只淘汰「干净且未挂载」的最旧文档；脏草稿与打开中的文档永不淘汰。
 */
export const fileEditorDocumentsAtom = atom(
	(get) => get(fileEditorDocumentsStateAtom),
	(
		get,
		set,
		update:
			| Map<string, FileEditorDocumentState>
			| ((current: Map<string, FileEditorDocumentState>) => Map<string, FileEditorDocumentState>),
	) => {
		const current = get(fileEditorDocumentsStateAtom);
		const next = typeof update === "function" ? update(current) : update;
		if (next === current) return;
		set(fileEditorDocumentsStateAtom, evictCleanEditorDocuments(next, get(fileEditorOpenDocumentCountsAtom)));
	},
);
export const registerFileEditorDocumentAtom = atom(null, (_get, set, path: string) => {
	set(fileEditorOpenDocumentCountsAtom, (current) => {
		const counts = new Map(current);
		counts.set(path, (counts.get(path) ?? 0) + 1);
		return counts;
	});
});
export const releaseFileEditorDocumentAtom = atom(null, (get, set, path: string) => {
	const counts = get(fileEditorOpenDocumentCountsAtom);
	const count = counts.get(path) ?? 0;
	if (count > 1) {
		const decremented = new Map(counts);
		decremented.set(path, count - 1);
		set(fileEditorOpenDocumentCountsAtom, decremented);
		return;
	}
	const cleared = new Map(counts);
	cleared.delete(path);
	set(fileEditorOpenDocumentCountsAtom, cleared);
	// 关闭/切换编辑器是旧实现遗漏的释放时机：干净文档顺手删除，脏草稿保留。
	const documents = get(fileEditorDocumentsStateAtom);
	const document = documents.get(path);
	if (document !== undefined && isEditorDocumentClean(document)) {
		const next = new Map(documents);
		next.delete(path);
		set(fileEditorDocumentsStateAtom, next);
	}
});
export const fileEditorHasUnsavedChangesAtom = atom((get) => {
	for (const document of get(fileEditorDocumentsAtom).values()) {
		if (document.draftContent !== document.savedContent) return true;
	}
	return false;
});
