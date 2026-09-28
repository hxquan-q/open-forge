// Copyright The Open Forge contributors.

/**
 * 声明式图表契约（`application/vnd.vetta.chart+json`）：
 *
 * ```json
 * {
 *   "type": "line" | "bar" | "pie" | "area",
 *   "title": "可选标题",
 *   "labels": ["Jan", "Feb"],
 *   "series": [{ "name": "收入", "values": [12, 18] }]
 * }
 * ```
 *
 * 解析是纯函数且容错：结构不符返回 null，由预览层降级为代码视图 + 明确提示，不白屏。
 * 颜色不作为契约字段——渲染层固定消费桌面端 CSS token，深浅主题切换无需重建组件。
 */
export type CanvasChartType = "line" | "bar" | "pie" | "area";

export interface CanvasChartSeries {
	readonly name: string;
	readonly values: readonly number[];
}

export interface CanvasChartSpec {
	readonly type: CanvasChartType;
	readonly title?: string;
	readonly labels: readonly string[];
	readonly series: readonly CanvasChartSeries[];
}

const CHART_TYPES: readonly CanvasChartType[] = ["line", "bar", "pie", "area"];

export function parseCanvasChart(content: string): CanvasChartSpec | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const record = parsed as {
		readonly type?: unknown;
		readonly title?: unknown;
		readonly labels?: unknown;
		readonly series?: unknown;
	};
	if (typeof record.type !== "string" || !CHART_TYPES.includes(record.type as CanvasChartType)) return null;
	if (!Array.isArray(record.series)) return null;

	const series: CanvasChartSeries[] = [];
	for (const entry of record.series) {
		if (typeof entry !== "object" || entry === null) continue;
		const item = entry as { readonly name?: unknown; readonly values?: unknown };
		if (!Array.isArray(item.values)) continue;
		const values = item.values.map(toFiniteNumber);
		if (values.some((value) => value === undefined)) continue;
		series.push({
			name: typeof item.name === "string" && item.name.trim() ? item.name : `#${series.length + 1}`,
			values: values as number[],
		});
	}
	if (series.length === 0) return null;

	const rawLabels = Array.isArray(record.labels) ? record.labels : [];
	// labels 是坐标轴的事实源：给了几条就画几个点，缺值的序列按 0 补。
	const pointCount = rawLabels.length > 0 ? rawLabels.length : Math.max(...series.map((item) => item.values.length));
	const labels = Array.from({ length: pointCount }, (_value, index) => {
		const label = rawLabels[index];
		return typeof label === "string" && label.trim() ? label : String(index + 1);
	});
	return {
		type: record.type as CanvasChartType,
		...(typeof record.title === "string" && record.title.trim() ? { title: record.title } : {}),
		labels,
		// 各序列长度对齐，渲染层不需要再处理缺项。
		series: series.map((item) => ({
			name: item.name,
			values: labels.map((_label, index) => item.values[index] ?? 0),
		})),
	};
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

/** 折线 / 面积 / 柱状共用：0 基准 + 上下留白，保证负值也画得下。 */
export function chartValueRange(spec: CanvasChartSpec): { readonly min: number; readonly max: number } {
	const values = spec.series.flatMap((item) => [...item.values]);
	if (values.length === 0) return { min: 0, max: 1 };
	const min = Math.min(0, ...values);
	const max = Math.max(0, ...values);
	return max === min ? { min, max: min + 1 } : { min, max };
}
