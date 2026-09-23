// Copyright The Open Forge contributors.

import { TerminalSurface } from "@domains/bottom-panel/terminal/TerminalSurface";
import { useTranslation } from "react-i18next";
import { useActivityTerminalHandle, useActivityTerminalMeta } from "../hooks/useActivityTerminalHandle";
import type { ActivityTabDefinition } from "../registry/types";

export const TERMINAL_ACTIVITY_TAB_ID = "terminal";

function TerminalActivityTab(): JSX.Element {
	const handle = useActivityTerminalHandle();
	return <TerminalSurface handle={handle} />;
}

export const terminalTabDefinition: ActivityTabDefinition = {
	id: TERMINAL_ACTIVITY_TAB_ID,
	order: 16,
	removable: true,
	initiallyVisible: false,
	source: "builtin",
	retention: "warm",
	useMeta: () => {
		const { t } = useTranslation("chat");
		const reported = useActivityTerminalMeta();
		return {
			label: reported?.label || t("activityPanel.tabs.terminal"),
			icon: reported?.icon ?? "icon-[solar--command-linear]",
		};
	},
	component: TerminalActivityTab,
};
