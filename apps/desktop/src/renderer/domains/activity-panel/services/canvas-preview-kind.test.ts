// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { canvasPreviewExtension, resolveCanvasPreviewKind } from "./canvas-preview-kind";

describe("resolveCanvasPreviewKind", () => {
	it("把 Markdown 与 HTML 从 contentType / 文件名分开，其余当代码", () => {
		expect(resolveCanvasPreviewKind({ contentType: "text/markdown" })).toBe("markdown");
		expect(resolveCanvasPreviewKind({ title: "notes.md" })).toBe("markdown");
		expect(resolveCanvasPreviewKind({ contentType: "text/html" })).toBe("html");
		expect(resolveCanvasPreviewKind({ uri: "file:///tmp/v1.html" })).toBe("html");
		expect(resolveCanvasPreviewKind({ contentType: "text/plain", title: "main.ts" })).toBe("code");
	});
});

describe("canvasPreviewExtension", () => {
	it("优先标题或路径上的后缀，再按预览类型兜底", () => {
		expect(canvasPreviewExtension({ title: "报告.md" })).toBe(".md");
		expect(canvasPreviewExtension({ contentType: "text/html", title: "预览" })).toBe(".html");
		expect(canvasPreviewExtension({ contentType: "application/json" })).toBe(".json");
	});
});
