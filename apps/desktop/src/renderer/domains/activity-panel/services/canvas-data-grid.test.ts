// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	buildCanvasDataGridView,
	CANVAS_DATA_GRID_JSON_CONTENT_TYPE,
	canvasDataGridExtension,
	cycleCanvasDataGridSort,
	parseCanvasDataGrid,
	resolveCanvasDataGridFormat,
} from "./canvas-data-grid";

describe("resolveCanvasDataGridFormat", () => {
	it("只认表格 contentType 与 .csv / .tsv 后缀", () => {
		expect(resolveCanvasDataGridFormat({ contentType: "text/csv" })).toBe("csv");
		expect(resolveCanvasDataGridFormat({ contentType: "text/csv; charset=utf-8" })).toBe("csv");
		expect(resolveCanvasDataGridFormat({ contentType: "text/tab-separated-values" })).toBe("tsv");
		expect(resolveCanvasDataGridFormat({ contentType: CANVAS_DATA_GRID_JSON_CONTENT_TYPE })).toBe("json");
		expect(resolveCanvasDataGridFormat({ title: "销售明细.csv" })).toBe("csv");
		expect(resolveCanvasDataGridFormat({ uri: "file:///tmp/rows.tsv" })).toBe("tsv");
	});

	it("普通 JSON、Markdown 与未知类型不算表格", () => {
		expect(resolveCanvasDataGridFormat({ contentType: "application/json", title: "config.json" })).toBeNull();
		expect(resolveCanvasDataGridFormat({ contentType: "text/markdown", title: "报告.md" })).toBeNull();
		expect(resolveCanvasDataGridFormat({ contentType: "text/plain" })).toBeNull();
		expect(resolveCanvasDataGridFormat({})).toBeNull();
	});
});

describe("canvasDataGridExtension", () => {
	it("按具体格式给出「保存到项目」的后缀", () => {
		expect(canvasDataGridExtension("csv")).toBe(".csv");
		expect(canvasDataGridExtension("tsv")).toBe(".tsv");
		expect(canvasDataGridExtension("json")).toBe(".json");
		expect(canvasDataGridExtension(null)).toBe(".csv");
	});
});

describe("parseCanvasDataGrid", () => {
	it("首行做表头，其余做数据行", () => {
		const table = parseCanvasDataGrid("name,qty\n苹果,3\n香蕉,10\n", "csv");
		expect(table.headers).toEqual(["name", "qty"]);
		expect(table.rows).toEqual([
			["苹果", "3"],
			["香蕉", "10"],
		]);
	});

	it('处理引号包裹、字段内分隔符与换行、"" 转义与 CRLF', () => {
		const content = 'id,note\r\n1,"含,逗号"\r\n2,"第一行\n第二行"\r\n3,"说了""你好"""\r\n';
		expect(parseCanvasDataGrid(content, "csv").rows).toEqual([
			["1", "含,逗号"],
			["2", "第一行\n第二行"],
			["3", '说了"你好"'],
		]);
	});

	it("BOM、空字段与列数不齐按最长行对齐", () => {
		const table = parseCanvasDataGrid("\uFEFFa,b,c\n1,,3,4\n5,6\n", "csv");
		expect(table.headers).toEqual(["a", "b", "c", ""]);
		expect(table.rows).toEqual([
			["1", "", "3", "4"],
			["5", "6", "", ""],
		]);
	});

	it("空内容与空行不产生多余记录", () => {
		expect(parseCanvasDataGrid("", "csv")).toEqual({ headers: [], rows: [] });
		expect(parseCanvasDataGrid("\n", "csv")).toEqual({ headers: [], rows: [] });
		expect(parseCanvasDataGrid("a\n\nb\n", "csv")).toEqual({ headers: ["a"], rows: [["b"]] });
	});

	it("TSV 用制表符分隔", () => {
		const table = parseCanvasDataGrid("a\tb\n1\t2\n", "tsv");
		expect(table.headers).toEqual(["a", "b"]);
		expect(table.rows).toEqual([["1", "2"]]);
	});

	it("行列 JSON 支持 { columns, rows } 与数组的数组，非字符串单元格转文本", () => {
		const withColumns = parseCanvasDataGrid(
			JSON.stringify({
				columns: ["名称", "数量"],
				rows: [
					["苹果", 3],
					[null, true],
				],
			}),
			"json",
		);
		expect(withColumns.headers).toEqual(["名称", "数量"]);
		expect(withColumns.rows).toEqual([
			["苹果", "3"],
			["", "true"],
		]);
		const arrays = parseCanvasDataGrid(JSON.stringify([["a"], [1], [2]]), "json");
		expect(arrays.headers).toEqual(["a"]);
		expect(arrays.rows).toEqual([["1"], ["2"]]);
	});

	it("JSON 结构不符时返回空表而不是抛错", () => {
		expect(parseCanvasDataGrid("{not json", "json")).toEqual({ headers: [], rows: [] });
		expect(parseCanvasDataGrid(JSON.stringify({ rows: "nope" }), "json")).toEqual({ headers: [], rows: [] });
		expect(parseCanvasDataGrid("42", "json")).toEqual({ headers: [], rows: [] });
	});

	it("1000 行 × 10 列的 CSV 解析维持在可复现预算内", () => {
		const headers = Array.from({ length: 10 }, (_value, column) => `c${column}`).join(",");
		const lines = [headers];
		for (let row = 0; row < 1000; row += 1) {
			lines.push(Array.from({ length: 10 }, (_value, column) => `${row * column}`).join(","));
		}
		const startedAt = performance.now();
		const table = parseCanvasDataGrid(lines.join("\n"), "csv");
		const elapsedMs = performance.now() - startedAt;
		expect(table.headers.length).toBe(10);
		expect(table.rows.length).toBe(1000);
		// 16ms 是产品目标；这条断言守的是数量级回归（O(n²) 会把 1000×10 推到几百毫秒）。
		expect(elapsedMs).toBeLessThan(50);
		console.log(`[canvas-data-grid] 1000×10 CSV 解析 ${elapsedMs.toFixed(2)}ms`);
	});
});

