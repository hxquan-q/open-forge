// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { defaultEditorMode } from "./EditableTextFileView";

describe("defaultEditorMode", () => {
	it("HTML 族默认代码详情：效果预览与浏览器页签定位重合", () => {
		expect(defaultEditorMode("html")).toBe("edit");
		expect(defaultEditorMode("htm")).toBe("edit");
		expect(defaultEditorMode("xhtml")).toBe("edit");
	});

	it("Markdown 族保留预览默认；其余文本格式本就代码详情", () => {
		expect(defaultEditorMode("md")).toBe("preview");
		expect(defaultEditorMode("mdx")).toBe("preview");
		expect(defaultEditorMode("markdown")).toBe("preview");
		expect(defaultEditorMode("ts")).toBe("edit");
		expect(defaultEditorMode("json")).toBe("edit");
	});
});
