// Copyright The Open Forge contributors.

/**
 * 原始表格（首行表头 + 基元单元格行）→ 列画像与问题行。
 * 纯函数：不碰文件系统，便于合同测试直接喂构造表。
 */

import {
	DATASET_MAX_COLUMNS,
	DATASET_MAX_REPORTED_ISSUES,
	DATASET_MAX_ROWS,
	type DatasetColumnProfile,
	type DatasetColumnType,
	type DatasetRowIssue,
} from "./dataset-contracts.js";

/** 归一化后的单元格值：null 表示空。 */
export type TabularCell = string | number | boolean | Date | null;

export interface RawTable {
	readonly header: readonly string[];
	readonly rows: readonly (readonly TabularCell[])[];
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const BOOLEAN_RE = /^(true|false)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function cellType(cell: TabularCell): DatasetColumnType | null {
	if (cell === null || cell === undefined) return null;
	if (cell instanceof Date) return "date";
	if (typeof cell === "number") return Number.isFinite(cell) ? "number" : "string";
	if (typeof cell === "boolean") return "boolean";
	if (typeof cell !== "string") return "string";
	const trimmed = cell.trim();
	if (trimmed === "") return null;
	if (NUMBER_RE.test(trimmed)) return "number";
	if (BOOLEAN_RE.test(trimmed)) return "boolean";
	if (DATE_RE.test(trimmed)) return "date";
	return "string";
}

function isEmptyCell(cell: TabularCell): boolean {
	return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

export interface TabularProfile {
	readonly header: readonly string[];
	readonly rowCount: number;
	readonly truncated: boolean;
	readonly columns: readonly DatasetColumnProfile[];
	readonly issues: readonly DatasetRowIssue[];
	readonly issueCount: number;
}

/**
 * 对表格做列级画像：类型取非空单元格的多数类型，少数派逐格计为
 * invalid-value 问题行；并列时落 string（最保守、不算非法）。
 */
export function profileTable(table: RawTable, options?: { signal?: AbortSignal }): TabularProfile {
	const header = table.header.slice(0, DATASET_MAX_COLUMNS).map((name, index) => {
		const trimmed = String(name).trim();
		return trimmed === "" ? `column_${index + 1}` : trimmed;
	});
	const issues: DatasetRowIssue[] = [];
	let issueCount = 0;
	const reportIssue = (issue: DatasetRowIssue) => {
		issueCount += 1;
		if (issues.length < DATASET_MAX_REPORTED_ISSUES) issues.push(issue);
	};

	const cappedRows = table.rows.slice(0, DATASET_MAX_ROWS);
	const truncated = table.rows.length > DATASET_MAX_ROWS;

	const columnStats = header.map(() => ({
		emptyCells: 0,
		counts: new Map<DatasetColumnType, number>(),
	}));
	const cellTypes: (DatasetColumnType | null)[][] = new Array(cappedRows.length);

	for (let rowIndex = 0; rowIndex < cappedRows.length; rowIndex += 1) {
		if (rowIndex % 4096 === 0 && options?.signal?.aborted) {
			return { header, rowCount: rowIndex, truncated: true, columns: [], issues, issueCount };
		}
		const row = cappedRows[rowIndex]!;
		const dataRow = rowIndex + 1;
		if (row.length !== header.length) {
			reportIssue({ row: dataRow, reason: "ragged" });
		}
		const types = new Array<DatasetColumnType | null>(header.length).fill(null);
		let allEmpty = true;
		for (let col = 0; col < header.length; col += 1) {
			const cell = row[col] ?? null;
			const type = cellType(cell);
			types[col] = type;
			if (isEmptyCell(cell)) {
				columnStats[col]!.emptyCells += 1;
			} else {
				allEmpty = false;
				const stat = columnStats[col]!;
				stat.counts.set(type ?? "string", (stat.counts.get(type ?? "string") ?? 0) + 1);
			}
		}
		cellTypes[rowIndex] = types;
		if (allEmpty) reportIssue({ row: dataRow, reason: "empty-row" });
	}

	// 并列时优先更具体的类型：「基本是数字、混入少量脏值」比
	// 「字符串列」更有用——脏值会作为 invalid-value 如实列出。
	const SPECIFICITY: readonly DatasetColumnType[] = ["number", "boolean", "date", "string"];
	const inferredTypes = columnStats.map((stat) => {
		let inferred: DatasetColumnType = "empty";
		let best = 0;
		for (const [type, count] of stat.counts) {
			const wins = count > best || (count === best && SPECIFICITY.indexOf(type) < SPECIFICITY.indexOf(inferred));
			if (wins) {
				best = count;
				inferred = type;
			}
		}
		return inferred;
	});

	// 第二遍：与多数类型不一致的非空单元格计为 invalid-value。
	// 推断为 string 的列天然可容纳任意值，不报 invalid。
	const invalidCounts = header.map(() => 0);
	for (let rowIndex = 0; rowIndex < cappedRows.length; rowIndex += 1) {
		const types = cellTypes[rowIndex]!;
		for (let col = 0; col < header.length; col += 1) {
			const cellTypeAt = types[col];
			const columnType = inferredTypes[col]!;
			if (cellTypeAt !== null && columnType !== "empty" && columnType !== "string" && cellTypeAt !== columnType) {
				invalidCounts[col] += 1;
				reportIssue({ row: rowIndex + 1, reason: "invalid-value", column: header[col]! });
			}
		}
	}
	const columns: DatasetColumnProfile[] = header.map((name, col) => ({
		name,
		type: inferredTypes[col]!,
		emptyCells: columnStats[col]!.emptyCells,
		invalidCells: invalidCounts[col]!,
	}));
	return { header, rowCount: cappedRows.length, truncated, columns, issues, issueCount };
}
