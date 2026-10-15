// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { type JSX, useMemo, useState } from "react";
import type { CanvasDataGridLabels, CanvasDataGridSelection } from "../../hooks/useCanvasTabModel";
import {
	CANVAS_DATA_GRID_DEFAULT_PAGE_SIZE,
	CANVAS_DATA_GRID_PAGE_SIZES,
	type CanvasDataGridCellRange,
	type CanvasDataGridFormat,
	type CanvasDataGridSort,
	buildCanvasDataGridView,
	cycleCanvasDataGridSort,
	parseCanvasDataGrid,
} from "../../services/canvas-data-grid";
import { readCanvasSelectionFromTarget } from "../../services/canvas-selection-attachment";

export interface CanvasDataGridPreviewProps {
	readonly content: string;
	readonly format: CanvasDataGridFormat;
	readonly labels: CanvasDataGridLabels;
	readonly onSelectionChange: (selection: CanvasDataGridSelection) => void;
}

/**
 * 原生只读数据表：表头固定、列头三态排序、全局过滤、20/50/100 行分页。
 * 划选照走既有 Select-to-Ask：交给宿主机把文本与行列范围组成 `vetta.canvas.artifact-selection` 附件。
 */
export function CanvasDataGridPreview({
	content,
	format,
	labels,
	onSelectionChange,
}: CanvasDataGridPreviewProps): JSX.Element {
	const table = useMemo(() => parseCanvasDataGrid(content, format), [content, format]);
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<CanvasDataGridSort | null>(null);
	const [pageSize, setPageSize] = useState<number>(CANVAS_DATA_GRID_DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const view = useMemo(
		() => buildCanvasDataGridView({ table, query, sort, pageSize, page }),
		[table, query, sort, pageSize, page],
	);

	if (table.headers.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center"
				role="status"
			>
				<span aria-hidden className="icon-[solar--notes-linear] h-8 w-8 text-muted-foreground/60" />
				<p className="text-[12px] text-muted-foreground">{labels.empty}</p>
			</div>
		);
	}

	const emitSelection = (root: HTMLElement): void => {
		const text = readCanvasSelectionFromTarget(root);
		const range = text ? resolveCanvasDataGridRange(root) : null;
		// range 整体省略而不是传 undefined：PluginPromptContext 的 JSON 守卫会拒绝 undefined。
		onSelectionChange(range ? { text, range } : { text });
	};

	const changeSort = (column: number): void => {
		setSort((current) => cycleCanvasDataGridSort(current, column));
		setPage(1);
	};

	const changePageSize = (value: string): void => {
		const next = CANVAS_DATA_GRID_PAGE_SIZES.find((size) => String(size) === value);
		if (next === undefined) return;
		setPageSize(next);
		setPage(1);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<Input
					type="search"
					value={query}
					aria-label={labels.filterPlaceholder}
					placeholder={labels.filterPlaceholder}
					className="h-7 max-w-56 text-[12px]"
					onChange={(event) => {
						setQuery(event.target.value);
						setPage(1);
					}}
				/>
				<span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
					{labels.pageSummary(view.page, view.pageCount, view.matchedCount)}
				</span>
			</div>
			<div
				data-testid="canvas-data-grid"
				tabIndex={0}
				className="min-h-0 flex-1 overflow-auto"
				onMouseUp={(event) => emitSelection(event.currentTarget)}
				onKeyUp={(event) => emitSelection(event.currentTarget)}
			>
				<table aria-label={labels.table} className="w-full border-collapse text-[12px]">
					<thead>
						<tr>
							{table.headers.map((header, column) => (
								<th
									key={`${column}-${header}`}
									scope="col"
									aria-sort={ariaSortFor(sort, column)}
									className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-1 py-1 text-left font-medium text-muted-foreground backdrop-blur-sm"
								>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										title={nextSortTitle(sort, column, labels)}
										className="w-full justify-start px-2 text-[12px] font-medium"
										onClick={() => changeSort(column)}
									>
										<span className="truncate">{header}</span>
										{sort && sort.column === column ? (
											<span
												aria-hidden
												className={`h-3 w-3 shrink-0 text-primary ${
													sort.direction === "asc"
														? "icon-[solar--alt-arrow-up-linear]"
														: "icon-[solar--alt-arrow-down-linear]"
												}`}
											/>
										) : null}
									</Button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{view.rowIndices.length === 0 ? (
							<tr>
								<td
									colSpan={table.headers.length}
									className="px-3 py-6 text-center text-[12px] text-muted-foreground/60"
								>
									{labels.noMatch}
								</td>
							</tr>
						) : null}
						{view.rowIndices.map((rowIndex, offset) => (
							<tr
								key={rowIndex}
								className="border-b border-border/30 transition-colors duration-200 hover:bg-accent/30"
							>
								{table.rows[rowIndex].map((cell, column) => (
									<td
										key={column}
										data-row={view.rowNumbers[offset]}
										data-column={column + 1}
										title={cell}
										className="max-w-[320px] truncate px-3 py-1.5 align-top text-foreground/90"
									>
										{cell}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
				<div role="group" aria-label={labels.rowsPerPage}>
					<SegmentedControl
						items={CANVAS_DATA_GRID_PAGE_SIZES.map((size) => ({ key: String(size), label: String(size) }))}
						value={String(pageSize)}
						onChange={changePageSize}
					/>
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<Button size="sm" variant="ghost" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
						{labels.previousPage}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={view.page >= view.pageCount}
						onClick={() => setPage(view.page + 1)}
					>
						{labels.nextPage}
					</Button>
				</div>
			</div>
		</div>
	);
}

function ariaSortFor(sort: CanvasDataGridSort | null, column: number): "ascending" | "descending" | "none" {
	if (!sort || sort.column !== column) return "none";
	return sort.direction === "asc" ? "ascending" : "descending";
}

/** 提示文案描述「点下去会发生什么」，当前排序状态由 `aria-sort` 表达。 */
function nextSortTitle(sort: CanvasDataGridSort | null, column: number, labels: CanvasDataGridLabels): string {
	if (!sort || sort.column !== column) return labels.sortToAscending;
	return sort.direction === "asc" ? labels.sortToDescending : labels.sortToDefault;
}

/** 选中单元格的界框范围；解析不到单元格时返回 null，附件只带文本摘录。 */
function resolveCanvasDataGridRange(root: HTMLElement): CanvasDataGridCellRange | null {
	if (typeof window === "undefined") return null;
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	const start = cellPosition(range.startContainer, root);
	const end = cellPosition(range.endContainer, root);
	if (!start || !end) return null;
	return {
		rowStart: Math.min(start.row, end.row),
		rowEnd: Math.max(start.row, end.row),
		columnStart: Math.min(start.column, end.column),
		columnEnd: Math.max(start.column, end.column),
	};
}

function cellPosition(node: Node | null, root: HTMLElement): { row: number; column: number } | null {
	const element = node instanceof Element ? node : (node?.parentElement ?? null);
	const cell = element?.closest("[data-row][data-column]") ?? null;
	if (!cell || !root.contains(cell)) return null;
	const row = Number(cell.getAttribute("data-row"));
	const column = Number(cell.getAttribute("data-column"));
	if (!Number.isFinite(row) || !Number.isFinite(column)) return null;
	return { row, column };
}
