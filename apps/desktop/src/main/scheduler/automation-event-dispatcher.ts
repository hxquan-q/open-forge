// Copyright The Open Forge contributors.
/**
 * 宿主事件 → 自动化任务派发（TASK-0118）。
 *
 * 语义：错过不补跑、运行中跳过、失败不阻塞宿主事件（旁路 fire-and-forget）。
 */
import { type AutomationHostEventName, isCronTriggered } from "@vetta/coding-agent/runtime";
import type { RuntimeHost } from "@vetta/runtime-core";
import { getAppLogger } from "../logger.js";
import { type AutomationHostEventContext, selectEventTriggeredTasks } from "./automation-event-select.js";
import { executeTask, isTaskRunning } from "./task-executor.js";
import { loadTasks, type ScheduledTask, updateTaskEnabled } from "./task-storage.js";

export type { AutomationHostEventContext } from "./automation-event-select.js";
export { selectEventTriggeredTasks } from "./automation-event-select.js";

const log = getAppLogger("automation-events");

export interface AutomationEventDispatcherDependencies {
	readonly getRuntime: () => RuntimeHost;
	readonly loadEnabledTasks?: () => Promise<readonly ScheduledTask[]>;
}

export async function dispatchAutomationHostEvent(
	event: AutomationHostEventName,
	context: AutomationHostEventContext = {},
	dependencies: AutomationEventDispatcherDependencies,
): Promise<readonly string[]> {
	let tasks: readonly ScheduledTask[];
	try {
		tasks = dependencies.loadEnabledTasks
			? await dependencies.loadEnabledTasks()
			: (await loadTasks()).filter((task) => task.enabled && !isCronTriggered(task.trigger));
	} catch (error) {
		log.warn(`Failed to load tasks for ${event}:`, error);
		return [];
	}

	const matched = selectEventTriggeredTasks(tasks, event, context);
	const started: string[] = [];

	for (const task of matched) {
		if (isTaskRunning(task.id)) {
			log.info(`Skip overlapping event task ${task.id} (${event})`);
			continue;
		}
		started.push(task.id);
		void executeTask(task, dependencies.getRuntime(), {
			onOneTimeCompleted: async () => {
				await updateTaskEnabled(task.id, false);
			},
		}).catch((error) => {
			log.error(`Event task failed ${task.id} (${event}):`, error);
		});
	}

	if (started.length > 0) {
		log.info(`Dispatched ${event} → ${started.length} task(s)`);
	}
	return started;
}

/** 模块级入口：宿主各域调用，失败吞掉以免拖垮主路径。 */
export function emitAutomationHostEvent(
	event: AutomationHostEventName,
	context: AutomationHostEventContext = {},
	getRuntime: () => RuntimeHost,
): void {
	void dispatchAutomationHostEvent(event, context, { getRuntime }).catch((error) => {
		log.warn(`emitAutomationHostEvent(${event}) failed:`, error);
	});
}
