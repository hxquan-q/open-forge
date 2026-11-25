// Modified by The Open Forge contributors.
import { AutomationPageView as ThemeAutomationPageView } from "@vetta-org/theme-ui/scheduler";
import { useTranslation } from "react-i18next";
import { SettingsAiAssist } from "../../settings/ai-assist";
import { AutomationPackageActions } from "./AutomationPackageActions";
import { AutomationDetailPane } from "./AutomationDetailPane";
import { TaskList } from "./TaskList";
import type { AutomationPageModel } from "../hooks/useAutomationPageModel";

export function AutomationPageView(model: AutomationPageModel): JSX.Element {
	const { t } = useTranslation("automation");
	const paneOpen = model.pane.kind !== "none";

	return (
		<ThemeAutomationPageView
			labels={{
				title: t("page.title"),
				subtitle: t("page.subtitle"),
				create: t("page.newTask"),
				searchPlaceholder: t("list.searchPlaceholder"),
				recommendTitle: t("recommend.title"),
				recommendUse: t("recommend.use"),
			}}
			filters={model.filters}
			activeFilter={model.activeFilter}
			onFilterChange={model.onFilterChange}
			searchValue={model.search}
			onSearchChange={model.onSearchChange}
			onCreate={model.onCreate}
			headerTrailing={
				<>
					<AutomationPackageActions />
					<SettingsAiAssist tabId="automation" />
				</>
			}
			list={
				<TaskList
					selectedTaskId={model.selectedTaskId}
					filter={model.activeFilter}
					search={model.search}
					onSelectTask={model.onSelectTask}
				/>
			}
			recommendations={model.hasTasks ? undefined : model.recommendations}
			onSelectRecommendation={model.onSelectRecommendation}
			detail={
				paneOpen ? (
					<AutomationDetailPane
						key={model.pane.kind === "create" ? `create-${model.pane.key}` : model.pane.task?.id}
						task={model.pane.kind === "task" ? model.pane.task : null}
						createInitial={model.pane.kind === "create" ? model.pane.draft : undefined}
						onClose={model.onClosePane}
						onCreated={model.onCreated}
					/>
				) : undefined
			}
			detailWidth={model.detailWidth}
			minDetailWidth={model.minDetailWidth}
			maxDetailWidth={model.maxDetailWidth}
			onDetailWidthChange={model.onDetailWidthChange}
			onDetailResizeStart={model.onDetailResizeStart}
			onDetailResizeEnd={model.onDetailResizeEnd}
		/>
	);
}
