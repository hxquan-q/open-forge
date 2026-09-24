// Copyright The Open Forge contributors.
import { TodoTabPanelView } from "@vetta-org/theme-ui/activity";
import { selectTodoStatusSummary, TodoProgressStyles, TodoTimeline } from "@vetta-org/theme-ui/chat";
import { useTranslation } from "react-i18next";
import { useTodoTabPanelModel } from "../hooks/useTodoTabPanelModel";

export function TodoTabPanel(): JSX.Element {
	const model = useTodoTabPanelModel();
	const { t } = useTranslation("chat");
	if (model.grouped) {
		// 多成员聚合：待办按归属成员分节，节头是成员名与该成员的完成计数；
		// 页签徽标仍统计全队未完成数。
		return (
			<div className="flex flex-1 flex-col overflow-y-auto">
				<TodoProgressStyles />
				{model.groups
					.filter((group) => group.items.length > 0)
					.map((group) => {
						const summary = selectTodoStatusSummary(group.items);
						return (
							<section key={group.runtimeId} className="border-b border-border/60 px-4 py-3 last:border-b-0">
								<header className="mb-2 flex items-center gap-2">
									<h3 className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground">
										{group.ownerLabel || t("activityPanel.todo.unattributed")}
									</h3>
									<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
										{model.labels.progress(summary.done, summary.total)}
									</span>
								</header>
								<TodoTimeline items={group.items} labels={model.labels} size="md" />
							</section>
						);
					})}
			</div>
		);
	}
	return <TodoTabPanelView items={model.items} emptyLabel={model.emptyLabel} labels={model.labels} />;
}
