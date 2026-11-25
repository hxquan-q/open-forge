// Modified by The Open Forge contributors.
import type { ScheduledTask } from "@shared/store/atoms";

/** 列表与分屏共用的任务状态。本地无 suspended；done 是一次性任务已跑完并停用。 */
export type AutomationTaskTone = "active" | "running" | "paused" | "done";

export type AutomationListFilter = "all" | "enabled" | "paused" | "done";

export const AUTOMATION_LIST_FILTERS: readonly AutomationListFilter[] = ["all", "enabled", "paused", "done"];

export function automationTaskTone(task: ScheduledTask, running: boolean): AutomationTaskTone {
	if (running) return "running";
	if (!task.enabled) return "paused";
	if (task.isOnce && task.lastRunAt !== null) return "done";
	return "active";
}

export function matchesAutomationFilter(tone: AutomationTaskTone, filter: AutomationListFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "enabled":
			return tone === "active" || tone === "running";
		case "paused":
			return tone === "paused";
		case "done":
			return tone === "done";
	}
}
