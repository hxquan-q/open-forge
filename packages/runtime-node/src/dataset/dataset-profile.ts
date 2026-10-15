// Copyright The Open Forge contributors.

/**
 * 数据集剖析的 IO 编排：stat/读文件 → 按扩展名分派解析 → 表格画像。
 * 只读：不修改源文件、不联网、不产生任何写入副作用。
 */

import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsvText } from "./csv-parse.js";
import {
	DATASET_MAX_FILE_BYTES,
	type DatasetFormat,
	type DatasetProfile,
	type DatasetProfileOptions,
	type DatasetProfileResult,
} from "./dataset-contracts.js";
import { profileTable, type RawTable, type TabularCell } from "./tabular.js";

const EXTENSION_FORMATS = new Map<string, DatasetFormat>([
	[".csv", "csv"],
	[".tsv", "csv"],
	[".json", "json"],
	[".jsonl", "json"],
	[".ndjson", "json"],
	[".xlsx", "xlsx"],
	[".xlsm", "xlsx"],
]);

interface JsonTableShape {
	readonly kind: "objects" | "arrays" | "invalid";
	readonly rows: readonly unknown[];
}

function classifyJsonRows(value: unknown): JsonTableShape {
	if (!Array.isArray(value)) return { kind: "invalid", rows: [] };
	if (value.length === 0) return { kind: "objects", rows: value };
	const allArrays = value.every((item) => Array.isArray(item));
	if (allArrays) return { kind: "arrays", rows: value };
	const allObjects = value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
	return { kind: allObjects ? "objects" : "invalid", rows: value };
}

function tableFromJsonRows(shape: JsonTableShape): RawTable | undefined {
	if (shape.kind === "arrays") {
		const matrix = shape.rows as readonly (readonly unknown[])[];
		if (matrix.length === 0) return undefined;
		const header = (matrix[0] ?? []).map((cell) => String(cell ?? ""));
		return {
			header,
			rows: matrix.slice(1).map((row) => row.map((cell): TabularCell => normalizeJsonCell(cell))),
		};
	}
	if (shape.kind === "objects") {
		const objects = shape.rows as readonly Record<string, unknown>[];
		const header: string[] = [];
		const seen = new Set<string>();
		for (const record of objects) {
			for (const key of Object.keys(record)) {
				if (!seen.has(key)) {
					seen.add(key);
					header.push(key);
				}
			}
		}
		return {
			header,
			rows: objects.map((record) => header.map((key) => normalizeJsonCell(record[key]))),
		};
	}
	return undefined;
}

function normalizeJsonCell(value: unknown): TabularCell {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (value instanceof Date) return value;
	return JSON.stringify(value);
}

async function tableFromXlsx(data: Uint8Array): Promise<RawTable | undefined> {
	// xlsx 只在本格式命中时才加载，避免把 ~1MB 依赖摊进每个会话。
	const xlsx = await import("xlsx");
	const workbook = xlsx.read(data, { type: "array", cellDates: true });
	const firstSheetName = workbook.SheetNames[0];
	if (!firstSheetName) return undefined;
	const matrix = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName]!, {
		header: 1,
		defval: null,
		raw: true,
	});
	if (matrix.length === 0) return undefined;
	const header = (matrix[0] ?? []).map((cell) => String(cell ?? ""));
	return {
		header,
		rows: matrix.slice(1).map((row) => row.map((cell): TabularCell => normalizeJsonCell(cell))),
	};
}

function formatOfPath(path: string): DatasetFormat | undefined {
	return EXTENSION_FORMATS.get(extname(path).toLowerCase());
}

/** 剖析一个本地 CSV/JSON/Excel 数据文件；绝不写入源文件。 */
export async function profileDatasetFile(path: string, options?: DatasetProfileOptions): Promise<DatasetProfileResult> {
	if (options?.signal?.aborted) return { ok: false, reason: "cancelled" };
	// 先 stat：目录/缺失的提示比格式白名单更贴近用户动作。
	const fileStat = await stat(path).catch(() => undefined);
	if (!fileStat) return { ok: false, reason: "missing" };
	if (!fileStat.isFile()) return { ok: false, reason: "not-a-file" };
	const format = formatOfPath(path);
	if (!format) {
		return { ok: false, reason: "unsupported-format", detail: extname(path).toLowerCase() || "(none)" };
	}
	if (fileStat.size === 0) return { ok: false, reason: "empty" };
	if (fileStat.size > DATASET_MAX_FILE_BYTES) return { ok: false, reason: "too-large" };

	const data = await readFile(path);
	if (options?.signal?.aborted) return { ok: false, reason: "cancelled" };

	let table: RawTable | undefined;
	try {
		if (format === "csv") {
			const delimiter = extname(path).toLowerCase() === ".tsv" ? "\t" : ",";
			const parsed = parseCsvText(data.toString("utf8"), delimiter);
			if (parsed.rows.length === 0) return { ok: false, reason: "empty" };
			table = { header: parsed.rows[0]!, rows: parsed.rows.slice(1) };
		} else if (format === "json") {
			const text = data.toString("utf8");
			const trimmed = text.trim();
			const parsed: unknown = trimmed.startsWith("[")
				? JSON.parse(trimmed)
				: trimmed
						.split("\n")
						.filter((line) => line.trim() !== "")
						.map((line) => JSON.parse(line));
			table = tableFromJsonRows(classifyJsonRows(parsed));
			if (!table) {
				return { ok: false, reason: "parse-failed", detail: "expected an array of objects or a row matrix" };
			}
		} else {
			table = await tableFromXlsx(data);
			if (!table) return { ok: false, reason: "parse-failed", detail: "workbook has no sheets" };
		}
	} catch (error) {
		return {
			ok: false,
			reason: "parse-failed",
			detail: error instanceof Error ? error.message : String(error),
		};
	}

	if (table.header.length === 0 || table.header.every((name) => String(name).trim() === "")) {
		return { ok: false, reason: "no-header" };
	}

	const profiled = profileTable(table, { signal: options?.signal });
	if (profiled.columns.length === 0 && profiled.rowCount === 0) {
		return { ok: false, reason: "cancelled" };
	}

	const expected = options?.expectedColumns ?? [];
	const headerSet = new Set(profiled.header.map((name) => name.trim().toLowerCase()));
	const missingColumns = expected.filter((name) => !headerSet.has(name.trim().toLowerCase()));

	const profile: DatasetProfile = {
		format,
		path,
		uri: pathToFileURL(path).href,
		sizeBytes: fileStat.size,
		modifiedAtMs: fileStat.mtimeMs,
		rowCount: profiled.rowCount,
		truncated: profiled.truncated,
		columns: profiled.columns,
		issues: profiled.issues,
		issueCount: profiled.issueCount,
		missingColumns,
	};
	return { ok: true, profile };
}
