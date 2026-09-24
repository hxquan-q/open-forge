// Copyright The Open Forge contributors.

/**
 * Canvas Data Grid 的数据侧纯函数：格式判定、表格解析、过滤 / 排序 / 分页视图。
 *
 * 放在 renderer services 而非 `@vetta/toolkit`：toolkit 是 Node 工具集（见其 AGENTS.md），
 * 这份解析只服务 Canvas 预览，与 `canvas-preview-kind.ts` 同层，避免 renderer 反向依赖 Node 包。
 */

/** 表格 artifact 的三种承载格式。 */
export type CanvasDataGridFormat = "csv" | "tsv" | "json";

/**
 * 行列 JSON 必须显式声明这个 contentType。
 * `.json` / `application/json` 不能升级为表格——既有的普通 JSON artifact 仍走代码预览。
 */
export const CANVAS_DATA_GRID_JSON_CONTENT_TYPE = "application/vnd.vetta.data-grid+json";

export const CANVAS_DATA_GRID_PAGE_SIZES = [20, 50, 100] as const;
export type CanvasDataGridPageSize = (typeof CANVAS_DATA_GRID_PAGE_SIZES)[number];
export const CANVAS_DATA_GRID_DEFAULT_PAGE_SIZE: CanvasDataGridPageSize = 20;

export interface CanvasDataGridSource {
	readonly contentType?: string;
	readonly title?: string;
	readonly uri?: string;
}

/** 矩形表格：每行都补齐到 `headers.length`，渲染层不需要再处理列数不齐。 */
export interface CanvasDataGridTable {
	readonly headers: readonly string[];
	readonly rows: readonly (readonly string[])[];
}

export interface CanvasDataGridCellRange {
	/** 1-based，当前过滤 + 排序结果中的行号。 */
	readonly rowStart: number;
	readonly rowEnd: number;
	/** 1-based，表格列号。 */
	readonly columnStart: number;
	readonly columnEnd: number;
}

export type CanvasDataGridSortDirection = "asc" | "desc";

export interface CanvasDataGridSort {
	readonly column: number;
	readonly direction: CanvasDataGridSortDirection;
}

export function resolveCanvasDataGridFormat(input: CanvasDataGridSource): CanvasDataGridFormat | null {
	// contentType 是开放字符串，允许带 charset 等参数。
	const contentType = (input.contentType ?? "").split(";")[0].trim().toLowerCase();
	if (contentType === "text/csv") return "csv";
	if (contentType === "text/tab-separated-values") return "tsv";
	if (contentType === CANVAS_DATA_GRID_JSON_CONTENT_TYPE) return "json";
	// 后缀判定沿用 resolveCanvasPreviewKind 的习惯：title / uri 上出现后缀即算。
	const name = `${input.title ?? ""} ${input.uri ?? ""}`.toLowerCase();
	if (name.includes(".csv")) return "csv";
	if (name.includes(".tsv")) return "tsv";
	return null;
}

/** 「保存到项目」的默认后缀：没有具体格式时按 CSV 兜底。 */
export function canvasDataGridExtension(format: CanvasDataGridFormat | null): string {
	if (format === "tsv") return ".tsv";
	if (format === "json") return ".json";
	return ".csv";
}

const EMPTY_TABLE: CanvasDataGridTable = { headers: [], rows: [] };

export function parseCanvasDataGrid(content: string, format: CanvasDataGridFormat): CanvasDataGridTable {
	if (format === "json") return tableFromJson(content);
	return tableFromMatrix(parseDelimitedText(content, format === "tsv" ? "\t" : ","));
}

/**
 * RFC 4180 状态机：支持引号包裹字段、字段内换行与分隔符、`""` 转义、CRLF / CR / LF。
 * 整行空白（单个空字段）被当作空行丢弃，避免尾随换行凭空多出一行数据。
 */
function parseDelimitedText(content: string, delimiter: string): string[][] {
	const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	let fieldStarted = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (quoted) {
			if (char !== '"') {
				field += char;
				continue;
			}
			if (text[index + 1] === '"') {
				field += '"';
				index += 1;
				continue;
			}
			quoted = false;
			continue;
		}
		if (char === '"' && !fieldStarted) {
			quoted = true;
			fieldStarted = true;
			continue;
		}
		if (char === delimiter) {
			row.push(field);
			field = "";
			// 分隔符之后是下一个字段的起点，引号必须重新具备「开始引用」的含义。
			fieldStarted = false;
			continue;
		}
		if (char === "\r" || char === "\n") {
			if (char === "\r" && text[index + 1] === "\n") index += 1;
			row.push(field);
			if (row.length > 1 || row[0] !== "") rows.push(row);
			row = [];
			field = "";
			fieldStarted = false;
			continue;
		}
		field += char;
		fieldStarted = true;
	}

	if (fieldStarted || field.length > 0 || row.length > 0) {
		row.push(field);
		if (row.length > 1 || row[0] !== "") rows.push(row);
	}
	return rows;
}

