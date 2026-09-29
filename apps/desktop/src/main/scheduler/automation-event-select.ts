// Copyright The Open Forge contributors.
import { type AutomationHostEventName, resolveAutomationTaskTrigger } from "@vetta/coding-agent/runtime";
import type { ScheduledTask } from "./task-storage.js";

export interface AutomationHostEventContext {
	readonly cwd?: string;
	readonly sessionId?: string;
	readonly sessionPath?: string;
}

/**
 * 纯选择：哪些启用中的事件任务应响应本次宿主事件。
 * 项目作用域：若事件带 cwd，只触发同 cwd 的任务。
 */
export function selectEventTriggeredTasks(
	tasks: readonly ScheduledTask[],
	event: AutomationHostEventName,
	context: AutomationHostEventContext = {},
): readonly ScheduledTask[] {
	return tasks.filter((task) => {
		if (!task.enabled) return false;
		const trigger = resolveAutomationTaskTrigger(task.trigger);
		if (trigger.type !== "event" || trigger.event !== event) return false;
		if (context.cwd && task.cwd && task.cwd !== context.cwd) return false;
		return true;
	});
}
