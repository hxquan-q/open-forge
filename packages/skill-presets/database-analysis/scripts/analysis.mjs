// Copyright The Open Forge contributors.
// Only analyze database-side aggregates: sums/averages across arbitrary metrics would be misleading.
export class AnalysisInputError extends Error {}

function requireInput(condition, message) {
	if (!condition) throw new AnalysisInputError(message);
}

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLabel(value) {
	return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function numericValue(value) {
	if (value === null) return null;
	if (typeof value === "string") {
		const text = value.trim();
		requireInput(/^-?\d+(?:\.\d+)?$/.test(text), "Metrics must be numbers, plain decimal strings, or null.");
		const significant = text.replace(/^-/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
		requireInput(
			significant.length <= 15,
			"Decimal strings must fit 15 significant digits; scale or round explicitly in SQL.",
		);
		value = Number(text);
		requireInput(value !== 0 || !/[1-9]/.test(text), "Metric is too small for numeric analysis.");
	}
	requireInput(
		typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER,
		"Metrics must be finite safe numbers; keep high-precision values in SQL.",
	);
	return value;
}

function rounded(value) {
	if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
	return Number.isInteger(value) ? value : Number(value.toPrecision(15));
}

function compareMetric(metric, baseline, current) {
	const result = { metric, baseline, current, change: null, percentChange: null, reason: null };
	if (baseline === null || current === null) return { ...result, reason: "missing_value" };
	const change = rounded(current - baseline);
	if (change === null) return { ...result, reason: "out_of_range" };
	if (baseline <= 0) return { ...result, change, reason: baseline === 0 ? "zero_baseline" : "negative_baseline" };
	const percentChange = rounded(((current - baseline) / baseline) * 100);
	return { ...result, change, percentChange, reason: percentChange === null ? "out_of_range" : null };
}

export function analyze(input) {
	requireInput(isRecord(input), "Input must be a JSON object.");
	requireInput(
		input.truncated === false,
		"Confirm truncated: false only after verifying the query result is complete.",
	);
	requireInput(
		Array.isArray(input.rows) && input.rows.length <= 2000,
		"Provide at most 2000 aggregated rows; aggregate or narrow the query in SQL.",
	);
	requireInput(
		input.rowCount === undefined || input.rowCount === input.rows.length,
		"rowCount must match the supplied rows.",
	);
	requireInput(isLabel(input.dimension), "Provide one named dimension column.");
	requireInput(
		Array.isArray(input.metrics) &&
			input.metrics.length > 0 &&
			input.metrics.length <= 8 &&
			input.metrics.every(isLabel),
		"Provide 1 to 8 named numeric metric columns.",
	);
	requireInput(
		new Set(input.metrics).size === input.metrics.length && !input.metrics.includes(input.dimension),
		"Metrics must be distinct from each other and the dimension.",
	);
	const chartType = input.chartType ?? "bar";
	requireInput(chartType === "bar" || chartType === "line", "chartType must be bar or line.");
	requireInput(
		input.title === undefined || isLabel(input.title),
		"title must be a nonempty string of at most 256 characters.",
	);

	const labels = [];
	const seen = new Set();
	const series = input.metrics.map((name) => ({ name, values: [] }));
	for (const row of input.rows) {
		requireInput(isRecord(row) && Object.hasOwn(row, input.dimension), "Each row must contain the dimension column.");
		const label = row[input.dimension];
		requireInput(
			isLabel(label),
			"Dimension values must be nonempty strings of at most 256 characters; label NULL groups explicitly in SQL.",
		);
		requireInput(!seen.has(label), "Dimension values must be unique; aggregate duplicate groups in SQL.");
		seen.add(label);
		labels.push(label);
		for (const item of series) {
			requireInput(Object.hasOwn(row, item.name), "Each row must contain every requested metric column.");
			item.values.push(numericValue(row[item.name]));
		}
	}
	const summary = series.map(({ name, values }) => {
		const known = values.filter((value) => value !== null);
		return {
			metric: name,
			knownCount: known.length,
			missingCount: values.length - known.length,
			min: known.length ? Math.min(...known) : null,
			max: known.length ? Math.max(...known) : null,
		};
	});
	let comparison;
	if (input.compare !== undefined) {
		requireInput(
			isRecord(input.compare) && isLabel(input.compare.baseline) && isLabel(input.compare.current),
			"compare must name baseline and current dimension values.",
		);
		const { baseline, current } = input.compare;
		requireInput(
			baseline !== current && seen.has(baseline) && seen.has(current),
			"Comparison requires two distinct, present dimension values.",
		);
		const baselineIndex = labels.indexOf(baseline);
		const currentIndex = labels.indexOf(current);
		comparison = {
			baseline,
			current,
			metrics: series.map(({ name, values }) => compareMetric(name, values[baselineIndex], values[currentIndex])),
		};
	}
	const warnings = [];
	if (labels.length === 0) warnings.push("empty_result");
	if (summary.some((item) => item.missingCount > 0)) warnings.push("missing_values");
	// The current Canvas contract fills missing points with zero. Omit the chart instead of inventing data.
	const chart =
		warnings.length > 0
			? null
			: { type: chartType, ...(input.title === undefined ? {} : { title: input.title }), labels, series };
	return {
		rowCount: labels.length,
		summary,
		...(comparison ? { comparison } : {}),
		chart,
		warnings,
		numericPolicy:
			"Approximate analysis; fractional changes rounded to 15 significant digits. Compute exact totals in SQL.",
	};
}
