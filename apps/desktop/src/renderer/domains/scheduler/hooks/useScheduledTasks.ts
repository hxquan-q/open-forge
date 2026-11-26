// Modified by The Open Forge contributors.
import type { AutomationTaskCreateRequest, AutomationTaskUpdateRequest } from "@preload/api-types/scheduler";
import { scheduledTasksAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { CRON_PRESETS } from "./CRON_PRESETS";

export { CRON_PRESETS };

export function useScheduledTasks() {
	const [tasks, setTasks] = useAtom(scheduledTasksAtom);

	const refreshTasks = useCallback(async () => {
		const loaded = await window.vetta.scheduler.getTasks();
		setTasks(loaded);
	}, [setTasks]);

	useEffect(() => {
		return window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type === "tasks.changed") {
				void refreshTasks();
			}
		});
	}, [refreshTasks]);

	const createTask = useCallback(
		async (data: AutomationTaskCreateRequest) => {
			const task = await window.vetta.scheduler.createTask(data);
			setTasks((prev) => [...prev, task]);

			return task;
		},
		[setTasks],
	);

	const updateTask = useCallback(
		async (id: string, patch: AutomationTaskUpdateRequest) => {
			await window.vetta.scheduler.updateTask(id, patch);
			setTasks((current) =>
				current.map((task) => {
					if (task.id !== id) return task;
					// 本地合并走 null 清除语义（ADR-0155）：null 的键视为删除，不把 null 写进 atom。
					const merged = { ...task, updatedAt: Date.now() };
					for (const [key, value] of Object.entries(patch)) {
						if (value === null) delete (merged as Record<string, unknown>)[key];
						else (merged as Record<string, unknown>)[key] = value;
					}
					return merged;
				}),
			);
		},
		[setTasks],
	);

	const deleteTask = useCallback(
		async (id: string) => {
			await window.vetta.scheduler.deleteTask(id);
			setTasks((current) => current.filter((task) => task.id !== id));
		},
		[setTasks],
	);

	const toggleTask = useCallback(
		async (id: string) => {
			await window.vetta.scheduler.toggleTask(id);
			setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled, updatedAt: Date.now() } : t)));
		},
		[setTasks],
	);

	const runNow = useCallback(async (id: string) => {
		await window.vetta.scheduler.runTaskNow(id);
	}, []);

	const abortTask = useCallback(async (id: string) => {
		await window.vetta.scheduler.abortTask(id);
	}, []);

	const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);

	return {
		tasks,
		createTask,
		updateTask,
		deleteTask,
		toggleTask,
		runNow,
		abortTask,
		getTask,
		refreshTasks,
		CRON_PRESETS,
	};
}
