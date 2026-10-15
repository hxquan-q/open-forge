// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasDataGridLabels, CanvasDataGridSelection } from "../../hooks/useCanvasTabModel";
import type { CanvasDataGridFormat } from "../../services/canvas-data-grid";
import { CanvasDataGridPreview } from "./CanvasDataGridPreview";

const labels: CanvasDataGridLabels = {
	table: "数据表格",
	filterPlaceholder: "筛选…",
	sortToAscending: "按升序排列",
	sortToDescending: "按降序排列",
	sortToDefault: "恢复默认顺序",
	rowsPerPage: "每页行数",
	previousPage: "上一页",
	nextPage: "下一页",
	empty: "没有可解析的表格数据",
	noMatch: "没有匹配的行",
	pageSummary: (page, pageCount, rows) => `共 ${rows} 行 · 第 ${page}/${pageCount} 页`,
};

// 默认顺序 苹果(20) → Banana(10) → 樱桃(30)，三个排序态的首页首行互不相同。
const SORTABLE_CSV = "id,name,qty\n1,苹果,20\n2,Banana,10\n3,樱桃,30\n";

function csvContent(rowCount: number): string {
	const lines = ["id,name,qty"];
	for (let index = 1; index <= rowCount; index += 1) {
		lines.push(`${index},商品${index},${index * 3}`);
	}
	return lines.join("\n");
}

function renderGrid(input: { readonly content?: string; readonly format?: CanvasDataGridFormat } = {}) {
	const onSelectionChange = vi.fn<(selection: CanvasDataGridSelection) => void>();
	render(
		<CanvasDataGridPreview
			content={input.content ?? SORTABLE_CSV}
			format={input.format ?? "csv"}
			labels={labels}
			onSelectionChange={onSelectionChange}
		/>,
	);
	return { onSelectionChange };
}

function dataRows(): HTMLElement[][] {
	return screen
		.getAllByRole("row")
		.slice(1)
		.map((row) => within(row).queryAllByRole("cell"));
}

function firstCellText(): string {
	return dataRows()[0]?.[0]?.textContent ?? "";
}

function columnHeader(index: number): HTMLElement {
	return screen.getAllByRole("columnheader")[index] as HTMLElement;
}

describe("canvas data grid preview", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("打开 CSV 后渲染表头与首页 20 行，并显示行数与页码摘要", () => {
		renderGrid({ content: csvContent(30) });
		expect(screen.getByRole("table", { name: "数据表格" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "qty" })).toBeTruthy();
		expect(dataRows()).toHaveLength(20);
		expect(screen.getByText("共 30 行 · 第 1/2 页")).toBeTruthy();
	});

	it("列头三态排序：升序 → 降序 → 回到默认顺序", async () => {
		renderGrid();
		const qtyHeader = screen.getByRole("button", { name: "qty" });
		expect(firstCellText()).toBe("1");
		expect(columnHeader(2).getAttribute("aria-sort")).toBe("none");

		await userEvent.click(qtyHeader);
		expect(firstCellText()).toBe("2");
		expect(columnHeader(2).getAttribute("aria-sort")).toBe("ascending");

		await userEvent.click(qtyHeader);
		expect(firstCellText()).toBe("3");
		expect(columnHeader(2).getAttribute("aria-sort")).toBe("descending");

		await userEvent.click(qtyHeader);
		expect(firstCellText()).toBe("1");
		expect(columnHeader(2).getAttribute("aria-sort")).toBe("none");
	});

	it("过滤框按关键词收窄行数，无匹配时给出空提示", async () => {
		renderGrid({ content: csvContent(30) });
		const filter = screen.getByRole("searchbox", { name: "筛选…" });

		await userEvent.type(filter, "商品15");
		expect(dataRows()).toHaveLength(1);
		expect(firstCellText()).toBe("15");
		expect(screen.getByText("共 1 行 · 第 1/1 页")).toBeTruthy();

		await userEvent.clear(filter);
		await userEvent.type(filter, "不存在");
		expect(screen.queryByText("商品15")).toBeNull();
		expect(screen.getByText("没有匹配的行")).toBeTruthy();
		expect(screen.getByText("共 0 行 · 第 1/1 页")).toBeTruthy();
	});

	it("分页可翻页，切换每页行数后回到第一页", async () => {
		renderGrid({ content: csvContent(30) });
		expect(dataRows()).toHaveLength(20);

		await userEvent.click(screen.getByRole<HTMLButtonElement>("button", { name: "下一页" }));
		expect(dataRows()).toHaveLength(10);
		expect(firstCellText()).toBe("21");
		expect(screen.getByRole<HTMLButtonElement>("button", { name: "下一页" }).disabled).toBe(true);

		await userEvent.click(screen.getByRole("button", { name: "50" }));
		expect(dataRows()).toHaveLength(30);
		expect(firstCellText()).toBe("1");
		expect(screen.getByText("共 30 行 · 第 1/1 页")).toBeTruthy();
	});

	it("框选单元格后回传文本摘录与行列范围", async () => {
		const { onSelectionChange } = renderGrid();
		const startCell = screen.getByText("苹果").closest("td");
		const endCell = screen.getByText("Banana").closest("td");
		if (!startCell || !endCell) throw new Error("单元格未渲染");

		vi.spyOn(window, "getSelection").mockReturnValue({
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "苹果 Banana",
			getRangeAt: () => ({
				commonAncestorContainer: startCell,
				startContainer: startCell,
				endContainer: endCell,
			}),
		} as unknown as Selection);

		await userEvent.click(endCell);
		expect(onSelectionChange).toHaveBeenLastCalledWith({
			text: "苹果 Banana",
			range: { rowStart: 1, rowEnd: 2, columnStart: 2, columnEnd: 2 },
		});
	});

	it("选区解析不到单元格时只回传文本，不编造行列范围", async () => {
		const { onSelectionChange } = renderGrid();
		const grid = screen.getByTestId("canvas-data-grid");
		vi.spyOn(window, "getSelection").mockReturnValue({
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "苹果",
			getRangeAt: () => ({
				commonAncestorContainer: grid,
				startContainer: grid,
				endContainer: grid,
			}),
		} as unknown as Selection);

		await userEvent.click(grid);
		expect(onSelectionChange).toHaveBeenLastCalledWith({ text: "苹果" });
	});

	it("截断单元格带 title，悬停可看完整内容", () => {
		renderGrid();
		expect(screen.getByText("苹果").closest("td")?.getAttribute("title")).toBe("苹果");
	});

	it("行列 JSON artifact 也渲染成表格", () => {
		renderGrid({
			content: JSON.stringify({ columns: ["名称", "数量"], rows: [["苹果", 3]] }),
			format: "json",
		});
		expect(screen.getByRole("columnheader", { name: "名称" })).toBeTruthy();
		expect(screen.getByText("苹果")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
	});

	it("没有可解析数据时显示空状态而不是空表格", () => {
		renderGrid({ content: "" });
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.getByText("没有可解析的表格数据")).toBeTruthy();
	});
});
