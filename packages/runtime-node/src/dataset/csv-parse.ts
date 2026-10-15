// Copyright The Open Forge contributors.

/**
 * 最小 RFC 4180 CSV 解析：双引号包围、``""`` 转义、逗号分隔、CRLF/LF。
 * 只产出字符串矩阵；列类型推断与问题行判定在 tabular.ts。
 */

export interface CsvParseResult {
	readonly rows: string[][];
}

/** 解析 CSV/TSV 文本为行矩阵；首部 BOM 被剥掉，末尾空行被丢弃。 */
export function parseCsvText(text: string, delimiter = ","): CsvParseResult {
	const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;
	let rowHasContent = false;

	for (let i = 0; i < source.length; i += 1) {
		const ch = source[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (source[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			rowHasContent = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = "";
			rowHasContent = true;
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && source[i + 1] === "\n") i += 1;
			row.push(field);
			field = "";
			if (rowHasContent || row.length > 1) rows.push(row);
			row = [];
			rowHasContent = false;
		} else {
			field += ch;
			rowHasContent = true;
		}
	}
	if (inQuotes) {
		// 未闭合引号：把残字段当完整字段处理，行结构问题交给 ragged 判定。
	}
	if (field !== "" || row.length > 0 || rowHasContent) {
		row.push(field);
		rows.push(row);
	}
	return { rows };
}