/** 首行是表头；列数按最长行对齐，短行补空字符串，多出来的列用空表头占位。 */
function tableFromMatrix(matrix: readonly (readonly string[])[]): CanvasDataGridTable {
	if (matrix.length === 0) return EMPTY_TABLE;
	let columnCount = 0;
	for (const row of matrix) columnCount = Math.max(columnCount, row.length);
	const pad = (row: readonly string[]): readonly string[] =>
		row.length === columnCount ? row : [...row, ...new Array<string>(columnCount - row.length).fill("")];
	return { headers: pad(matrix[0]), rows: matrix.slice(1).map(pad) };
}

/**
 * 行列 JSON 的两种形态：`{ columns, rows }` 与「数组的数组」（首行为表头）。
 * 无法解析或结构不符时返回空表，由组件渲染空状态，不抛错到预览层。
 */
function tableFromJson(content: string): CanvasDataGridTable {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return EMPTY_TABLE;
	}
	if (Array.isArray(parsed)) {
		return tableFromMatrix(parsed.filter(isUnknownArray).map(toTextCells));
	}
	if (typeof parsed === "object" && parsed !== null) {
		const record = parsed as { readonly columns?: unknown; readonly rows?: unknown };
		if (!Array.isArray(record.rows)) return EMPTY_TABLE;
		const columns = Array.isArray(record.columns) ? record.columns.map(toCellText) : [];
		return tableFromMatrix([columns, ...record.rows.filter(isUnknownArray).map(toTextCells)]);
	}
	return EMPTY_TABLE;
}

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

function toTextCells(row: unknown[]): readonly string[] {
	return row.map(toCellText);
}

function toCellText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object") return JSON.stringify(value) ?? "";
	return String(value);
}

export function cycleCanvasDataGridSort(current: CanvasDataGridSort | null, column: number): CanvasDataGridSort | null {
	if (!current || current.column !== column) return { column, direction: "asc" };
	if (current.direction === "asc") return { column, direction: "desc" };
	return null;
}

export interface CanvasDataGridViewInput {
	readonly table: CanvasDataGridTable;
	readonly query: string;
	readonly sort: CanvasDataGridSort | null;
	readonly pageSize: number;
	/** 1-based；超出范围时夹到有效页码。 */
	readonly page: number;
}

export interface CanvasDataGridView {
	readonly headers: readonly string[];
	/** 当前页要渲染的原始行索引。 */
	readonly rowIndices: readonly number[];
	/** 每行在「过滤 + 排序结果」中的 1-based 行号，选区摘要用它。 */
	readonly rowNumbers: readonly number[];
	readonly matchedCount: number;
	readonly page: number;
	readonly pageCount: number;
}

// 数字与大小写感知的比较：数据表里 `2` 应排在 `10` 前，`apple` 与 `Apple` 视为等值。
const CELL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function buildCanvasDataGridView(input: CanvasDataGridViewInput): CanvasDataGridView {
	const { table, sort } = input;
	const needle = input.query.trim().toLowerCase();
	let indices = table.rows.map((_row, index) => index);
	if (needle) {
		indices = indices.filter((index) => table.rows[index].some((cell) => cell.toLowerCase().includes(needle)));
	}
	if (sort) {
		const { column } = sort;
		const factor = sort.direction === "asc" ? 1 : -1;
		// 等值行保持原有相对顺序（Array#sort 本就稳定，索引比较只是显式保险）。
		indices = [...indices].sort((left, right) => {
			const compared = CELL_COLLATOR.compare(cellAt(table.rows[left], column), cellAt(table.rows[right], column));
			return compared === 0 ? left - right : compared * factor;
		});
	}
	const pageSize = Math.max(1, Math.floor(input.pageSize) || 1);
	const pageCount = Math.max(1, Math.ceil(indices.length / pageSize));
	const page = Math.min(Math.max(1, Math.floor(input.page) || 1), pageCount);
	const start = (page - 1) * pageSize;
	const rowIndices = indices.slice(start, start + pageSize);
	return {
		headers: table.headers,
		rowIndices,
		rowNumbers: rowIndices.map((_rowIndex, offset) => start + offset + 1),
		matchedCount: indices.length,
		page,
		pageCount,
	};
}

/** 内容换版本后旧的排序列号可能越界，越界按空单元格参与比较，不回退成崩溃。 */
function cellAt(row: readonly string[], column: number): string {
	const value: string | undefined = row[column];
	return value ?? "";
}
