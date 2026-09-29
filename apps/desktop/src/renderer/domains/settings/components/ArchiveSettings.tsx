// Copyright The Open Forge contributors.
import { ArchiveSettingsView } from "@vetta-org/theme-ui/settings";
import { useTranslation } from "react-i18next";
import { ArchivedProjectsSettingsView } from "./ArchivedProjectsSettingsView";
import { ArchivedSessionsSettingsView } from "./ArchivedSessionsSettingsView";
import { useArchivedProjectsSettingsModel } from "./useArchivedProjectsSettingsModel";
import { useArchivedSessionsSettingsModel } from "./useArchivedSessionsSettingsModel";

/**
 * 「已归档」tab：归档有两类对象——项目与会话——各自一节，共用页标题。
 * 两节的数据源不同（配置里的 archivedProjects / 归档仓库快照），故各自持有 model。
 */
export function ArchiveSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const projectsModel = useArchivedProjectsSettingsModel();
	const sessionsModel = useArchivedSessionsSettingsModel();

	return (
		<ArchiveSettingsView title={t("tabArchive")}>
			<ArchivedProjectsSettingsView model={projectsModel} />
			<ArchivedSessionsSettingsView model={sessionsModel} />
		</ArchiveSettingsView>
	);
}
