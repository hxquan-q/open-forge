// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCanvasChart } from "../../services/canvas-chart";
import { parseCanvasChecklist } from "../../services/canvas-checklist";
import { groupCanvasDiffFiles } from "../../services/canvas-diff";
import { CanvasChartPreview } from "./CanvasChartPreview";
import { CanvasChecklistPreview } from "./CanvasChecklistPreview";
import { CanvasStructuredDiffPreview } from "./CanvasStructuredDiffPreview";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const chartLabels = { empty: "chart-empty", chart: "chart-name" };
const checklistLabels = { empty: "checklist-empty", done: "done", active: "active", todo: "todo" };
const diffLabels = {
	empty: "diff-empty",
	expand: (path: string) => `expand:${path}`,
	collapse: (path: string) => `collapse:${path}`,
};

function renderChart(spec: ReturnType<typeof parseCanvasChart>): void {
	if (!spec) throw new Error("expected chart spec");
	render(<CanvasChartPreview spec={spec} labels={chartLabels} />);
}

describe("canvas declarative previews", () => {
	afterEach(() => cleanup());

	it("折线 / 面积 / 柱状 / 饼图各自渲染对应图形，取色走 CSS token", () => {
		const spec = parseCanvasChart(
			JSON.stringify({
				type: "line",
				labels: ["1月", "2月"],
				series: [
					{ name: "收入", values: [1, 2] },
					{ name: "成本", values: [2, 1] },
				],
			}),
		);
		renderChart(spec);
		expect(screen.getByRole("img").querySelectorAll("polyline")).toHaveLength(2);
		expect(screen.getByRole("img").querySelector("polyline")?.getAttribute("stroke")).toBe("var(--chart-1)");
		expect(screen.getByText("收入")).toBeTruthy();
		expect(screen.getByText("成本")).toBeTruthy();
		cleanup();

		renderChart(parseCanvasChart(JSON.stringify({ type: "area", labels: ["a"], series: [{ values: [1] }] })));
		expect(screen.getByRole("img").querySelectorAll("polygon")).toHaveLength(1);
		cleanup();

		renderChart(
			parseCanvasChart(JSON.stringify({ type: "bar", labels: ["a", "b"], series: [{ values: [1, 2] }] })),
		);
		expect(screen.getByRole("img").querySelectorAll("rect")).toHaveLength(2);
		cleanup();

		renderChart(
			parseCanvasChart(JSON.stringify({ type: "pie", labels: ["a", "b"], series: [{ values: [3, 1] }] })),
		);
		expect(screen.getByRole("img").querySelectorAll("path")).toHaveLength(2);
		expect(screen.getByText("75%")).toBeTruthy();
	});

	it("饼图图例按类目着色并给出类目名，SVG 有可访问名", () => {
		renderChart(
			parseCanvasChart(
				JSON.stringify({ type: "pie", labels: ["桌面端", "移动端"], series: [{ values: [3, 1] }] }),
			),
		);
		// 类目名是饼图唯一能把扇区对上号的文字，必须出现在图例里。
		expect(screen.getByText("桌面端")).toBeTruthy();
		expect(screen.getByText("移动端")).toBeTruthy();
		expect(screen.queryByText("#1")).toBeNull();
		expect(screen.getByRole("img", { name: "chart-name" })).toBeTruthy();
	});

	it("饼图图例只列出有实际份额的类目", () => {
		renderChart(
			parseCanvasChart(
				JSON.stringify({ type: "pie", labels: ["桌面端", "移动端"], series: [{ values: [3, 0] }] }),
			),
		);
		expect(screen.getByText("桌面端")).toBeTruthy();
		// 零份额类目没有对应扇区，图例里出现只会误导。
		expect(screen.queryByText("移动端")).toBeNull();
	});

	it("spec 带标题时 SVG 可访问名取标题", () => {
		renderChart(
			parseCanvasChart(
				JSON.stringify({ type: "line", title: "月度收入", labels: ["1月"], series: [{ values: [2] }] }),
			),
		);
		expect(screen.getByRole("img", { name: "月度收入" })).toBeTruthy();
	});

	it("清单按完成态 / 进行态 / 待开始渲染并显示明细", () => {
		const spec = parseCanvasChecklist(
			JSON.stringify({
				title: "发版清单",
				items: [
					{ label: "跑测试", status: "done" },
					{ label: "打包", status: "active", detail: "签名中" },
					{ label: "灰度" },
				],
			}),
		);
		if (!spec) throw new Error("expected checklist spec");
		render(<CanvasChecklistPreview spec={spec} labels={checklistLabels} />);

		expect(screen.getByText("发版清单")).toBeTruthy();
		expect(screen.getByText("跑测试")).toBeTruthy();
		expect(screen.getByText("签名中")).toBeTruthy();
		expect(screen.getAllByText("done")).toHaveLength(1);
		expect(screen.getAllByText("active")).toHaveLength(1);
		expect(screen.getAllByText("todo")).toHaveLength(1);
	});

	it("多文件 diff 按文件分组、显示增删行并可折叠", async () => {
		const files = groupCanvasDiffFiles(
			[
				"diff --git a/src/a.ts b/src/a.ts",
				"--- a/src/a.ts",
				"+++ b/src/a.ts",
				"@@ -1 +1,2 @@",
				"-old-a",
				"+new-a",
				"+extra-a",
				"diff --git a/src/b.ts b/src/b.ts",
				"--- a/src/b.ts",
				"+++ b/src/b.ts",
				"@@ -1 +1 @@",
				"-gone-b",
				"+kept-b",
			].join("\n"),
		);
		render(<CanvasStructuredDiffPreview files={files} labels={diffLabels} />);

		const sectionOf = (path: string): HTMLElement | null =>
			screen.getByText(path).closest("section") as HTMLElement | null;
		expect(sectionOf("src/a.ts")?.textContent).toContain("+2");
		expect(sectionOf("src/a.ts")?.textContent).toContain("-1");
		expect(sectionOf("src/a.ts")?.textContent).toContain("new-a");
		expect(sectionOf("src/b.ts")?.textContent).toContain("kept-b");

		await userEvent.click(screen.getByRole("button", { name: "collapse:src/a.ts" }));
		expect(sectionOf("src/a.ts")?.textContent).not.toContain("new-a");
		expect(sectionOf("src/b.ts")?.textContent).toContain("kept-b");

		await userEvent.click(screen.getByRole("button", { name: "expand:src/a.ts" }));
		expect(sectionOf("src/a.ts")?.textContent).toContain("new-a");
	});
});
