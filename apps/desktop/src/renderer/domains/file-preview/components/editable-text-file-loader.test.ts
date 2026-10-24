// Copyright The Open Forge contributors.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function Editor() {
	return createElement("div");
}

describe("editable preview module cache", () => {
	beforeEach(() => vi.resetModules());
	afterEach(() => vi.doUnmock("./EditableTextFileView"));

	it("shares a successful load between concurrent and later previews", async () => {
		const evaluate = vi.fn(() => ({ EditableTextFileView: Editor }));
		vi.doMock("./EditableTextFileView", evaluate);
		const { loadEditableTextFileView } = await import("./editable-text-file-loader");
		const first = loadEditableTextFileView();
		expect(loadEditableTextFileView()).toBe(first);
		expect(await first).toBe(Editor);
		expect(await loadEditableTextFileView()).toBe(Editor);
		expect(evaluate).toHaveBeenCalledOnce();
	});

	it("clears a failed module promise so the next attempt can load again", async () => {
		vi.doMock("./EditableTextFileView", () => {
			throw new Error("chunk unavailable");
		});
		const { loadEditableTextFileView } = await import("./editable-text-file-loader");
		await expect(loadEditableTextFileView()).rejects.toBeInstanceOf(Error);
		vi.doMock("./EditableTextFileView", () => ({ EditableTextFileView: Editor }));
		expect(await loadEditableTextFileView()).toBe(Editor);
	});
});
