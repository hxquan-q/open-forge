// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { PluginPreviewFile } from "@vetta-org/plugin-sdk";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OfficePreview } from "./OfficePreview";

vi.mock("@vetta-org/plugin-sdk", () => {
	const t = (key: string) => key;
	return { useTranslation: () => ({ t }) };
});
vi.mock("pdfjs-dist", () => {
	throw new Error("Parser module unavailable");
});
vi.mock("docx-preview", () => ({ renderAsync: async () => {} }));
vi.mock("@vetta-org/ui", () => ({
	Button: ({ children }: { children: string }) => createElement("button", { type: "button" }, children),
}));
afterEach(() => vi.unstubAllGlobals());

it("contains parser import failures in the preview and can open another format afterwards", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	const file: PluginPreviewFile = {
		path: null,
		name: "sample.pdf",
		extension: "pdf",
		mime: "",
		size: 0,
		getUrl: () => "",
		readText: async () => "",
		readBytes: async () => new ArrayBuffer(0),
		watch: () => ({ dispose() {} }),
	};
	const container = document.createElement("div");
	const root = createRoot(container);
	try {
		await act(async () => {
			root.render(createElement(OfficePreview, { file }));
		});
		await act(async () => {
			await vi.dynamicImportSettled();
		});
		expect(container.textContent).toContain("error.loadPreview");
		expect(container.textContent).toContain("state.loadErrorHint");
		expect(container.textContent).not.toContain("state.errorHint");

		await act(async () => {
			root.render(createElement(OfficePreview, { file: { ...file, extension: "docx" } }));
		});
		await act(async () => {
			await vi.dynamicImportSettled();
		});
		expect(container.textContent).not.toContain("error.loadPreview");
		expect(container.textContent).not.toContain("state.loading");
		expect(container.textContent).toContain("toolbar.fitWidth");
	} finally {
		await act(async () => {
			root.unmount();
		});
	}
});
