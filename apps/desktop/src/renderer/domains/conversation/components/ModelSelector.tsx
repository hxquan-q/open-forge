// Modified by The Open Forge contributors.
import { useThemeComponent } from "@vetta-org/theme-sdk";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ModelSelectorScope, useModelSelectorModel } from "../hooks/useModelSelectorModel";
import { useProviderBalance } from "../hooks/useProviderBalance";
import { ModelSelectorView } from "@vetta-org/theme-ui/chat";
import { formatBalanceValue } from "../lib/balance-value-format";

export function ModelSelector({
	updateActiveSession = true,
	scope,
}: {
	readonly updateActiveSession?: boolean;
	readonly scope?: ModelSelectorScope;
} = {}): JSX.Element {
	const { t, i18n } = useTranslation("common");
	const model = useModelSelectorModel({ updateActiveSession, scope });
	// 选型面板每次打开自增，作为余额「打开时拉取」的触发信号（尊重 60s 缓存，D4）。
	const [refreshTick, setRefreshTick] = useState(0);
	const { view, refresh } = useProviderBalance({ modelKey: scope?.modelKey, refreshTick });
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	// 视图自带的 onOpenChange 仍要转发给 hook（打开时重校验目录）；打开时顺带触发余额重取。
	const notifyCatalog = model.viewProps.onOpenChange;
	const handleOpenChange = useCallback(
		(open: boolean) => {
			notifyCatalog?.(open);
			if (open) setRefreshTick((tick) => tick + 1);
		},
		[notifyCatalog],
	);

	// 余额归属当前选中模型的 provider；失败/不支持/无选中模型时不下发，视图零渲染（D6）。
	const provider = model.viewProps.selectedOption?.provider;
	const balance =
		provider && view.visible && view.available !== undefined
			? {
					provider,
					text: t("modelSelect.balance.label", {
						value: formatBalanceValue(view.available, view.currency, i18n.language),
					}),
					labels: {
						show: t("modelSelect.balance.show"),
						hide: t("modelSelect.balance.hide"),
						refresh: t("modelSelect.balance.refresh"),
					},
					onRefresh: refresh,
				}
			: undefined;

	if (model.empty) return <></>;
	return <ThemedModelSelectorView {...model.viewProps} balance={balance} onOpenChange={handleOpenChange} />;
}
