// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import test from "node:test";
import { extractReleaseNotes } from "./resolve-release-info.mjs";

test("extractReleaseNotes strips the title and metadata before the first section", () => {
	const markdown = `# Open Forge 0.1.5

发布日期：待定

Upstream baseline: upstream/dev@405fdcda13fdc3ed4e9128e0abe52164440037dd

## 新增

- 功能 A

## 修复

- 修复 B
`;

	assert.equal(extractReleaseNotes(markdown), "## 新增\n\n- 功能 A\n\n## 修复\n\n- 修复 B");
});

test("extractReleaseNotes returns undefined when there is no section heading", () => {
	assert.equal(extractReleaseNotes("# Open Forge 1.2.3\n\n发布日期：待定\n"), undefined);
	assert.equal(extractReleaseNotes("   \n"), undefined);
});

test("extractReleaseNotes keeps HTML comment literals inside code examples intact", () => {
	const markdown = [
		"# Open Forge 1.2.3",
		"",
		"## 修复",
		"",
		"- 内联 `<!-- inline -->` 示例",
		"",
		"```html",
		"<!-- block -->",
		"```",
		"",
	].join("\n");

	assert.equal(
		extractReleaseNotes(markdown),
		["## 修复", "", "- 内联 `<!-- inline -->` 示例", "", "```html", "<!-- block -->", "```"].join("\n"),
	);
});

test("extractReleaseNotes strips standalone comment marker lines", () => {
	const markdown = "## 修复\n\n- A\n\n<!-- 本文件由 fragments/ 汇编生成：请改碎片，不要直接改这里。 -->\n";

	assert.equal(extractReleaseNotes(markdown), "## 修复\n\n- A");
});

test("extractReleaseNotes normalizes CRLF line endings", () => {
	assert.equal(extractReleaseNotes("# T\r\n\r\n## 新增\r\n\r\n- A\r\n"), "## 新增\n\n- A");
});
