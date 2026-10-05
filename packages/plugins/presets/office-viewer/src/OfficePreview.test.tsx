// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { PluginFilePreviewContribution, PluginPreviewFile } from "@vetta-org/plugin-sdk";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
	let resolveDocx = () => {};
	const docxGate = new Promise<void>((resolve) => {
		resolveDocx = resolve;
	});
	return {
		loaded: new Set<string>(),
		register: vi.fn<(contribution: PluginFilePreviewContribution) => void>(),
		docxGate,
		resolveDocx: () => resolveDocx(),
		renderDocx: vi.fn(async (bytes: ArrayBuffer, container: HTMLElement) => {
			const page = document.createElement("section");
			page.className = "docx";
			page.textContent = `Document ${new Uint8Array(bytes)[0]}`;
			container.appendChild(page);
		}),
	};
});

vi.mock("@vetta-org/plugin-sdk", () => {
	const t = (key: string) => key;
	return {
		definePlugin(definition: { activate(context: { ui: { registerFilePreview: typeof host.register } }): void }) {
			definition.activate({ ui: { registerFilePreview: host.register } });
			return definition;
		},
		useTranslation: () => ({ t }),
	};
});
vi.mock("docx-preview", async () => {
	host.loaded.add("docx");
	await host.docxGate;
	return { renderAsync: host.renderDocx };
});
vi.mock("pdfjs-dist", () => {
	host.loaded.add("pdf");
	return { GlobalWorkerOptions: {} };
});
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?raw", () => ({ default: "/* PDF worker fixture */" }));
vi.mock("@aiden0z/pptx-renderer", () => {
	host.loaded.add("pptx");
	return { parseZip: vi.fn().mockRejectedValue(new Error("Invalid presentation")) };
});
vi.mock("xlsx", () => {
	host.loaded.add("spreadsheet");
	return {
		read: () => ({ SheetNames: ["Budget"], Sheets: { Budget: {} } }),
		utils: { encode_col: (column: number) => `Column ${column}` },
	};
});
vi.mock("@vetta-org/ui", () => ({
	Button: ({ children }: { children: string }) => createElement("button", { type: "button" }, children),
}));

afterEach(() => vi.unstubAllGlobals());

it("registers every format, loads only the opened parser, refreshes files and disposes previews", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	const createObjectURL = vi.fn(() => "blob:unused-worker");
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = createObjectURL;
		},
	);
	await import("./index");

	expect(host.register).toHaveBeenCalledWith({
		extensions: ["pdf", "docx", "pptx", "xls", "xlsx", "xlsm", "xlsb", "ods"],
		component: expect.any(Function),
	});
	expect([...host.loaded]).toEqual([]);
	expect(createObjectURL).not.toHaveBeenCalled();
	const contribution = host.register.mock.calls[0]?.[0];
	if (!contribution) throw new Error("Missing preview registration");

	let changeFile = () => {};
	const disposeWatch = vi.fn();
	const watchers = new Set<() => void>();
	let contents = 1;
	const file: PluginPreviewFile = {
		path: null,
		name: "document.docx",
		extension: "docx",
		mime: "",
		size: 1,
		getUrl: () => "",
		readText: async () => "",
		readBytes: async () => new Uint8Array([contents]).buffer,
		watch: (listener) => {
			changeFile = listener;
			watchers.add(listener);
			return {
				dispose() {
					disposeWatch();
					watchers.delete(listener);
				},
			};
		},
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const render = (nextFile: PluginPreviewFile) =>
		act(async () => {
			root.render(createElement(contribution.component, { file: nextFile }));
		});
	const settle = () =>
		act(async () => {
			await vi.dynamicImportSettled();
		});
	try {
		await render(file);
		expect(container.textContent).toContain("state.loading");
		await vi.waitFor(() => expect([...host.loaded]).toEqual(["docx"]));
		expect(host.renderDocx).not.toHaveBeenCalled();

		// Closing/switching while the code loads must not mount the old document later.
		await render({ ...file, extension: "unsupported" });
		expect(container.textContent).toContain("error.unsupportedFormat");
		host.resolveDocx();
		await settle();
		expect(host.renderDocx).not.toHaveBeenCalled();

		await render(file);
		await settle();
		expect(container.textContent).toContain("Document 1");
		contents = 2;
		await act(async () => {
			changeFile();
		});
		expect(container.textContent).toContain("Document 2");
		expect(container.textContent).not.toContain("Document 1");

		await render({ ...file, extension: "xlsx", name: "budget.xlsx" });
		await settle();
		expect(container.textContent).toContain("Budget");
		expect([...host.loaded]).toEqual(["docx", "spreadsheet"]);
		await render({ ...file, extension: "pptx" });
		await settle();
		expect(container.textContent).toContain("Invalid presentation");
		expect([...host.loaded]).toEqual(["docx", "spreadsheet", "pptx"]);
		expect(container.textContent).not.toContain("Document 2");

		await render({
			...file,
			readBytes: async () => {
				throw new Error("File unavailable");
			},
		});
		await settle();
		expect(container.textContent).toContain("docx.error");
		await render(file);
		await settle();
		expect(container.textContent).toContain("Document 2");
		expect(createObjectURL).not.toHaveBeenCalled();
	} finally {
		await act(async () => {
			root.unmount();
		});
		container.remove();
	}
	expect(disposeWatch).toHaveBeenCalled();
	expect(watchers.size).toBe(0);
});
