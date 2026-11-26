// Modified by The Open Forge contributors.
import type { ScheduledTask } from "@shared/store/atoms";

/**
 * 列表与分屏共用的任务状态。suspended 是目标失效导致的暂停（ADR-0155 §2），
 * 视觉上与用户手动暂停分开；done 是一次性任务已跑完并停用。
 */
export type AutomationTaskTone = "active" | "running" | "paused" | "suspended" | "done";

export type AutomationListFilter = "all" | "enabled" | "paused" | "done";

export const AUTOMATION_LIST_FILTERS: readonly AutomationListFilter[] = ["all", "enabled", "paused", "done"];

export function automationTaskTone(task: ScheduledTask, running: boolean): AutomationTaskTone {
	if (running) return "running";
	if (!task.enabled) return task.suspendedReason ? "suspended" : "paused";
	if (task.schedule?.kind === "once" && task.lastRunAt !== null) return "done";
	return "active";
}

export function matchesAutomationFilter(tone: AutomationTaskTone, filter: AutomationListFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "enabled":
			return tone === "active" || tone === "running";
		case "paused":
			return tone === "paused" || tone === "suspended";
		case "done":
			return tone === "done";
	}
}
