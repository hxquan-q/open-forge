// @vitest-environment jsdom
// Modified by The Open Forge contributors.

import type { DesktopApi } from "@preload/api";
import { pluginFilePreviewsAtom } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const translations = vi.hoisted(() => ({
	t: (key: string) => key,
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: translations.t }),
}));

import { usePreviewBodyModel } from "./usePreviewBodyModel";

function createWrapper(store = createStore()) {
	return function Wrapper({ children }: PropsWithChildren): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}

describe("usePreviewBodyModel", () => {
	let readFile: ReturnType<typeof vi.fn>;
	let readTextPreviewFile: ReturnType<typeof vi.fn>;
	let watchDir: ReturnType<typeof vi.fn>;
	let onDirChanged: ReturnType<typeof vi.fn>;
	let dirChangedHandlers: Set<(dirPath: string, fileNames?: readonly string[]) => void>;

	function emitDirChanged(dirPath: string, fileNames?: readonly string[]): void {
		act(() => {
			for (const handler of [...dirChangedHandlers]) handler(dirPath, fileNames);
		});
	}

	beforeEach(() => {
		readFile = vi.fn();
		readTextPreviewFile = vi.fn();
		watchDir = vi.fn(async () => undefined);
		dirChangedHandlers = new Set();
		onDirChanged = vi.fn((handler: (dirPath: string, fileNames?: readonly string[]) => void) => {
			dirChangedHandlers.add(handler);
			return () => dirChangedHandlers.delete(handler);
		});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				fs: {
					readFile,
					readTextPreviewFile,
					watchDir,
					unwatchDir: vi.fn(async () => undefined),
					onDirChanged,
				},
			} as unknown as DesktopApi,
		});
	});

	it("renders an unknown local UTF-8 file through the plain-text fallback", async () => {
		readTextPreviewFile.mockResolvedValue({ status: "text", content: "custom content", size: 14 });
		const { result } = renderHook(
			() => usePreviewBodyModel({ name: "notes.custom", path: "C:\\workspace\\notes.custom" }),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.state.status).toBe("content"));
		expect(readTextPreviewFile).toHaveBeenCalledWith("C:\\workspace\\notes.custom");
		expect(readFile).not.toHaveBeenCalled();
		if (result.current.state.status !== "content") throw new Error("Expected content preview");
		expect(result.current.state.content).toMatchObject({ props: { content: "custom content", extension: "" } });
	});

	it("keeps an unknown binary file in the unsupported state", async () => {
		readTextPreviewFile.mockResolvedValue({ status: "binary", size: 4 });
		const { result } = renderHook(
			() => usePreviewBodyModel({ name: "payload.custom", path: "C:\\workspace\\payload.custom" }),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.state.status).toBe("unsupported"));
	});

	it("does not probe an unknown remote resource without a bounded host reader", () => {
		const { result } = renderHook(
			() => usePreviewBodyModel({ name: "notes.custom", url: "https://example.test/notes.custom" }),
			{ wrapper: createWrapper() },
		);

		expect(result.current.state.status).toBe("unsupported");
		expect(readTextPreviewFile).not.toHaveBeenCalled();
	});

	it("keeps a registered plugin preview ahead of the plain-text fallback", () => {
		const store = createStore();
		store.set(pluginFilePreviewsAtom, [
			{ pluginId: "custom-viewer", extensions: ["custom"], component: () => null },
		]);
		const { result } = renderHook(
			() => usePreviewBodyModel({ name: "notes.custom", path: "C:\\workspace\\notes.custom" }),
			{ wrapper: createWrapper(store) },
		);

		expect(result.current.state.status).toBe("plugin");
		expect(readTextPreviewFile).not.toHaveBeenCalled();
	});

	it("continues to use the existing reader for declared text formats", async () => {
		readFile.mockResolvedValue({ content: "# heading", encoding: "utf8" });
		const { result } = renderHook(
			() => usePreviewBodyModel({ name: "notes.md", path: "C:\\workspace\\notes.md" }),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.state.status).toBe("content"));
		expect(readFile).toHaveBeenCalledWith("C:\\workspace\\notes.md");
		expect(readTextPreviewFile).not.toHaveBeenCalled();
	});

	it("re-probes an unknown local file after a refresh", async () => {
		readTextPreviewFile.mockResolvedValue({ status: "text", content: "one", size: 3 });
		const { result, rerender } = renderHook(
			({ refreshNonce }) =>
				usePreviewBodyModel(
					{ name: "notes.custom", path: "C:\\workspace\\notes.custom" },
					refreshNonce,
				),
			{ initialProps: { refreshNonce: 0 }, wrapper: createWrapper() },
		);
		await waitFor(() => expect(result.current.state.status).toBe("content"));

		readTextPreviewFile.mockResolvedValue({ status: "text", content: "two", size: 3 });
		act(() => rerender({ refreshNonce: 1 }));

		await waitFor(() => expect(readTextPreviewFile).toHaveBeenCalledTimes(2));
	});

	describe("HTML preview", () => {
		const htmlPath = "C:\\workspace\\site\\index.html";

		function loadedHtmlProps(
			result: { current: ReturnType<typeof usePreviewBodyModel> },
		): { sourcePath?: string; revision?: string; content: string } {
			const state = result.current.state;
			if (state.status !== "content") throw new Error(`Expected content preview, got ${state.status}`);
			return (state.content as { props: { sourcePath?: string; revision?: string; content: string } }).props;
		}

		function renderHtml() {
			return renderHook(() => usePreviewBodyModel({ name: "index.html", path: htmlPath }), {
				wrapper: createWrapper(),
			});
		}

		it("loads the real document through vetta-file:// so relative assets resolve", async () => {
			readFile.mockResolvedValue({ content: "<html><body>one</body></html>", encoding: "utf8" });
			const { result } = renderHtml();

			await waitFor(() => expect(result.current.state.status).toBe("content"));
			const props = loadedHtmlProps(result);

			expect(readFile).toHaveBeenCalledWith(htmlPath);
			// 渲染层据此切到 `src` 模式；映射本身的用例在 preview-assets.test.ts。
			expect(props.sourcePath).toBe(htmlPath);
			expect(props.revision).toBe("0:0");
			expect(props.content).toBe("<html><body>one</body></html>");
			expect(watchDir).toHaveBeenCalledWith("C:\\workspace\\site");
		});

		it("keeps the frame identity when a same-directory write leaves the content unchanged", async () => {
			readFile.mockResolvedValue({ content: "<html><body>same</body></html>", encoding: "utf8" });
			const { result } = renderHtml();
			await waitFor(() => expect(result.current.state.status).toBe("content"));

			emitDirChanged("C:\\workspace\\site", ["index.html"]);

			await waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
			expect(loadedHtmlProps(result).revision).toBe("0:0");
		});

		it("bumps the revision when the document content changes", async () => {
			readFile.mockResolvedValue({ content: "<html><body>one</body></html>", encoding: "utf8" });
			const { result } = renderHtml();
			await waitFor(() => expect(result.current.state.status).toBe("content"));

			readFile.mockResolvedValue({ content: "<html><body>two</body></html>", encoding: "utf8" });
			emitDirChanged("C:\\workspace\\site", ["index.html"]);

			await waitFor(() => expect(loadedHtmlProps(result).content).toBe("<html><body>two</body></html>"));
			expect(loadedHtmlProps(result).revision).toBe("1:0");
		});

		it("reloads the frame when a referenced script changes", async () => {
			readFile.mockResolvedValue({
				content: '<html><head><script src="./app.js"></script></head></html>',
				encoding: "utf8",
			});
			const { result } = renderHtml();
			await waitFor(() => expect(result.current.state.status).toBe("content"));

			emitDirChanged("C:\\workspace\\site", ["app.js"]);

			await waitFor(() => expect(loadedHtmlProps(result).revision).toBe("1:0"));
		});

		it("watches referenced asset directories and reloads when they change", async () => {
			const html = '<html><head><link rel="stylesheet" href="../shared/base.css"></head></html>';
			readFile.mockResolvedValue({ content: html, encoding: "utf8" });
			const { result } = renderHtml();
			await waitFor(() => expect(result.current.state.status).toBe("content"));

			expect(watchDir).toHaveBeenCalledWith("C:\\workspace\\site");
			await waitFor(() => expect(watchDir).toHaveBeenCalledWith("C:/workspace/shared"));

			// 旧宿主可能拿不到文件名，资源目录的变化按目录保守判定。
			emitDirChanged("C:\\workspace\\shared", undefined);

			await waitFor(() => expect(loadedHtmlProps(result).revision).toBe("1:0"));
		});

		it("does not reload the frame for an unrelated write", async () => {
			readFile.mockResolvedValue({ content: "<html><body>same</body></html>", encoding: "utf8" });
			const { result } = renderHtml();
			await waitFor(() => expect(result.current.state.status).toBe("content"));

			emitDirChanged("C:\\workspace\\site", ["notes.txt"]);

			await waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
			expect(loadedHtmlProps(result).revision).toBe("0:0");
		});
	});
});
