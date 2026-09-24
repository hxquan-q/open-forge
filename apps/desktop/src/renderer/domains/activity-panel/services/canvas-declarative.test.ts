// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { chartValueRange, parseCanvasChart } from "./canvas-chart";
import { parseCanvasChecklist } from "./canvas-checklist";
import { groupCanvasDiffFiles } from "./canvas-diff";

describe("parseCanvasChart", () => {
	it("解析四种图型并把序列补齐到 labels 长度", () => {
		const spec = parseCanvasChart(
			JSON.stringify({
				type: "line",
				title: "月度",
				labels: ["1月", "2月", "3月"],
				series: [{ name: "收入", values: [12, 18] }],
			}),
		);
		expect(spec).toMatchObject({ type: "line", title: "月度", labels: ["1月", "2月", "3月"] });
		expect(spec?.series).toEqual([{ name: "收入", values: [12, 18, 0] }]);

		for (const type of ["line", "bar", "pie", "area"] as const) {
			expect(parseCanvasChart(JSON.stringify({ type, labels: ["a"], series: [{ values: [1] }] }))?.type).toBe(type);
		}
	});

	it("缺 labels 时用序号补名，缺 name 时用序号命名序列", () => {
		const spec = parseCanvasChart(JSON.stringify({ type: "bar", series: [{ values: [5, 7] }] }));
		expect(spec?.labels).toEqual(["1", "2"]);
		expect(spec?.series[0]?.name).toBe("#1");
	});

	it("结构不符或非法 JSON 返回 null（由预览层降级）", () => {
		expect(parseCanvasChart("{not json")).toBeNull();
		expect(parseCanvasChart("[]")).toBeNull();
		expect(parseCanvasChart(JSON.stringify({ type: "radar", series: [{ values: [1] }] }))).toBeNull();
		expect(parseCanvasChart(JSON.stringify({ type: "line" }))).toBeNull();
		expect(parseCanvasChart(JSON.stringify({ type: "line", series: [{ values: ["n/a"] }] }))).toBeNull();
	});

	it("取值域以 0 为基准并保证非零跨度", () => {
		const spec = parseCanvasChart(
			JSON.stringify({ type: "line", labels: ["a", "b"], series: [{ values: [-3, 9] }] }),
		);
		expect(spec).not.toBeNull();
		if (!spec) return;
		expect(chartValueRange(spec)).toEqual({ min: -3, max: 9 });
		expect(chartValueRange({ type: "line", labels: [], series: [] })).toEqual({ min: 0, max: 1 });
	});
});

describe("parseCanvasChecklist", () => {
	it("归一完成态与进行态，其余落待开始", () => {
		const spec = parseCanvasChecklist(
			JSON.stringify({
				title: "发版清单",
				items: [
					{ label: "跑测试", status: "done" },
					{ label: "打包", status: "in_progress", detail: "签名中" },
					{ label: "灰度" },
					{ text: "只看 text 字段", status: "passed" },
				],
			}),
		);
		expect(spec?.title).toBe("发版清单");
		expect(spec?.items).toEqual([
			{ label: "跑测试", status: "done" },
			{ label: "打包", status: "active", detail: "签名中" },
			{ label: "灰度", status: "todo" },
			{ label: "只看 text 字段", status: "done" },
		]);
	});

	it("字符串条目按待开始处理，结构不符返回 null", () => {
		expect(parseCanvasChecklist(JSON.stringify({ items: ["写文档"] }))?.items).toEqual([
			{ label: "写文档", status: "todo" },
		]);
		expect(parseCanvasChecklist("{not json")).toBeNull();
		expect(parseCanvasChecklist(JSON.stringify({ items: [] }))).toBeNull();
		expect(parseCanvasChecklist(JSON.stringify({ items: [{ detail: "无标签" }] }))).toBeNull();
	});
});

describe("groupCanvasDiffFiles", () => {
	const diff = [
		"diff --git a/src/a.ts b/src/a.ts",
		"--- a/src/a.ts",
		"+++ b/src/a.ts",
		"@@ -1 +1,2 @@",
		"-old",
		"+new",
		"+extra",
		"diff --git a/src/b.ts b/src/b.ts",
		"--- a/src/b.ts",
		"+++ b/src/b.ts",
		"@@ -1 +1 @@",
		"-gone",
		"+kept",
	].join("\n");

	it("按文件切开并统计增删行", () => {
		const files = groupCanvasDiffFiles(diff);
		expect(files.map((file) => file.path)).toEqual(["src/a.ts", "src/b.ts"]);
		expect(files[0]).toMatchObject({ added: 2, removed: 1 });
		expect(files[1]).toMatchObject({ added: 1, removed: 1 });
		expect(files[0]?.diff.startsWith("diff --git a/src/a.ts")).toBe(true);
		expect(files[1]?.diff.startsWith("diff --git a/src/b.ts")).toBe(true);
	});

	it("没有 diff --git 头时按 +++ 路径收成单个文件，空输入返回空数组", () => {
		const single = groupCanvasDiffFiles("--- a/only.md\n+++ b/only.md\n@@ -1 +1 @@\n-a\n+b\n");
		expect(single).toHaveLength(1);
		expect(single[0]).toMatchObject({ path: "only.md", added: 1, removed: 1 });
		expect(groupCanvasDiffFiles("")).toEqual([]);
	});
});
