// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { DesktopApi } from "@preload/api";
import type { FsEditableTextSnapshot, FsSaveEditableTextOptions } from "@preload/fs-types";
import { fileEditorDocumentsAtom } from "@shared/store/atoms";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";

const preparation = vi.hoisted(() => ({ evaluations: 0, paint: vi.fn() }));
vi.mock("@shared/lib/committed-paint", () => ({ waitForCommittedPaint: preparation.paint }));
vi.mock("./EditableTextFileView", async (importOriginal) => {
	preparation.evaluations += 1;
	return importOriginal();
});
// CodeMirror owns browser layout, selection and IME. Keep the real editor UI,
// document model and persistence wiring; adapt only its browser editing surface.
vi.mock("../../../../../../../packages/theme-ui/src/file-preview/TextCodeEditorView", () => ({
	TextCodeEditorView: ({
		initialValue,
		onChange,
		documentKey,
	}: {
		initialValue: string;
		onChange: (content: string) => void;
		documentKey: string;
	}) => (
		<textarea
			key={documentKey}
			aria-label="Code"
			defaultValue={initialValue}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { FilePreviewView } from "./FilePreviewView";
import { PreviewBody } from "./PreviewContent";

describe("file preview and editing flow", () => {
	it("reads without an editor, then loads, edits, saves, closes and reopens the saved file", async () => {
		let content = "original text";
		let revision = "r1";
		const path = "/workspace/notes.txt";
		const item = { name: "notes.txt", path };
		const snapshot = (): FsEditableTextSnapshot => ({
			content,
			revision,
			hasBom: false,
			lineEnding: "lf",
			size: content.length,
			modifiedAt: 1,
		});
		const readEditableTextFile = vi.fn(async () => snapshot());
		const saveEditableTextFile = vi.fn(async (_path: string, next: string, options: FsSaveEditableTextOptions) => {
			expect(options.expectedRevision).toBe(revision);
			content = next;
			revision = "r2";
			return { status: "saved" as const, revision, size: content.length, modifiedAt: 2 };
		});
		const watchDir = vi.fn(async () => {});
		const unwatchDir = vi.fn(async () => {});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				...window.vetta,
				fs: {
					readFile: vi.fn(async () => ({ content, encoding: "utf8" })),
					readEditableTextFile,
					saveEditableTextFile,
					watchDir,
					unwatchDir,
					onDirChanged: vi.fn(() => () => {}),
				},
			} as unknown as DesktopApi,
		});
		const store = createStore();
		const mounted = render(
			<Provider store={store}>
				<PreviewBody item={item} />
			</Provider>,
		);
		await screen.findByText("original text");
		expect(preparation.evaluations).toBe(0);
		expect(readEditableTextFile).not.toHaveBeenCalled();

		let paint!: () => void;
		preparation.paint.mockReturnValue(
			new Promise<void>((resolve) => {
				paint = resolve;
			}),
		);
		const close = vi.fn();
		const editable = (
			<Provider store={store}>
				<FilePreviewView
					ctx={{ items: [item], index: 0 }}
					canPrev={false}
					canNext={false}
					onClose={close}
					enableKeyboard
				/>
			</Provider>
		);
		mounted.rerender(editable);
		expect(screen.getByRole("heading", { name: "notes.txt" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toContain("fileEditor.loading");
		expect(preparation.evaluations).toBe(0);
		expect(readEditableTextFile).not.toHaveBeenCalled();
		await act(async () => paint());
		const code = await screen.findByRole("textbox", { name: "Code" });
		expect(watchDir).toHaveBeenCalledWith("/workspace");
		await userEvent.clear(code);
		await userEvent.type(code, "saved text");
		await userEvent.click(screen.getByRole("button", { name: "fileEditor.save" }));
		await screen.findByText("fileEditor.saved");
		expect(content).toBe("saved text");
		expect(saveEditableTextFile).toHaveBeenCalledOnce();

		await userEvent.click(screen.getByRole("button", { name: "fileEditor.close" }));
		expect(close).toHaveBeenCalledOnce();
		mounted.rerender(<Provider store={store} />);
		expect(store.get(fileEditorDocumentsAtom).has(path)).toBe(false);
		expect(unwatchDir).toHaveBeenCalledWith("/workspace");
		preparation.paint.mockResolvedValue("painted");
		mounted.rerender(editable);
		await waitFor(() =>
			expect((screen.getByRole("textbox", { name: "Code" }) as HTMLTextAreaElement).value).toBe("saved text"),
		);
		expect(readEditableTextFile).toHaveBeenCalledTimes(2);
	});
});