describe("cycleCanvasDataGridSort", () => {
	it("同一列三态循环，换列回到升序", () => {
		const ascending = cycleCanvasDataGridSort(null, 1);
		expect(ascending).toEqual({ column: 1, direction: "asc" });
		const descending = cycleCanvasDataGridSort(ascending, 1);
		expect(descending).toEqual({ column: 1, direction: "desc" });
		expect(cycleCanvasDataGridSort(descending, 1)).toBeNull();
		expect(cycleCanvasDataGridSort(descending, 2)).toEqual({ column: 2, direction: "asc" });
	});
});

describe("buildCanvasDataGridView", () => {
	const table = parseCanvasDataGrid("name,qty\n苹果,3\nBanana,10\n樱桃,7\n", "csv");

	it("默认顺序下按每页行数分页，并给出视图内 1-based 行号", () => {
		const first = buildCanvasDataGridView({ table, query: "", sort: null, pageSize: 2, page: 1 });
		expect(first.rowIndices).toEqual([0, 1]);
		expect(first.rowNumbers).toEqual([1, 2]);
		expect(first.matchedCount).toBe(3);
		expect(first.pageCount).toBe(2);

		const second = buildCanvasDataGridView({ table, query: "", sort: null, pageSize: 2, page: 2 });
		expect(second.rowIndices).toEqual([2]);
		expect(second.rowNumbers).toEqual([3]);
	});

	it("过滤跨列匹配且忽略大小写，页码越界时夹回有效页", () => {
		const view = buildCanvasDataGridView({ table, query: "BANANA", sort: null, pageSize: 20, page: 9 });
		expect(view.rowIndices).toEqual([1]);
		expect(view.matchedCount).toBe(1);
		expect(view.page).toBe(1);
		expect(view.pageCount).toBe(1);
	});

	it("排序升降序都对数字做数值比较", () => {
		const ascending = buildCanvasDataGridView({
			table,
			query: "",
			sort: { column: 1, direction: "asc" },
			pageSize: 20,
			page: 1,
		});
		expect(ascending.rowIndices).toEqual([0, 2, 1]);
		const descending = buildCanvasDataGridView({
			table,
			query: "",
			sort: { column: 1, direction: "desc" },
			pageSize: 20,
			page: 1,
		});
		expect(descending.rowIndices).toEqual([1, 2, 0]);
	});

	it("等值行保持原有相对顺序", () => {
		const equalTable = parseCanvasDataGrid("name\nb\nA\na\n", "csv");
		const view = buildCanvasDataGridView({
			table: equalTable,
			query: "",
			sort: { column: 0, direction: "asc" },
			pageSize: 20,
			page: 1,
		});
		expect(view.rowIndices).toEqual([1, 2, 0]);
	});

	it("过滤与排序叠加后行号按当前结果重新编号", () => {
		const view = buildCanvasDataGridView({
			table,
			query: "1",
			sort: { column: 1, direction: "desc" },
			pageSize: 20,
			page: 1,
		});
		expect(view.rowIndices).toEqual([1]);
		expect(view.rowNumbers).toEqual([1]);
	});
});
