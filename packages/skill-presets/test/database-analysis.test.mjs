// Copyright The Open Forge contributors.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../database-analysis/scripts/analysis.mjs";

const cli = fileURLToPath(new URL("../database-analysis/scripts/analyze.mjs", import.meta.url));
const input = (overrides = {}) => ({
	rows: [
		{ month: "2026-08", revenue: "100.00" },
		{ month: "2026-09", revenue: "125.00" },
	],
	dimension: "month",
	metrics: ["revenue"],
	truncated: false,
	chartType: "line",
	compare: { baseline: "2026-08", current: "2026-09" },
	...overrides,
});
const run = (value, args = ["-"]) =>
	spawnSync(process.execPath, [cli, ...args], {
		input: typeof value === "string" ? value : JSON.stringify(value),
		encoding: "utf8",
		timeout: 10_000,
	});

describe("数据库汇总分析合同", () => {
	it("将真实数值字符串转为画布数据并计算明确两期的变化", () => {
		const result = analyze(input());
		expect(result.rowCount).toBe(2);
		expect(result.summary).toEqual([{ metric: "revenue", knownCount: 2, missingCount: 0, min: 100, max: 125 }]);
		expect(result.comparison.metrics).toEqual([
			{ metric: "revenue", baseline: 100, current: 125, change: 25, percentChange: 25, reason: null },
		]);
		expect(result.chart).toEqual({
			type: "line",
			labels: ["2026-08", "2026-09"],
			series: [{ name: "revenue", values: [100, 125] }],
		});
	});
	it.each([
		[0, "zero_baseline"],
		[-10, "negative_baseline"],
	])("基数 %s 只给绝对变化，不伪造增长率", (baseline, reason) => {
		const result = analyze(
			input({
				rows: [
					{ month: "2026-08", revenue: baseline },
					{ month: "2026-09", revenue: 5 },
				],
			}),
		);
		expect(result.comparison.metrics[0]).toMatchObject({ change: 5 - baseline, percentChange: null, reason });
	});
	it("NULL 不作为零绘图，也不作为增长率基数", () => {
		const result = analyze(
			input({
				rows: [
					{ month: "2026-08", revenue: null },
					{ month: "2026-09", revenue: 0 },
				],
			}),
		);
		expect(result.summary[0]).toEqual({ metric: "revenue", knownCount: 1, missingCount: 1, min: 0, max: 0 });
		expect(result.comparison.metrics[0]).toMatchObject({
			baseline: null,
			current: 0,
			change: null,
			percentChange: null,
			reason: "missing_value",
		});
		expect(result.chart).toBeNull();
		expect(result.warnings).toContain("missing_values");
	});
	it("空集保留无数据状态，不返回零指标或空图表", () => {
		const result = analyze(input({ rows: [], compare: undefined }));
		expect(result.summary[0]).toMatchObject({ knownCount: 0, missingCount: 0, min: null, max: null });
		expect(result.chart).toBeNull();
		expect(result.warnings).toContain("empty_result");
	});
	it("不自动累加平均值或率，不重排追问中的分类", () => {
		const result = analyze(
			input({
				rows: [
					{ channel: "B", rate: 0.2 },
					{ channel: "A", rate: 0.8 },
				],
				dimension: "channel",
				metrics: ["rate"],
				compare: undefined,
			}),
		);
		expect(result.chart.labels).toEqual(["B", "A"]);
		expect(result.summary[0]).not.toHaveProperty("sum");
		expect(result.summary[0]).not.toHaveProperty("average");
	});
	it.each([
		["未确认完整性", { truncated: undefined }],
		["截断", { truncated: true }],
		["不匹配行数", { rowCount: 100 }],
		["重复指标", { metrics: ["revenue", "revenue"] }],
		["缺指标", { metrics: ["password"] }],
		["维度作为指标", { metrics: ["month"] }],
		[
			"重复维度",
			{
				rows: [
					{ month: "x", revenue: 1 },
					{ month: "x", revenue: 2 },
				],
			},
		],
		["缺维度", { rows: [{ revenue: 1 }] }],
		["空维度", { rows: [{ month: "", revenue: 1 }] }],
		["不存在的对比", { compare: { baseline: "missing", current: "2026-09" } }],
		["同一对比", { compare: { baseline: "2026-09", current: "2026-09" } }],
		["不支持的图型", { chartType: "pie" }],
		["无指标", { metrics: [] }],
		["过多行", { rows: Array.from({ length: 2001 }, (_, i) => ({ month: String(i), revenue: i })) }],
	])("拒绝%s，不静默丢弃或合并数据", (_label, overrides) => {
		expect(() => analyze(input(overrides))).toThrow();
	});
	it.each([
		"",
		" ",
		"1,000",
		"10%",
		"0x10",
		true,
		{},
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		"9007199254740993",
		"1.1234567890123456",
		"1e309",
	])("拒绝非法或超安全精度指标 %j", (value) => {
		expect(() => analyze(input({ rows: [{ month: "2026-08", revenue: value }], compare: undefined }))).toThrow();
	});
	it("小数差值使用可读精度，数值为零与缺失区分", () => {
		const result = analyze(
			input({
				rows: [
					{ month: "2026-08", revenue: "0.1" },
					{ month: "2026-09", revenue: "0.3" },
				],
			}),
		);
		expect(result.comparison.metrics[0]).toMatchObject({ change: 0.2, percentChange: 200 });
	});
	it("多指标保留各自基数、顺序和标题", () => {
		const result = analyze(
			input({
				rows: [
					{ month: "2026-08", revenue: 100, orders: 4 },
					{ month: "2026-09", revenue: 80, orders: 5 },
				],
				metrics: ["orders", "revenue"],
				title: "Monthly comparison",
			}),
		);
		expect(result.comparison.metrics.map((item) => item.percentChange)).toEqual([25, -20]);
		expect(result.chart.title).toBe("Monthly comparison");
		expect(result.chart.series.map((item) => item.name)).toEqual(["orders", "revenue"]);
	});
	it.each([
		[Number.MIN_VALUE, 1],
		[-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	])("超范围算术保留明确原因，不序列化 Infinity", (baseline, current) => {
		const result = analyze(
			input({
				rows: [
					{ month: "2026-08", revenue: baseline },
					{ month: "2026-09", revenue: current },
				],
			}),
		);
		expect(result.comparison.metrics[0]).toMatchObject({ percentChange: null, reason: "out_of_range" });
	});
	it.each([null, [], "data", 42])("拒绝非对象输入 %j", (value) => {
		expect(() => analyze(value)).toThrow("JSON object");
	});
	it("拒绝下溢到零的小数，而不是报告收入为零", () => {
		expect(() =>
			analyze(input({ rows: [{ month: "2026-08", revenue: `0.${"0".repeat(400)}1` }], compare: undefined })),
		).toThrow("too small");
	});
	it("恶意维度只作为数据，不读取额外列或污染对象", () => {
		const result = analyze(
			input({
				rows: JSON.parse(
					'[{"month":"__proto__","revenue":1,"password":"private"},{"month":"constructor","revenue":2}]',
				),
				compare: undefined,
			}),
		);
		expect(result.chart.labels).toEqual(["__proto__", "constructor"]);
		expect(JSON.stringify(result)).not.toContain("private");
	});
});

describe("发布给用户的分析 CLI", () => {
	it("stdin 正常输出 JSON；非法 JSON 的错误不回显数据，修正后可重试", () => {
		const bad = run('{"password":"DO_NOT_ECHO",');
		expect(bad.status).toBe(1);
		expect(bad.stdout).toBe("");
		expect(bad.stderr).not.toContain("DO_NOT_ECHO");
		expect(run(input()).status).toBe(0);
	});
	it("拒绝超大输入，不把未读取的数据当完整结果", () => {
		const result = run(" ".repeat(1024 * 1024 + 1));
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("1 MiB");
	});
	it("文件模式不改写输入，路径读取失败不回显私有路径", () => {
		const dir = mkdtempSync(join(tmpdir(), "db-analysis-"));
		try {
			const path = join(dir, "query result.json");
			const data = JSON.stringify(input());
			writeFileSync(path, data);
			const result = run("", [path]);
			expect(result.status).toBe(0);
			expect(JSON.parse(result.stdout).comparison.metrics[0].percentChange).toBe(25);
			expect(readFileSync(path, "utf8")).toBe(data);
			const missing = run("", [join(dir, "PRIVATE-PATH.json")]);
			expect(missing.status).toBe(1);
			expect(missing.stderr).not.toContain("PRIVATE-PATH");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
	it("帮助与误用不会被当作查询数据", () => {
		expect(run("", ["--help"]).status).toBe(0);
		expect(run("", []).status).toBe(1);
		expect(run("", ["-", "unexpected"]).status).toBe(1);
	});
});

describe("用户流程：问趋势 → 查询汇总 → 分析 → 按渠道追问", () => {
	it("对临时 SQLite 的实际查询结果给出一致的趋势和渠道拆分", () => {
		const root = mkdtempSync(join(tmpdir(), "database-analysis-flow-"));
		const database = join(root, "fixture.sqlite");
		// Bun is already required by the repo; use its SQLite instead of raising the Node test minimum.
		const sqlite = (sql, params, initialize = false) =>
			JSON.parse(
				execFileSync(
					"bun",
					[
						"--eval",
						`
			import { Database } from "bun:sqlite";
			const { path, sql, params, initialize } = JSON.parse(process.argv[1]);
			const db = new Database(path, { readonly: !initialize, create: initialize });
			try {
				if (initialize) { db.exec(sql); process.stdout.write("null"); }
				else { process.stdout.write(JSON.stringify(db.prepare(sql).all(...params))); }
			} finally { db.close(); }
		`,
						JSON.stringify({ path: database, sql, params, initialize }),
					],
					{ encoding: "utf8", timeout: 10_000 },
				),
			);
		try {
			sqlite(
				`CREATE TABLE orders (month TEXT, channel TEXT, status TEXT, amount INTEGER);
				INSERT INTO orders VALUES ('2026-08','web','paid',100), ('2026-08','store','paid',100),
				('2026-09','web','paid',200), ('2026-09','store','paid',50), ('2026-09','web','cancelled',999);`,
				[],
				true,
			);
			const rows = sqlite(
				"SELECT month, SUM(amount) AS revenue FROM orders WHERE status = ? GROUP BY month ORDER BY month",
				["paid"],
			);
			const trend = run(input({ rows, rowCount: rows.length }));
			expect(trend.status).toBe(0);
			const report = JSON.parse(trend.stdout);
			expect(report.chart.series[0].values).toEqual([200, 250]);
			expect(report.comparison.metrics[0]).toMatchObject({ change: 50, percentChange: 25 });
			const channels = sqlite(
				"SELECT channel, SUM(amount) AS revenue FROM orders WHERE status = ? AND month = ? GROUP BY channel ORDER BY revenue DESC",
				["paid", "2026-09"],
			);
			const followup = run(input({ rows: channels, dimension: "channel", chartType: "bar", compare: undefined }));
			expect(followup.status).toBe(0);
			expect(JSON.parse(followup.stdout).chart).toEqual({
				type: "bar",
				labels: ["web", "store"],
				series: [{ name: "revenue", values: [200, 50] }],
			});
			expect(sqlite("SELECT COUNT(*) AS count FROM orders", [])[0].count).toBe(5);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
