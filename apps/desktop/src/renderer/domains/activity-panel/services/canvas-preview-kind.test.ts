// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { CANVAS_DATA_GRID_JSON_CONTENT_TYPE } from "./canvas-data-grid";
import { canvasPreviewExtension, resolveCanvasPreviewKind } from "./canvas-preview-kind";

describe("resolveCanvasPreviewKind", () => {
	it("把 Markdown 与 HTML 从 contentType / 文件名分开，其余当代码", () => {
		expect(resolveCanvasPreviewKind({ contentType: "text/markdown" })).toBe("markdown");
		expect(resolveCanvasPreviewKind({ title: "notes.md" })).toBe("markdown");
		expect(resolveCanvasPreviewKind({ contentType: "text/html" })).toBe("html");
		expect(resolveCanvasPreviewKind({ uri: "file:///tmp/v1.html" })).toBe("html");
		expect(resolveCanvasPreviewKind({ contentType: "text/plain", title: "main.ts" })).toBe("code");
	});

	it("表格类 artifact 走 data-grid，普通 JSON 与 Markdown 仍按既有规则", () => {
		expect(resolveCanvasPreviewKind({ contentType: "text/csv" })).toBe("data-grid");
		expect(resolveCanvasPreviewKind({ contentType: "text/tab-separated-values" })).toBe("data-grid");
		expect(resolveCanvasPreviewKind({ contentType: CANVAS_DATA_GRID_JSON_CONTENT_TYPE })).toBe("data-grid");
		expect(resolveCanvasPreviewKind({ title: "销售明细.csv" })).toBe("data-grid");
		expect(resolveCanvasPreviewKind({ uri: "file:///tmp/rows.tsv" })).toBe("data-grid");
		// `.json` 后缀不再等于表格：普通 JSON artifact 不能从代码预览变成表格。
		expect(resolveCanvasPreviewKind({ contentType: "application/json", title: "config.json" })).toBe("code");
		// HTML / Markdown 的既有优先级不变。
		expect(resolveCanvasPreviewKind({ contentType: "text/markdown", title: "report.csv.md" })).toBe("markdown");
	});
});

describe("canvasPreviewExtension", () => {
	it("优先标题或路径上的后缀，再按预览类型兜底", () => {
		expect(canvasPreviewExtension({ title: "报告.md" })).toBe(".md");
		expect(canvasPreviewExtension({ contentType: "text/html", title: "预览" })).toBe(".html");
		expect(canvasPreviewExtension({ contentType: "application/json" })).toBe(".json");
	});

	it("表格兜底后缀跟上具体格式", () => {
		expect(canvasPreviewExtension({ contentType: "text/csv", title: "销售数据" })).toBe(".csv");
		expect(canvasPreviewExtension({ contentType: "text/tab-separated-values", title: "导出" })).toBe(".tsv");
		expect(canvasPreviewExtension({ contentType: CANVAS_DATA_GRID_JSON_CONTENT_TYPE, title: "导出" })).toBe(".json");
	});
});
