// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { stripReleaseNoteHeader } from "./release-note-header";

describe("stripReleaseNoteHeader", () => {
	it("keeps only the body from the first section heading", () => {
		const markdown = [
			"# Open Forge 0.1.5",
			"",
			"发布日期：待定",
			"",
			"Upstream baseline: upstream/dev@abc",
			"",
			"## 新增",
			"",
			"- 功能 A",
		].join("\n");

		expect(stripReleaseNoteHeader(markdown)).toBe("## 新增\n\n- 功能 A");
	});

	it("keeps HTML comment literals inside code examples intact", () => {
		const markdown = ["## 修复", "", "- 内联 `<!-- inline -->` 示例", "", "```html", "<!-- block -->", "```"].join(
			"\n",
		);

		expect(stripReleaseNoteHeader(markdown)).toBe(markdown);
	});

	it("strips standalone comment marker lines", () => {
		const markdown = "## 修复\n\n- A\n\n<!-- 本文件由 fragments/ 汇编生成：请改碎片，不要直接改这里。 -->\n";

		expect(stripReleaseNoteHeader(markdown)).toBe("## 修复\n\n- A");
	});

	it("returns an empty string when there is no section heading", () => {
		expect(stripReleaseNoteHeader("# Open Forge 1.2.3\n\n发布日期：待定\n")).toBe("");
	});

	it("normalizes CRLF line endings", () => {
		expect(stripReleaseNoteHeader("# T\r\n\r\n## 新增\r\n\r\n- A\r\n")).toBe("## 新增\n\n- A");
	});
});
