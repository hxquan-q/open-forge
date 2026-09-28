// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { availableCanvasMacros, CANVAS_MACROS, isCanvasPreviewEditable } from "./canvas-macros";

describe("availableCanvasMacros", () => {
	it("代码 artifact 只给代码类宏，Markdown 只给文档类宏", () => {
		expect(availableCanvasMacros("code").map((macro) => macro.id)).toEqual([
			"add-comments",
			"add-logs",
			"fix-bugs",
			"generate-tests",
		]);
		expect(availableCanvasMacros("markdown").map((macro) => macro.id)).toEqual([
			"make-shorter",
			"make-longer",
			"polish",
		]);
	});

	it("HTML 与 data-grid 没有就地编辑，因此不提供宏", () => {
		expect(availableCanvasMacros("html")).toEqual([]);
		expect(availableCanvasMacros("data-grid")).toEqual([]);
	});

	it("宏 id 唯一且都带 solar 线性图标", () => {
		expect(new Set(CANVAS_MACROS.map((macro) => macro.id)).size).toBe(CANVAS_MACROS.length);
		for (const macro of CANVAS_MACROS) {
			expect(macro.icon).toMatch(/^icon-\[solar--[a-z0-9-]+-linear\]$/);
		}
	});
});

describe("isCanvasPreviewEditable", () => {
	it("只有 Markdown 与代码可编辑", () => {
		expect(isCanvasPreviewEditable("markdown")).toBe(true);
		expect(isCanvasPreviewEditable("code")).toBe(true);
		expect(isCanvasPreviewEditable("html")).toBe(false);
		expect(isCanvasPreviewEditable("data-grid")).toBe(false);
	});
});
