// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { joinCanvasTargetPath, suggestedCanvasSaveFileName } from "./canvas-save-filename";

describe("suggestedCanvasSaveFileName", () => {
	it("用标题生成可保存文件名，并补上预览类型后缀", () => {
		expect(suggestedCanvasSaveFileName({ title: "调研摘要", contentType: "text/markdown" })).toBe("调研摘要.md");
		expect(suggestedCanvasSaveFileName({ title: "preview.html", contentType: "text/html" })).toBe("preview.html");
		expect(suggestedCanvasSaveFileName({ title: "a<b>:c", contentType: "text/plain" })).toBe("a-b--c.txt");
	});
});

describe("joinCanvasTargetPath", () => {
	it("按目录分隔符拼接，不覆盖调用方给出的盘符风格", () => {
		expect(joinCanvasTargetPath("C:\\work\\app", "notes.md")).toBe("C:\\work\\app\\notes.md");
		expect(joinCanvasTargetPath("/tmp/app/", "notes.md")).toBe("/tmp/app/notes.md");
	});
});
