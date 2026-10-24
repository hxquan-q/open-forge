// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { fileEditorDocumentsAtom, fileEditorOpenDocumentCountsAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTextFileEditor } from "./useTextFileEditor";

function stubVettaFs(): void {
	vi.stubGlobal(
		"window",
		Object.assign(globalThis.window, {
			vetta: {
				fs: {
					readEditableTextFile: vi.fn(async () => ({
						content: "disk-content",
						revision: "rev-1",
						hasBom: false,
						lineEnding: "lf",
						size: "disk-content".length,
						modifiedAt: 0,
					})),
					watchDir: vi.fn(async () => {}),
					unwatchDir: vi.fn(async () => {}),
					onDirChanged: vi.fn(() => () => {}),
				},
			},
		}),
	);
}

function createWrapper(store: ReturnType<typeof createStore>, strictMode = false) {
	return function Wrapper({ children }: { children: ReactNode }) {
		const tree = <Provider store={store}>{children}</Provider>;
		return strictMode ? <StrictMode>{tree}</StrictMode> : tree;
	};
}

describe("useTextFileEditor 驻留登记", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("卸载时释放干净文档并清空计数键", async () => {
		stubVettaFs();
		const store = createStore();
		const { unmount } = renderHook(() => useTextFileEditor("/tmp/a.txt", 0), {
			wrapper: createWrapper(store),
		});
		await waitFor(() => expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(true));
		expect(store.get(fileEditorOpenDocumentCountsAtom).get("/tmp/a.txt")).toBe(1);

		act(() => unmount());
		expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(false);
		expect(store.get(fileEditorOpenDocumentCountsAtom).size).toBe(0);
	});

	it("卸载保留脏草稿", async () => {
		stubVettaFs();
		const store = createStore();
		const { result, unmount } = renderHook(() => useTextFileEditor("/tmp/a.txt", 0), {
			wrapper: createWrapper(store),
		});
		await waitFor(() => expect(result.current.document).toBeDefined());
		act(() => result.current.updateDraft("user-draft"));

		act(() => unmount());
		const document = store.get(fileEditorDocumentsAtom).get("/tmp/a.txt");
		expect(document?.draftContent).toBe("user-draft");
		expect(document?.savedContent).toBe("disk-content");
	});

	it("关闭仍在读取的文件后，不重新写入已释放的文档", async () => {
		stubVettaFs();
		const read = vi.mocked(window.vetta.fs.readEditableTextFile);
		const snapshot = await read("/tmp/a.txt");
		let finish!: (value: typeof snapshot) => void;
		read.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const store = createStore();
		const { unmount } = renderHook(() => useTextFileEditor("/tmp/a.txt", 0), {
			wrapper: createWrapper(store),
		});
		unmount();
		await act(async () => finish(snapshot));

		expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(false);
		expect(store.get(fileEditorOpenDocumentCountsAtom).size).toBe(0);
		expect(window.vetta.fs.unwatchDir).toHaveBeenCalledWith("/tmp");
	});

	it("切 path 释放旧 path 干净文档、登记新 path；脏的旧 path 保留", async () => {
		stubVettaFs();
		const store = createStore();
		const { result, rerender } = renderHook(({ path }) => useTextFileEditor(path, 0), {
			initialProps: { path: "/tmp/a.txt" },
			wrapper: createWrapper(store),
		});
		await waitFor(() => expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(true));
		act(() => result.current.updateDraft("dirty-a"));

		rerender({ path: "/tmp/b.txt" });
		await waitFor(() => expect(store.get(fileEditorDocumentsAtom).has("/tmp/b.txt")).toBe(true));
		expect(store.get(fileEditorOpenDocumentCountsAtom).has("/tmp/a.txt")).toBe(false);
		expect(store.get(fileEditorDocumentsAtom).get("/tmp/a.txt")?.draftContent).toBe("dirty-a");
		expect(store.get(fileEditorOpenDocumentCountsAtom).get("/tmp/b.txt")).toBe(1);
	});

	it("切换文件后忽略旧文件晚到的读取结果", async () => {
		stubVettaFs();
		const read = vi.mocked(window.vetta.fs.readEditableTextFile);
		const snapshot = await read("/tmp/a.txt");
		let finish!: (value: typeof snapshot) => void;
		read.mockImplementation((path) =>
			path === "/tmp/a.txt"
				? new Promise((resolve) => {
						finish = resolve;
					})
				: Promise.resolve({ ...snapshot, content: "new-file" }),
		);
		const store = createStore();
		const { result, rerender } = renderHook(({ path }) => useTextFileEditor(path, 0), {
			initialProps: { path: "/tmp/a.txt" },
			wrapper: createWrapper(store),
		});
		rerender({ path: "/tmp/b.txt" });
		await waitFor(() => expect(result.current.document?.draftContent).toBe("new-file"));
		await act(async () => finish(snapshot));

		expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(false);
		expect(result.current.document?.draftContent).toBe("new-file");
		expect(window.vetta.fs.unwatchDir).toHaveBeenCalledWith("/tmp");
	});

	it("StrictMode 下 register/release 对称（净计数为 1）", async () => {
		stubVettaFs();
		const store = createStore();
		const { unmount } = renderHook(() => useTextFileEditor("/tmp/a.txt", 0), {
			wrapper: createWrapper(store, true),
		});
		await waitFor(() => expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(true));
		expect(store.get(fileEditorOpenDocumentCountsAtom).get("/tmp/a.txt")).toBe(1);

		act(() => unmount());
		expect(store.get(fileEditorOpenDocumentCountsAtom).size).toBe(0);
		expect(store.get(fileEditorDocumentsAtom).has("/tmp/a.txt")).toBe(false);
	});
});
