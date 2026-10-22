// Copyright The Open Forge contributors.

/**
 * 数字按语言本地化：币种是合法 ISO 4217 代码时用货币格式（含符号与位次随 locale 变），
 * 否则退回「金额 + 代码」。ICU 不认该代码时也退回后者。
 */
export function formatBalanceValue(available: number, currency: string | undefined, locale: string): string {
	const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
	if (currency && /^[A-Za-z]{3}$/.test(currency)) {
		try {
			return new Intl.NumberFormat(locale, {
				style: "currency",
				currency: currency.toUpperCase(),
				...digits,
			}).format(available);
		} catch {
			// 非法/未知币种代码：落到「金额 + 代码」。
		}
	}
	const amount = new Intl.NumberFormat(locale, digits).format(available);
	return currency ? `${amount} ${currency}` : amount;
}
