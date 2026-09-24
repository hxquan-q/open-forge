import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import type { FileEditorDocumentState } from "./file-atoms";
import {
	fileEditorDocumentsAtom,
	fileEditorHasUnsavedChangesAtom,
	fileEditorOpenDocumentCountsAtom,
	registerFileEditorDocumentAtom,
	releaseFileEditorDocumentAtom,
} from "./file-atoms";
import { evictCleanEditorDocuments, MAX_FILE_EDITOR_DOCUMENTS } from "./file-editor-document-residency";

type Store = ReturnType<typeof createStore>;

function cleanDocument(path: string, content = "content"): FileEditorDocumentState {
	return {
		path,
		savedContent: content,
		draftContent: content,
		revision: "rev-1",
		hasBom: false,
		lineEnding: "lf",
		size: content.length,
		modifiedAt: 0,
		editorGeneration: 0,
	};
}

function dirtyDocument(path: string, content = "content"): FileEditorDocumentState {
	return { ...cleanDocument(path, content), draftContent: `${content}-dirty` };
}

function writeDocuments(store: Store, documents: FileEditorDocumentState[]): void {
	store.set(fileEditorDocumentsAtom, (current) => {
		const next = new Map(current);
		for (const document of documents) next.set(document.path, document);
		return next;
	});
}

describe("fileEditorDocumentsAtom 有界化", () => {
	it("超过上限时按插入序淘汰最旧干净文档", () => {
		const store = createStore();
		const documents = Array.from({ length: MAX_FILE_EDITOR_DOCUMENTS + 2 }, (_, index) =>
			cleanDocument(`path-${String(index + 1).padStart(2, "0")}`),
		);
		writeDocuments(store, documents);
		const cached = store.get(fileEditorDocumentsAtom);
		expect(cached.size).toBe(MAX_FILE_EDITOR_DOCUMENTS);
		expect(cached.has("path-01")).toBe(false);
		expect(cached.has("path-02")).toBe(false);
		expect(cached.has(`path-${MAX_FILE_EDITOR_DOCUMENTS + 1}`)).toBe(true);
	});

	it("脏草稿永不淘汰", () => {
		const store = createStore();
		const documents = [
			dirtyDocument("path-01", "must-survive"),
			...Array.from({ length: MAX_FILE_EDITOR_DOCUMENTS + 1 }, (_, index) => cleanDocument(`path-${index + 2}`)),
		];
		writeDocuments(store, documents);
		const cached = store.get(fileEditorDocumentsAtom);
		expect(cached.size).toBe(MAX_FILE_EDITOR_DOCUMENTS);
		const dirty = cached.get("path-01");
		expect(dirty?.draftContent).toBe("must-survive-dirty");
		expect(dirty?.savedContent).toBe("must-survive");
	});

	it("打开中的干净文档不被淘汰", () => {
		const store = createStore();
		store.set(registerFileEditorDocumentAtom, "path-01");
		writeDocuments(
			store,
			Array.from({ length: MAX_FILE_EDITOR_DOCUMENTS + 2 }, (_, index) =>
				cleanDocument(`path-${String(index + 1).padStart(2, "0")}`),
			),
		);
		const cached = store.get(fileEditorDocumentsAtom);
		expect(cached.size).toBe(MAX_FILE_EDITOR_DOCUMENTS);
		expect(cached.has("path-01")).toBe(true);
		expect(cached.has("path-02")).toBe(false);
		expect(cached.has("path-03")).toBe(false);
	});

	it("refcount：同 path 双登记两次释放各一次，归零后文档删除且计数键清理", () => {
		const store = createStore();
		store.set(registerFileEditorDocumentAtom, "path-01");
		store.set(registerFileEditorDocumentAtom, "path-01");
		writeDocuments(store, [cleanDocument("path-01")]);

		store.set(releaseFileEditorDocumentAtom, "path-01");
		expect(store.get(fileEditorDocumentsAtom).has("path-01")).toBe(true);
		expect(store.get(fileEditorOpenDocumentCountsAtom).get("path-01")).toBe(1);

		store.set(releaseFileEditorDocumentAtom, "path-01");
		expect(store.get(fileEditorDocumentsAtom).has("path-01")).toBe(false);
		const counts = store.get(fileEditorOpenDocumentCountsAtom);
		expect(counts.has("path-01")).toBe(false);
		expect(counts.size).toBe(0);
	});

	it("释放脏文档不删除（草稿不因关闭编辑器丢失）", () => {
		const store = createStore();
		store.set(registerFileEditorDocumentAtom, "path-01");
		writeDocuments(store, [dirtyDocument("path-01", "draft")]);
		store.set(releaseFileEditorDocumentAtom, "path-01");
		const document = store.get(fileEditorDocumentsAtom).get("path-01");
		expect(document?.draftContent).toBe("draft-dirty");
	});

	it("淘汰发生后 beforeunload 保护语义保持", () => {
		const store = createStore();
		writeDocuments(
			store,
			Array.from({ length: MAX_FILE_EDITOR_DOCUMENTS + 2 }, (_, index) =>
				index === 5 ? dirtyDocument("path-06") : cleanDocument(`path-${index + 1}`),
			),
		);
		expect(store.get(fileEditorHasUnsavedChangesAtom)).toBe(true);

		const cleanStore = createStore();
		writeDocuments(
			cleanStore,
			Array.from({ length: MAX_FILE_EDITOR_DOCUMENTS + 2 }, (_, index) => cleanDocument(`path-${index + 1}`)),
		);
		expect(cleanStore.get(fileEditorHasUnsavedChangesAtom)).toBe(false);
	});

	it("未超限时返回原引用（无谓重渲染护栏）", () => {
		const documents = new Map([
			["path-01", cleanDocument("path-01")],
			["path-02", cleanDocument("path-02")],
		]);
		expect(evictCleanEditorDocuments(documents, new Map())).toBe(documents);
	});
});
