// Modified by The Open Forge contributors.

/**
 * 词法检索查询计划（TASK-0372，纯函数，无 I/O）。
 *
 * 合同（TASK-0368 probe 实证 + PLAN-0021 S2）：
 * - FTS5 原始语法不透传：任意用户输入按字符串字面量转义（双引号包裹、
 *   内部引号翻倍），引号/星号/操作符只作字面文本。
 * - unicode61 不做 CJK 分词；trigram <3 个 Unicode 字符不匹配：短词（1/2 字
 *   或任何不足以走 trigram 的查询）走参数化 instr 回退，且只在已授权/有效
 *   行内有界扫描。
 * - 无命中、降级与错误不混同：计划显式标注 matchKind 与 degraded。
 */

export interface LexicalQueryPlan {
	/** 逐字匹配的安全字面量（已转义，可直接作为 FTS MATCH 参数）。 */
	readonly ftsLiteral: string;
	/** 厽中方式：trigram 全文 / instr 短词回退。 */
	readonly matchKind: "trigram" | "instr-fallback";
	/** 是否降级（原始查询无法走 trigram）。 */
	readonly degraded: boolean;
	/** instr 回退使用的原始词（参数化绑定，永不拼接 SQL）。 */
	readonly instrTerm?: string;
	/** 建议结果上限。 */
	readonly limit: number;
}

/** FTS5 字符串字面量转义：引号内文本按字面处理。 */
export function escapeFts5StringLiteral(input: string): string {
	if (typeof input !== "string") {
		throw new TypeError("FTS5 字面量转义只接受 string 输入");
	}
	return `"${input.replaceAll('"', '""')}"`;
}

/** Unicode 码点数（trigram 合同按 Unicode 字符计，不按 UTF-16 单元）。 */
export function unicodeLength(input: string): number {
	return [...input].length;
}

/**
 * 制定查询计划：≥3 个 Unicode 字符走 trigram（含路径/错误码等 ASCII 查询）；
 * 1–2 字短词只走 instr 回退并标记 degraded。LIKE 通配符（%/_）在两种路径
 * 中都只是普通字符：FTS 侧被引号字面量保护，instr 侧参数化绑定。
 */
export function planLexicalQuery(rawQuery: string, options: { readonly limit?: number } = {}): LexicalQueryPlan {
	const query = rawQuery.trim();
	if (query === "") {
		throw new Error("词法查询不能为空");
	}
	const limit = options.limit ?? 20;
	if (limit <= 0 || !Number.isInteger(limit)) {
		throw new Error("limit 必须是正整数");
	}
	const length = unicodeLength(query);
	if (length < 3) {
		return {
			ftsLiteral: escapeFts5StringLiteral(query),
			matchKind: "instr-fallback",
			degraded: true,
			instrTerm: query,
			limit,
		};
	}
	return {
		ftsLiteral: escapeFts5StringLiteral(query),
		matchKind: "trigram",
		degraded: false,
		limit,
	};
}
