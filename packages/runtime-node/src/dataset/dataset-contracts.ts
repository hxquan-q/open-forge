// Copyright The Open Forge contributors.

/**
 * Work 数据分析纵切（TASK-0026）的数据集剖析合同。
 *
 * 纯描述层：只报告数据形态（列、推断类型、问题行、截断与缺列），
 * 不携带任何修复或写入语义——「非法值/缺列」一律如实列为问题，
 * 由上层（工具/审阅）决定如何呈现，绝不静默修补。
 */

/** 输入格式白名单：CSV / JSON / Excel 第一工作表。 */
export const DATASET_FORMATS = ["csv", "json", "xlsx"] as const;
export type DatasetFormat = (typeof DATASET_FORMATS)[number];

export const DATASET_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DATASET_MAX_ROWS = 100_000;
export const DATASET_MAX_COLUMNS = 512;
/** 问题行上报清单上限；issueCount 仍记录真实总数。 */
export const DATASET_MAX_REPORTED_ISSUES = 200;

/** 列的推断类型；empty 表示整列无非空单元格。 */
export type DatasetColumnType = "number" | "boolean" | "date" | "string" | "empty";

export interface DatasetColumnProfile {
	readonly name: string;
	readonly type: DatasetColumnType;
	/** 空单元格计数（null、undefined、空字符串）。 */
	readonly emptyCells: number;
	/** 与本列多数类型不一致的非空单元格计数（疑似非法值）。 */
	readonly invalidCells: number;
}

export type DatasetRowIssueReason =
	| "ragged" // 列数与表头不一致（CSV/工作表）
	| "empty-row" // 整行全空
	| "non-object" // JSON 行不是对象/数组（混型输入）
	| "invalid-value"; // 单元格与本列推断类型不一致

export interface DatasetRowIssue {
	/** 1 起的数据行号（表头不计）。 */
	readonly row: number;
	readonly reason: DatasetRowIssueReason;
	/** invalid-value 时给出列名。 */
	readonly column?: string;
}

export interface DatasetProfile {
	readonly format: DatasetFormat;
	readonly path: string;
	/** file:// URI 与 mtime/size 指纹：供引用清单原样照抄，复查时识别缺失/变更。 */
	readonly uri: string;
	readonly sizeBytes: number;
	readonly modifiedAtMs: number;
	/** 实际读取的数据行数（不含表头）；超上限时被截断并置 truncated。 */
	readonly rowCount: number;
	readonly truncated: boolean;
	readonly columns: readonly DatasetColumnProfile[];
	/** 前 DATASET_MAX_REPORTED_ISSUES 条问题行；完整数量见 issueCount。 */
	readonly issues: readonly DatasetRowIssue[];
	readonly issueCount: number;
	/** 调用方期望但数据中不存在的列名。 */
	readonly missingColumns: readonly string[];
}

export type DatasetProfileErrorReason =
	| "missing"
	| "not-a-file"
	| "unsupported-format"
	| "too-large"
	| "empty"
	| "no-header"
	| "parse-failed"
	| "cancelled";

export type DatasetProfileResult =
	| { readonly ok: true; readonly profile: DatasetProfile }
	| { readonly ok: false; readonly reason: DatasetProfileErrorReason; readonly detail?: string };

export interface DatasetProfileOptions {
	/** 期望存在的列名；缺失时列入 missingColumns，不报错。 */
	readonly expectedColumns?: readonly string[];
	readonly signal?: AbortSignal;
}
