// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	parseReleaseNoteItems,
	SECTION_LABELS,
	SOFT_LIMITS,
	validateReleaseNoteContent,
} from "./release-notes-format.mjs";

// 不用 { sections = {...} } 解构默认值：vitest 的转换链对「含非 ASCII 键的默认对象」
// 求值有 bug（实参被丢弃、取回默认值），普通参数函数不受影响。
function validNote(sections) {
	const use = sections ?? { 新增: ["首次打开速度提升一倍"] };
	const body = Object.entries(use)
		.map(([label, items]) => [`## ${label}`, ...items.map((item) => `- ${item}`)].join("\n"))
		.join("\n\n");
	return [
		"# Open Forge 0.1.6",
		"发布日期：待定",
		"Upstream baseline: upstream/dev@641aaf694",
		"",
		body,
		"",
	].join("\n");
}

describe("parseReleaseNoteItems", () => {
	it("按小节归集条目并跳过元信息行", () => {
		const parsed = parseReleaseNoteItems(
			validNote({ 新增: ["甲"], 修复: ["乙", "丙"] }),
		);
		expect(parsed.title).toBe("Open Forge 0.1.6");
		expect(parsed.sections.map((section) => section.label)).toEqual(["新增", "修复"]);
		expect(parsed.sections[1].items.map((item) => item.text)).toEqual(["乙", "丙"]);
		expect(parsed.strayHeadings).toEqual([]);
		expect(parsed.strayBullets).toEqual([]);
	});
});

describe("validateReleaseNoteContent", () => {
	it("结构合法时无 problem、无 warning", () => {
		const { problems, warnings } = validateReleaseNoteContent(validNote());
		expect(problems).toEqual([]);
		expect(warnings).toEqual([]);
	});

	it("允许清单之外的 ## 判 problem", () => {
		const text = validNote() + "\n## English\n- stray\n";
		const { problems } = validateReleaseNoteContent(text);
		expect(problems.some((line) => line.includes('小节 "## English"'))).toBe(true);
		// 越位标题之后的条目跟随归入「小节外」
		expect(problems.some((line) => line.includes("不在任何"))).toBe(true);
	});

	it("任何 ## 之前的 - 条目判 problem", () => {
		const text = validNote().replace("## 新增", "- 散落的条目\n\n## 新增");
		const { problems } = validateReleaseNoteContent(text);
		expect(problems.some((line) => line.includes("散落的条目"))).toBe(true);
	});

	it.each(["TODO 待补充", "文案待补", "（占位）", "[占位]"])("占位记号 %s 判 problem", (marker) => {
		const { problems } = validateReleaseNoteContent(validNote({ 新增: [`某功能 ${marker}`] }));
		expect(problems.some((line) => line.includes("占位记号"))).toBe(true);
	});

	it("「占位符」作为正常措辞不判负", () => {
		const { problems } = validateReleaseNoteContent(
			validNote({ 修复: ["修复悬停提示显示 `%…%` 原始占位符的问题"] }),
		);
		expect(problems).toEqual([]);
	});

	it("空小节判 problem", () => {
		const { problems } = validateReleaseNoteContent(validNote({ 修复: [] }));
		expect(problems.some((line) => line.includes('小节 "## 修复" 为空'))).toBe(true);
	});

	it("超长小节与超长条目只给 warning，不判负", () => {
		const many = Array.from({ length: SOFT_LIMITS.itemsPerSection + 1 }, (_, i) => `条目 ${i}`);
		const long = "很".repeat(SOFT_LIMITS.itemLength + 1);
		const { problems, warnings } = validateReleaseNoteContent(
			validNote({ 新增: many, 改进: [long] }),
		);
		expect(problems).toEqual([]);
		expect(warnings.some((line) => line.includes(`${SOFT_LIMITS.itemsPerSection + 1} 条`))).toBe(true);
		expect(warnings.some((line) => line.includes(`${SOFT_LIMITS.itemLength + 1} 字`))).toBe(true);
	});

	it.each([
		["`plugin-protocol.ts` 的转发清单补齐", "文件名"],
		["调整 apps/desktop 下的面板入口", "仓库路径"],
		["修复 #123 提到的闪退", "issue/PR 编号"],
	])("内部引用 %s 只给 warning", (item, why) => {
		const { problems, warnings } = validateReleaseNoteContent(validNote({ 修复: [item] }));
		expect(problems).toEqual([]);
		expect(warnings.some((line) => line.includes(why))).toBe(true);
	});

	it("工程黑话只给 warning", () => {
		const { problems, warnings } = validateReleaseNoteContent(
			validNote({ 改进: ["完成设置页重构与类型检查"] }),
		);
		expect(problems).toEqual([]);
		expect(warnings.some((line) => line.includes("内部术语"))).toBe(true);
	});

	it("SECTION_LABELS 覆盖本地四段式且不含上游双语节", () => {
		expect(SECTION_LABELS).toEqual(["新增", "改进", "修复", "其他"]);
	});
});
