// Copyright The Open Forge contributors.
// AC-6：金额格式化规则从 `InputBarBalance.tsx` 逐字迁移到 `lib/balance-value-format.ts`。
// 断言迁移自退役的 `InputBarBalance.test.tsx` 的 `describe("formatBalanceValue")`，覆盖不缩水：
// 合法币种走 Intl 货币格式、无币种退回数字、非法（非 3 位字母）币种退回「金额 + 代码」，
// 并补齐 locale 差异与大小写币种。
import { describe, expect, it } from "vitest";
import { formatBalanceValue } from "./balance-value-format";

const DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

function intlCurrency(value: number, currency: string, locale: string): string {
	return new Intl.NumberFormat(locale, { style: "currency", currency, ...DIGITS }).format(value);
}

describe("formatBalanceValue", () => {
	it("合法币种走 locale 货币格式", () => {
		// 沿用旧断言：结果必须与 Intl 货币格式逐字一致（符号、千分位、两位小数）。
		expect(formatBalanceValue(1234.5, "USD", "en")).toBe(intlCurrency(1234.5, "USD", "en"));
		expect(formatBalanceValue(42.5, "CNY", "zh")).toBe(intlCurrency(42.5, "CNY", "zh"));
		expect(formatBalanceValue(1234.5, "USD", "en")).toBe("$1,234.50");
		expect(formatBalanceValue(42.5, "CNY", "zh")).toBe("¥42.50");
	});

	it("无币种 → 纯本地化数字（两位小数）", () => {
		expect(formatBalanceValue(10, undefined, "en")).toBe("10.00");
		expect(formatBalanceValue(10, undefined, "zh")).toBe("10.00");
	});

	it("非 3 位字母的币种代码不走货币格式，退回「金额 + 代码」", () => {
		expect(formatBalanceValue(10, "CNYX", "en")).toBe("10.00 CNYX");
		expect(formatBalanceValue(10, "12", "zh")).toBe("10.00 12");
	});

	it("3 位字母币种先转大写再交给 Intl（小写 usd 与 USD 等价）", () => {
		expect(formatBalanceValue(10, "usd", "en")).toBe(intlCurrency(10, "USD", "en"));
		expect(formatBalanceValue(10, "usd", "en")).toBe("$10.00");
	});

	it("数字与货币符号随 locale 变化（zh 与 en 输出不同）", () => {
		const zh = formatBalanceValue(1234.5, "USD", "zh");
		const en = formatBalanceValue(1234.5, "USD", "en");
		expect(zh).toBe("US$1,234.50");
		expect(en).toBe("$1,234.50");
		expect(zh).not.toBe(en);
		// 金额本身的两位小数在两种 locale 下都保留。
		expect(zh).toContain("1,234.50");
		expect(en).toContain("1,234.50");
	});
});
