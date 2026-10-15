// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { PluginPreviewFile } from "@vetta-org/plugin-sdk";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => {
	const tasks: Array<{ destroy: ReturnType<typeof vi.fn>; finish: () => void; fail: () => void }> = [];
	return {
		tasks,
		options: { workerSrc: "" },
		getDocument: vi.fn(() => {
			let finish = () => {};
			let fail = () => {};
			const destroyed = new Promise<void>((resolve, reject) => {
				finish = resolve;
				fail = () => reject(new Error("Worker shutdown failed"));
			});
			const destroy = vi.fn(() => destroyed);
			tasks.push({ destroy, finish, fail });
			return { promise: new Promise<never>(() => {}), destroy };
		}),
	};
});
vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: pdf.options,
	getDocument: pdf.getDocument,
	RenderingCancelledException: class extends Error {},
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?raw", () => ({ default: "/* PDF worker fixture */" }));
vi.mock("@vetta-org/plugin-sdk", () => {
	const t = (key: string) => key;
	return { useTranslation: () => ({ t }) };
});
vi.mock("@vetta-org/ui", () => ({ Button: () => null }));
afterEach(() => vi.unstubAllGlobals());

it("allocates only for mounted PDFs and releases the last URL after asynchronous worker shutdown", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const createObjectURL = vi
		.fn()
		.mockReturnValueOnce("blob:pdf-1")
		.mockReturnValueOnce("blob:pdf-2")
		.mockReturnValueOnce("blob:pdf-3");
	const revokeObjectURL = vi.fn();
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = createObjectURL;
			static revokeObjectURL = revokeObjectURL;
		},
	);
	const { PdfPreview } = await import("./PdfPreview");
	expect(createObjectURL).not.toHaveBeenCalled();

	const file: PluginPreviewFile = {
		path: null,
		name: "sample.pdf",
		extension: "pdf",
		mime: "application/pdf",
		size: 0,
		getUrl: () => "https://fixture.invalid/sample.pdf",
		readText: async () => "",
		readBytes: async () => new ArrayBuffer(0),
		watch: () => ({ dispose() {} }),
	};
	const container = document.createElement("div");
	const root = createRoot(container);
	const render = (count: number) =>
		act(async () => {
			root.render(
				createElement(
					"div",
					null,
					...Array.from({ length: count }, (_, key) => createElement(PdfPreview, { key, file })),
				),
			);
		});
	try {
		await render(2);
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(pdf.options.workerSrc).toBe("blob:pdf-1");
		expect(pdf.getDocument).toHaveBeenCalledTimes(2);
		await render(1);
		expect(pdf.tasks[1].destroy).toHaveBeenCalledOnce();
		await act(async () => {
			pdf.tasks[1].finish();
		});
		expect(revokeObjectURL).not.toHaveBeenCalled();

		await render(0);
		expect(pdf.tasks[0].destroy).toHaveBeenCalledOnce();
		expect(revokeObjectURL).not.toHaveBeenCalled();
		await act(async () => {
			pdf.tasks[0].fail();
		});
		expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:pdf-1");

		await render(1);
		expect(createObjectURL).toHaveBeenCalledTimes(2);
		expect(pdf.options.workerSrc).toBe("blob:pdf-2");
		await render(0);
		await act(async () => {
			pdf.tasks[2].finish();
		});
		expect(revokeObjectURL.mock.calls).toEqual([["blob:pdf-1"], ["blob:pdf-2"]]);
		pdf.getDocument.mockImplementationOnce(() => {
			throw new Error("Cannot start PDF task");
		});
		await render(1);
		expect(container.textContent).toContain("pdf.error");
		expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:pdf-3");
	} finally {
		await act(async () => {
			root.unmount();
		});
	}
});
