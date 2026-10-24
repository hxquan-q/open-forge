// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

const editor = vi.hoisted(() => ({ evaluations: 0 }));
vi.mock("./TextCodeEditorView", () => {
	editor.evaluations += 1;
	return { TextCodeEditorView: () => null };
});

import * as core from "./core";

describe("lightweight file preview entry", () => {
	it("provides preview UI and pure language helpers without evaluating the editor", () => {
		expect(core.PreviewBodyView).toBeTypeOf("function");
		expect(core.FilePreviewView).toBeTypeOf("function");
		expect(core.getTextEditorLanguageId("file.tsx")).toBe("tsx");
		expect(core.normalizeFileExtension(".TS")).toBe("ts");
		expect(editor.evaluations).toBe(0);
		expect(core).not.toHaveProperty("TextCodeEditorView");
		expect(core).not.toHaveProperty("TextFileEditorView");
		expect(core).not.toHaveProperty("getTextEditorLanguageExtension");
	});

	it("preserves the legacy editor and preview exports for existing consumers", async () => {
		const legacy = await import("./index");
		expect(legacy.PreviewBodyView).toBe(core.PreviewBodyView);
		expect(legacy.getTextEditorLanguageId).toBe(core.getTextEditorLanguageId);
		expect(legacy.TextCodeEditorView).toBeTypeOf("function");
		expect(legacy.TextFileEditorView).toBeTypeOf("function");
		expect(legacy.getTextEditorLanguageExtension).toBeTypeOf("function");
		expect(editor.evaluations).toBe(1);
	});
});
