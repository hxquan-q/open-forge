// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	CANVAS_ARTIFACT_SELECTION_SCHEMA,
	CANVAS_SELECTION_EXCERPT_LIMIT,
	createCanvasSelectionAttachment,
	excerptCanvasSelection,
} from "./canvas-selection-attachment";

describe("canvas selection attachment", () => {
	it("把选区收成带 artifactId/version 的草稿附件载荷", () => {
		const attachment = createCanvasSelectionAttachment({
			artifactId: "art-1",
			version: 3,
			excerpt: "  请把 第二节 改成要点列表  ",
			title: "调研摘要",
			kind: "document",
			contentType: "text/markdown",
		});
		expect(attachment.id).toBe("canvas:art-1:v3");
		expect(attachment.lifecycle).toBe("once");
		expect(attachment.context).toEqual({
			schema: CANVAS_ARTIFACT_SELECTION_SCHEMA,
			version: 1,
			payload: {
				artifactId: "art-1",
				version: 3,
				excerpt: "请把 第二节 改成要点列表",
				title: "调研摘要",
				kind: "document",
				contentType: "text/markdown",
			},
		});
		expect(attachment.instructions?.[0]).toContain("artifactId=art-1");
		expect(attachment.instructions?.[0]).toContain("version=3");
	});

	it("超长选区截断，避免把整篇正文塞进附件", () => {
		const excerpt = excerptCanvasSelection("字".repeat(CANVAS_SELECTION_EXCERPT_LIMIT + 20));
		expect(excerpt.endsWith("…")).toBe(true);
		expect(excerpt.length).toBe(CANVAS_SELECTION_EXCERPT_LIMIT);
	});

	it("表格选区额外带上行列范围摘要，既有字段不变", () => {
		const attachment = createCanvasSelectionAttachment({
			artifactId: "art-2",
			version: 1,
			excerpt: "苹果 3",
			title: "销售明细",
			kind: "data-grid",
			contentType: "text/csv",
			range: "第 1-2 行 · 第 1-2 列",
		});
		expect(attachment.id).toBe("canvas:art-2:v1");
		expect(attachment.context?.payload).toEqual({
			artifactId: "art-2",
			version: 1,
			excerpt: "苹果 3",
			title: "销售明细",
			kind: "data-grid",
			contentType: "text/csv",
			range: "第 1-2 行 · 第 1-2 列",
		});
	});
});
