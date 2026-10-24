// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { useEffect, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditableTextFileView } from "./EditableTextFileView";

const work = vi.hoisted(() => ({ paint: vi.fn(), load: vi.fn(), mount: vi.fn() }));
vi.mock("@shared/lib/committed-paint", () => ({ waitForCommittedPaint: work.paint }));
vi.mock("./editable-text-file-loader", () => ({ loadEditableTextFileView: work.load }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PreviewBody } from "./PreviewContent";
import { FilePreviewView } from "./FilePreviewView";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function Editor({ item }: ComponentProps<typeof EditableTextFileView>): JSX.Element {
	useEffect(() => {
		work.mount(item.path);
	}, [item.path]);
	return <div>Editing {item.path}</div>;
}

describe("editable preview loading", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows local loading before preparing the editor, and cancels preparation when closed", async () => {
		const paint = deferred<void>();
		work.paint.mockReturnValue(paint.promise);
		const close = vi.fn();
		const mounted = render(
			<Provider>
				<FilePreviewView
					ctx={{ items: [{ name: "a.txt", path: "/tmp/a.txt" }], index: 0 }}
					canPrev={false}
					canNext={false}
					onClose={close}
					enableKeyboard
				/>
			</Provider>,
		);
		expect(screen.getByRole("status").textContent).toContain("fileEditor.loading");
		expect(screen.getByRole("heading", { name: "a.txt" })).not.toBeNull();
		expect(screen.getByRole("button", { name: "fileEditor.close" })).not.toBeNull();
		expect(work.load).not.toHaveBeenCalled();
		await userEvent.keyboard("{Escape}");
		expect(close).toHaveBeenCalledOnce();
		mounted.unmount();
		await act(async () => paint.resolve());
		expect(work.load).not.toHaveBeenCalled();
		expect(work.mount).not.toHaveBeenCalled();
	});

	it("does not mount a loaded editor for a closed file or a replaced target", async () => {
		work.paint.mockResolvedValue("painted");
		const loading = deferred<typeof EditableTextFileView>();
		work.load.mockReturnValue(loading.promise);
		const store = createStore();
		const body = (path: string) => (
			<Provider store={store}>
				<PreviewBody item={{ name: path.split("/").pop() ?? path, path }} editable />
			</Provider>
		);
		const mounted = render(body("/old/a.txt"));
		await waitFor(() => expect(work.load).toHaveBeenCalledTimes(1));
		mounted.rerender(body("/new/b.txt"));
		await waitFor(() => expect(work.load).toHaveBeenCalledTimes(2));
		await act(async () => loading.resolve(Editor));
		expect(await screen.findByText("Editing /new/b.txt")).not.toBeNull();
		expect(work.mount.mock.calls).toEqual([["/new/b.txt"]]);
		mounted.unmount();
	});

	it("keeps a failed load local and lets the user retry successfully", async () => {
		work.paint.mockResolvedValue("painted");
		work.load.mockRejectedValueOnce(new Error("chunk unavailable")).mockResolvedValue(Editor);
		render(
			<Provider>
				<PreviewBody item={{ name: "a.txt", path: "/tmp/a.txt" }} editable />
			</Provider>,
		);
		expect((await screen.findByRole("alert")).textContent).toContain("fileEditor.errorLoadEditor");
		await userEvent.click(screen.getByRole("button", { name: "fileEditor.retry" }));
		expect(await screen.findByText("Editing /tmp/a.txt")).not.toBeNull();
		expect(work.load).toHaveBeenCalledTimes(2);
	});

	it("ignores a module that completes after its preview has closed", async () => {
		work.paint.mockResolvedValue("painted");
		const loading = deferred<typeof EditableTextFileView>();
		work.load.mockReturnValue(loading.promise);
		const mounted = render(
			<Provider>
				<PreviewBody item={{ name: "a.txt", path: "/tmp/a.txt" }} editable />
			</Provider>,
		);
		await waitFor(() => expect(work.load).toHaveBeenCalledOnce());
		mounted.unmount();
		await act(async () => loading.resolve(Editor));
		expect(work.mount).not.toHaveBeenCalled();
	});
});
