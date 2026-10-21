// Modified by The Open Forge contributors.
import { useThemeComponent } from "@vetta-org/theme-sdk";
import { useCallback } from "react";
import { type ModelSelectorScope, useModelSelectorModel } from "../hooks/useModelSelectorModel";
import { ModelSelectorView } from "@vetta-org/theme-ui/chat";

export function ModelSelector({
	updateActiveSession = true,
	scope,
	onOpenChange,
}: {
	readonly updateActiveSession?: boolean;
	readonly scope?: ModelSelectorScope;
	/** 选型面板开合回调；宿主据此在打开时刷新余额等旁挂数据（不改视图合同，D3）。 */
	readonly onOpenChange?: (open: boolean) => void;
} = {}): JSX.Element {
	const model = useModelSelectorModel({ updateActiveSession, scope });
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	// 视图自带的 onOpenChange 仍要转发给 hook（打开时重校验目录），外部回调只做旁挂刷新。
	const notifyCatalog = model.viewProps.onOpenChange;
	const handleOpenChange = useCallback(
		(open: boolean) => {
			notifyCatalog?.(open);
			onOpenChange?.(open);
		},
		[notifyCatalog, onOpenChange],
	);
	if (model.empty) return <></>;
	return <ThemedModelSelectorView {...model.viewProps} onOpenChange={handleOpenChange} />;
}
