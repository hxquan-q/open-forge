// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { useTranslation } from "react-i18next";
import { useProviderBalance } from "../../hooks/useProviderBalance";

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

export interface InputBarBalanceProps {
	/** 覆盖数据源；缺省读全局 selectedModelAtom（scoped 输入框传自己的 modelKey）。 */
	readonly modelKey?: string | null;
	/** 选型面板打开时自增，触发一次尊重缓存的重取。 */
	readonly refreshTick?: number;
}

/**
 * 输入栏选型区域旁的余额小字（次要文字样式，一行）。
 *
 * 未支持 provider 与查询失败一律**零渲染**（无空壳、无降级文案、零占位，D5）；仅在
 * 支持且成功时渲染「余额 <金额>」并附手动刷新入口。
 */
export function InputBarBalance({ modelKey, refreshTick }: InputBarBalanceProps): JSX.Element | null {
	const { t, i18n } = useTranslation("common");
	const { view, refresh } = useProviderBalance({ modelKey, refreshTick });
	if (!view.visible || view.available === undefined) return null;

	const refreshLabel = t("modelSelect.balance.refresh");
	return (
		<span
			data-testid="provider-balance"
			className="flex min-w-0 shrink items-center gap-0.5 text-[11px] leading-none text-muted-foreground"
		>
			<span className="truncate">
				{t("modelSelect.balance.label", { value: formatBalanceValue(view.available, view.currency, i18n.language) })}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className="size-4 shrink-0"
				title={refreshLabel}
				aria-label={refreshLabel}
				onClick={refresh}
			>
				<span aria-hidden="true" className="icon-[solar--refresh-linear] size-3" />
			</Button>
		</span>
	);
}
