// Copyright The Open Forge contributors.
import type { JSX } from "react";
import { type CanvasChartSpec, chartValueRange } from "../../services/canvas-chart";

/** 系列取色固定走桌面端 CSS token：主题切换只换变量，组件无需重建。 */
const SERIES_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
] as const;

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;

export interface CanvasChartLabels {
	readonly empty: string;
	/** SVG 的可访问名兜底（spec 无标题时用，如「图表」）。 */
	readonly chart: string;
}

export function CanvasChartPreview({
	spec,
	labels,
}: {
	readonly spec: CanvasChartSpec;
	readonly labels: CanvasChartLabels;
}): JSX.Element {
	if (spec.labels.length === 0) {
		return (
			<div
				className="flex flex-1 items-center justify-center px-6 py-8 text-[12px] text-muted-foreground"
				role="status"
			>
				{labels.empty}
			</div>
		);
	}

	const a11yName = spec.title ?? labels.chart;
	// 饼图的着色维度是类目（labels），不是系列——图例必须逐类目给出，否则扇区对不上名字。
	const legend =
		spec.type === "pie"
			? spec.labels
					.map((label, index) => ({ name: label, color: SERIES_COLORS[index % SERIES_COLORS.length] }))
					.filter((_item, index) => (spec.series[0]?.values[index] ?? 0) > 0)
			: spec.series.map((series, index) => ({
					name: series.name,
					color: SERIES_COLORS[index % SERIES_COLORS.length],
				}));

	return (
		<div className="min-h-0 flex-1 overflow-auto px-4 py-3">
			{spec.title ? <h3 className="mb-2 text-[12px] font-medium text-foreground">{spec.title}</h3> : null}
			{spec.type === "pie" ? <PieChart spec={spec} name={a11yName} /> : <CartesianChart spec={spec} name={a11yName} />}
			<div className="mt-2 flex flex-wrap items-center gap-3">
				{legend.map((item) => (
					<span key={item.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span
							aria-hidden
							className="h-2.5 w-2.5 shrink-0 rounded-sm"
							style={{ backgroundColor: item.color }}
						/>
						{item.name}
					</span>
				))}
			</div>
		</div>
	);
}

function CartesianChart({ spec, name }: { readonly spec: CanvasChartSpec; readonly name: string }): JSX.Element {
	const { min, max } = chartValueRange(spec);
	const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
	const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
	const bandWidth = plotWidth / spec.labels.length;
	const toX = (index: number): number =>
		spec.labels.length > 1 ? PAD_LEFT + index * (plotWidth / (spec.labels.length - 1)) : PAD_LEFT + plotWidth / 2;
	const toY = (value: number): number => PAD_TOP + ((max - value) / (max - min)) * plotHeight;

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-label={name}
			className="w-full"
			preserveAspectRatio="xMidYMid meet"
		>
			{[max, (max + min) / 2, min].map((tick) => (
				<g key={tick}>
					<line
						x1={PAD_LEFT}
						x2={WIDTH - PAD_RIGHT}
						y1={toY(tick)}
						y2={toY(tick)}
						stroke="var(--border)"
						strokeWidth={1}
					/>
					<text
						x={PAD_LEFT - 6}
						y={toY(tick) + 3}
						textAnchor="end"
						fontSize={10}
						fill="var(--muted-foreground)"
					>
						{formatTick(tick)}
					</text>
				</g>
			))}
			{spec.labels.map((label, index) => (
				<text
					key={`${index}-${label}`}
					x={toX(index)}
					y={HEIGHT - 12}
					textAnchor="middle"
					fontSize={10}
					fill="var(--muted-foreground)"
				>
					{label}
				</text>
			))}
			{spec.series.map((series, seriesIndex) => {
				const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
				if (spec.type === "bar") {
					const barWidth = Math.max(4, (bandWidth * 0.7) / spec.series.length);
					const offset = (bandWidth - barWidth * spec.series.length) / 2;
					return (
						<g key={series.name}>
							{series.values.map((value, index) => (
								<rect
									key={`${index}-${value}`}
									x={PAD_LEFT + index * bandWidth + offset + seriesIndex * barWidth}
									y={Math.min(toY(value), toY(0))}
									width={barWidth}
									height={Math.abs(toY(value) - toY(0))}
									fill={color}
									rx={2}
								/>
							))}
						</g>
					);
				}
				const points = series.values.map((value, index) => `${toX(index)},${toY(value)}`).join(" ");
				if (spec.type === "area") {
					const baseline = toY(0);
					return (
						<g key={series.name}>
							<polygon
								points={`${toX(0)},${baseline} ${points} ${toX(series.values.length - 1)},${baseline}`}
								fill={color}
								opacity={0.18}
							/>
							<polyline points={points} fill="none" stroke={color} strokeWidth={2} />
						</g>
					);
				}
				return <polyline key={series.name} points={points} fill="none" stroke={color} strokeWidth={2} />;
			})}
		</svg>
	);
}

function PieChart({ spec, name }: { readonly spec: CanvasChartSpec; readonly name: string }): JSX.Element {
	const series = spec.series[0];
	const total = series ? series.values.reduce((sum, value) => sum + Math.max(0, value), 0) : 0;
	if (!series || total <= 0) {
		return <p className="text-[12px] text-muted-foreground">—</p>;
	}
	const centerX = WIDTH / 2;
	const centerY = HEIGHT / 2;
	const radius = Math.min(WIDTH, HEIGHT) / 2 - 24;
	let angle = -Math.PI / 2;

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-label={name}
			className="w-full"
			preserveAspectRatio="xMidYMid meet"
		>
			{series.values.map((value, index) => {
				const share = Math.max(0, value) / total;
				const sweep = share * Math.PI * 2;
				const start = angle;
				angle += sweep;
				const labelX = centerX + radius * 0.65 * Math.cos(start + sweep / 2);
				const labelY = centerY + radius * 0.65 * Math.sin(start + sweep / 2);
				return (
					<g key={`${index}-${spec.labels[index] ?? index}`}>
						<path
							d={slicePath(centerX, centerY, radius, start, sweep)}
							fill={SERIES_COLORS[index % SERIES_COLORS.length]}
						/>
						{share > 0.08 ? (
							<text x={labelX} y={labelY} textAnchor="middle" fontSize={10} fill="var(--background)">
								{Math.round(share * 100)}%
							</text>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}

function slicePath(cx: number, cy: number, radius: number, start: number, sweep: number): string {
	const x1 = cx + radius * Math.cos(start);
	const y1 = cy + radius * Math.sin(start);
	const x2 = cx + radius * Math.cos(start + sweep);
	const y2 = cy + radius * Math.sin(start + sweep);
	const largeArc = sweep > Math.PI ? 1 : 0;
	return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function formatTick(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
