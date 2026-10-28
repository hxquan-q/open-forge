// Modified by The Open Forge contributors.
import { useTranslation } from "react-i18next";
import { GitTabPanel } from "../components/git-tab/GitTabPanel";
import { useActivityPanelCwd } from "../registry/context";
import type { ActivityTabDefinition } from "../registry/types";
import { useGitRepoStatus } from "@shared/hooks/useGitRepoStatus";

function GitActivityTab(): JSX.Element {
	const cwd = useActivityPanelCwd();
	return <GitTabPanel cwd={cwd} />;
}

export const gitTabDefinition: ActivityTabDefinition = {
	id: "git",
	order: 5,
	removable: true,
	source: "builtin",
	useMeta: () => {
		const { t } = useTranslation("chat");
		const cwd = useActivityPanelCwd();
		const { status } = useGitRepoStatus(cwd);
		// 页签常显（非 git 仓库在面板内给占位说明），有变更时角标计数。
		return {
			label: t("activityPanel.tabs.git"),
			icon: "icon-[mdi--source-branch]",
			badge: status?.changes.length || undefined,
		};
	},
	component: GitActivityTab,
};
