// Copyright The Open Forge contributors.

import { useTranslation } from "react-i18next";
import { AiTerminalReplayPanel } from "../components/terminal-tab/AiTerminalReplayPanel";
import type { ActivityTabDefinition } from "../registry/types";

export const TERMINAL_ACTIVITY_TAB_ID = "terminal";

function TerminalActivityTab(): JSX.Element {
	// 演示定稿：终端页签的 body 是 AI 命令回放（只读投屏），不再挂右栏 PTY
	// 终端——交互终端仍在底部面板。页签本体与可见性规则不变。
	return <AiTerminalReplayPanel />;
}

export const terminalTabDefinition: ActivityTabDefinition = {
	id: TERMINAL_ACTIVITY_TAB_ID,
	// 演示定稿：code 会话右栏自带页签，顺序「文件(0)、Git(5)、终端、浏览器(15)」。
	order: 6,
	removable: true,
	source: "builtin",
	retention: "warm",
	useMeta: () => {
		const { t } = useTranslation("chat");
		return {
			label: t("activityPanel.tabs.terminal"),
			icon: "icon-[solar--command-linear]",
		};
	},
	component: TerminalActivityTab,
};
