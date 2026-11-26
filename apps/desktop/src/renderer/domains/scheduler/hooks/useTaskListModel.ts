// Modified by The Open Forge contributors.
import type { ScheduledTask } from "@shared/store/atoms";
import { runningTaskIdsAtom, scheduledTasksAtom } from "@shared/store/atoms";
import type { TFunction } from "i18next";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	type AutomationListFilter,
	type AutomationTaskTone,
	automationTaskTone,
	matchesAutomationFilter,
} from "../automation-status";
import { describeTaskSchedule } from "../components/schedule-picker/cron-utils";

export interface TaskListItemModel {
	readonly id: string;
	readonly name: string;
	readonly subtitle: string;
	readonly tone: AutomationTaskTone;
	readonly isSelected: boolean;
}

export interface TaskListModel {
	readonly items: readonly TaskListItemModel[];
	readonly emptyLabel: string | undefined;
}

interface UseTaskListModelOptions {
	readonly selectedTaskId: string | null;
	readonly filter: AutomationListFilter;
	readonly search: string;
}

export function useTaskListModel({ selectedTaskId, filter, search }: UseTaskListModelOptions): TaskListModel {
	const { t } = useTranslation("automation");
	const tasks = useAtomValue(scheduledTasksAtom);
	const runningTaskIds = useAtomValue(runningTaskIdsAtom);

	return useMemo(() => {
		const normalizedSearch = search.trim().toLowerCase();
		const filtered = tasks.filter((task) => {
			const tone = automationTaskTone(task, runningTaskIds.has(task.id));
			if (!matchesAutomationFilter(tone, filter)) return false;
			if (normalizedSearch) {
				return (
					task.name.toLowerCase().includes(normalizedSearch) ||
					task.prompt.toLowerCase().includes(normalizedSearch) ||
					scheduleLabel(task, t).toLowerCase().includes(normalizedSearch)
				);
			}
			return true;
		});
		const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
		return {
			items: sorted.map((task) => {
				const tone = automationTaskTone(task, runningTaskIds.has(task.id));
				const schedule = scheduleLabel(task, t);
				const lastRun =
					task.lastRunAt !== null
						? ` · ${formatLastRun(task.lastRunAt, t)} ${lastRunStatusLabel(task.lastRunStatus, t)}`
						: ` · ${t("list.neverRun")}`;
				return {
					id: task.id,
					name: task.name,
					subtitle: `${schedule}${lastRun}`,
					tone,
					isSelected: selectedTaskId === task.id,
				};
			}),
			// 一个任务都没有时由页面展示推荐模板；有任务但被筛掉时才提示。
			emptyLabel:
				tasks.length === 0
					? undefined
					: sorted.length === 0
						? normalizedSearch
							? t("list.emptySearch")
							: t("list.emptyFilter")
						: undefined,
		};
	}, [filter, runningTaskIds, search, selectedTaskId, t, tasks]);
}

function scheduleLabel(task: ScheduledTask, t: TFunction<"automation">): string {
	return describeTaskSchedule(task, t);
}

function formatLastRun(timestamp: number, t: TFunction<"automation">): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	if (diffMinutes < 1) return t("list.justNow");
	if (diffMinutes < 60) return t("list.minutesAgo", { n: diffMinutes });
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return t("list.hoursAgo", { n: diffHours });
	const diffDays = Math.floor(diffHours / 24);
	return t("list.daysAgo", { n: diffDays });
}

function lastRunStatusLabel(status: ScheduledTask["lastRunStatus"], t: TFunction<"automation">): string {
	if (status === "success") return t("list.success");
	if (status === "failed") return t("list.failed");
	return "";
}
