import { stat } from "node:fs/promises";
import { normalizeAutomationTaskTrigger, normalizeUnattendedPermissionTiers } from "@vetta/coding-agent/runtime";
import type { RuntimeHost } from "@vetta/runtime-core";
import { recordAutomationTaskCreated } from "../app-monitor/app-monitor-service.js";
import { isValidCronExpression } from "./cron.js";
import { abortTask, executeTask, isTaskRunning } from "./task-executor.js";
import {
	deleteTaskRecords,
	generateId,
	loadRecords,
	loadTasks,
	mutateTasks,
	type ScheduledTask,
	type TaskExecutionRecord,
	updateTaskEnabled,
} from "./task-storage.js";

export type CreateScheduledTaskInput = Omit<
	ScheduledTask,
	"id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus"
>;

/** 任务包导入：保留包 id，强制停用。 */
export type ImportScheduledTaskInput = Omit<
	ScheduledTask,
	"createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus"
> & {
	readonly enabled: false;
};

export type UpdateScheduledTaskInput = Partial<
	Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">
>;

export interface SchedulerCommandResult {
	status: "accepted" | "noop";
	taskId: string;
}

export interface SchedulerServiceDependencies {
	getRuntime: () => RuntimeHost;
	scheduleTask: (task: ScheduledTask) => void;
	unscheduleTask: (taskId: string) => void;
}

export class SchedulerServiceError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly details?: Record<string, string | string[]>,
	) {
		super(message);
		this.name = "SchedulerServiceError";
	}
}

const SCHEDULER_TASK_KEYS = new Set([
	"name",
	"prompt",
	"cron",
	"isOnce",
	"enabled",
	"cwd",
	"modelKey",
	"executionMode",
	"skill",
	"permissionTiers",
	"trigger",
]);

function isNonBlankString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isExecutionMode(value: unknown): boolean {
	return value === "inherit" || value === "sandbox" || value === "full-access";
}

function isPermissionTiers(value: unknown): boolean {
	if (value === undefined) return true;
	if (value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
		// 空对象表示清除全部无人值守授权。
		return true;
	}
	return normalizeUnattendedPermissionTiers(value) !== undefined;
}

function isTrigger(value: unknown): boolean {
	if (value === undefined) return true;
	return normalizeAutomationTaskTrigger(value) !== undefined;
}

function resolvedTriggerType(value: unknown): "cron" | "event" | "manual" {
	const normalized = normalizeAutomationTaskTrigger(value);
	return normalized?.type ?? "cron";
}

function isSelectedSkill(value: unknown): boolean {
	if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
	const skill = value as Record<string, unknown>;
	return (
		isNonBlankString(skill.name) &&
		(skill.alias === undefined || isNonBlankString(skill.alias)) &&
		(skill.type === "skill" || skill.type === "scene") &&
		Object.keys(skill).every((key) => key === "name" || key === "alias" || key === "type")
	);
}

function assertCreateTaskInput(value: unknown): asserts value is CreateScheduledTaskInput {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		throw new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", "Scheduled task input must be an object.");
	}
	const input = value as Record<string, unknown>;
	const triggerType = resolvedTriggerType(input.trigger);
	const cronOk =
		triggerType === "cron" ? isNonBlankString(input.cron) : input.cron === undefined || isNonBlankString(input.cron);
	const valid =
		Object.keys(input).every((key) => SCHEDULER_TASK_KEYS.has(key)) &&
		isNonBlankString(input.name) &&
		isNonBlankString(input.prompt) &&
		cronOk &&
		typeof input.isOnce === "boolean" &&
		typeof input.enabled === "boolean" &&
		isNonBlankString(input.cwd) &&
		(input.modelKey === undefined || isNonBlankString(input.modelKey)) &&
		(input.executionMode === undefined || isExecutionMode(input.executionMode)) &&
		(input.skill === undefined || isSelectedSkill(input.skill)) &&
		isPermissionTiers(input.permissionTiers) &&
		isTrigger(input.trigger) &&
		(triggerType !== "event" ||
			(typeof input.trigger === "object" &&
				input.trigger != null &&
				!Array.isArray(input.trigger) &&
				(input.trigger as { event?: unknown }).event !== undefined));
	if (!valid) {
		throw new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", "Invalid scheduled task create input.");
	}
}

function assertUpdateTaskInput(value: unknown): asserts value is UpdateScheduledTaskInput {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		throw new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", "Scheduled task update must be an object.");
	}
	const input = value as Record<string, unknown>;
	const valid =
		Object.keys(input).length > 0 &&
		Object.keys(input).every((key) => SCHEDULER_TASK_KEYS.has(key)) &&
		(input.name === undefined || isNonBlankString(input.name)) &&
		(input.prompt === undefined || isNonBlankString(input.prompt)) &&
		(input.cron === undefined || isNonBlankString(input.cron)) &&
		(input.isOnce === undefined || typeof input.isOnce === "boolean") &&
		(input.enabled === undefined || typeof input.enabled === "boolean") &&
		(input.cwd === undefined || isNonBlankString(input.cwd)) &&
		(input.modelKey === undefined || isNonBlankString(input.modelKey)) &&
		(input.executionMode === undefined || isExecutionMode(input.executionMode)) &&
		(input.skill === undefined || isSelectedSkill(input.skill)) &&
		(input.permissionTiers === undefined || isPermissionTiers(input.permissionTiers)) &&
		(input.trigger === undefined || isTrigger(input.trigger));
	if (!valid) {
		throw new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", "Invalid scheduled task update input.");
	}
}

export class SchedulerService {
	private readonly changeHandlers = new Set<() => void>();

	constructor(private readonly dependencies: SchedulerServiceDependencies) {}

	onTasksChanged(handler: () => void): () => void {
		this.changeHandlers.add(handler);
		return () => {
			this.changeHandlers.delete(handler);
		};
	}

	async listTasks(): Promise<ScheduledTask[]> {
		return await loadTasks();
	}

	async getTask(taskId: string): Promise<ScheduledTask> {
		return await this.requireTask(taskId);
	}

	async getHistory(taskId: string): Promise<TaskExecutionRecord[]> {
		await this.requireTask(taskId);
		return await loadRecords(taskId);
	}

	async createTask(data: CreateScheduledTaskInput): Promise<ScheduledTask> {
		assertCreateTaskInput(data);
		const trigger = normalizeAutomationTaskTrigger(data.trigger) ?? { type: "cron" };
		if (trigger.type === "cron") {
			this.assertCron(data.cron);
		} else if (data.cron !== undefined && data.cron.trim().length > 0) {
			this.assertCron(data.cron);
		}
		await this.assertDirectory(data.cwd);
		const now = Date.now();
		const permissionTiers = normalizeUnattendedPermissionTiers(data.permissionTiers);
		const task: ScheduledTask = {
			...data,
			cron: data.cron?.trim() ? data.cron : trigger.type === "cron" ? data.cron : "0 0 1 1 *",
			...(permissionTiers !== undefined ? { permissionTiers } : {}),
			...(trigger.type === "cron" ? {} : { trigger }),
			id: generateId(),
			createdAt: now,
			updatedAt: now,
			lastRunAt: null,
			lastRunStatus: null,
		};
		if (permissionTiers === undefined) {
			delete task.permissionTiers;
		}
		if (trigger.type === "cron") {
			delete task.trigger;
		}
		await mutateTasks((tasks) => {
			tasks.push(task);
		});
		if (task.enabled) {
			this.dependencies.scheduleTask(task);
		}
		this.emitTasksChanged();
		recordAutomationTaskCreated();
		return task;
	}

	/**
	 * 从自动化任务包导入：使用包 id 作为任务 id，**强制 enabled=false**，同 id 不覆盖。
	 */
	async importTask(data: ImportScheduledTaskInput): Promise<ScheduledTask> {
		if (data.enabled !== false) {
			throw new SchedulerServiceError(
				"SCHEDULER_IMPORT_MUST_DISABLE",
				"Imported automation packages must be disabled.",
			);
		}
		if (!isNonBlankString(data.id)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", "Imported task id is required.");
		}
		assertCreateTaskInput({
			name: data.name,
			prompt: data.prompt,
			cron: data.cron,
			isOnce: data.isOnce,
			enabled: false,
			cwd: data.cwd,
			modelKey: data.modelKey,
			executionMode: data.executionMode,
			skill: data.skill,
			permissionTiers: data.permissionTiers,
		});
		this.assertCron(data.cron);
		await this.assertDirectory(data.cwd);
		const existing = await loadTasks();
		if (existing.some((task) => task.id === data.id)) {
			throw new SchedulerServiceError("SCHEDULER_IMPORT_ID_EXISTS", "A task with this package id already exists.", {
				taskId: data.id,
			});
		}
		const now = Date.now();
		const permissionTiers = normalizeUnattendedPermissionTiers(data.permissionTiers);
		const task: ScheduledTask = {
			...data,
			enabled: false,
			...(permissionTiers !== undefined ? { permissionTiers } : {}),
			createdAt: now,
			updatedAt: now,
			lastRunAt: null,
			lastRunStatus: null,
		};
		if (permissionTiers === undefined) {
			delete task.permissionTiers;
		}
		await mutateTasks((tasks) => {
			tasks.push(task);
		});
		// 导入强制停用：不 schedule。
		this.emitTasksChanged();
		recordAutomationTaskCreated();
		return task;
	}

	async updateTask(taskId: string, patch: UpdateScheduledTaskInput): Promise<ScheduledTask> {
		assertUpdateTaskInput(patch);
		if (patch.cron !== undefined) {
			this.assertCron(patch.cron);
		}
		if (patch.cwd !== undefined) {
			await this.assertDirectory(patch.cwd);
		}
		const task = await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			const permissionTiers =
				patch.permissionTiers !== undefined
					? normalizeUnattendedPermissionTiers(patch.permissionTiers)
					: tasks[index].permissionTiers;
			const nextTrigger =
				patch.trigger !== undefined
					? (normalizeAutomationTaskTrigger(patch.trigger) ?? { type: "cron" as const })
					: tasks[index].trigger;
			const updated: ScheduledTask = {
				...tasks[index],
				...patch,
				id: tasks[index].id,
				createdAt: tasks[index].createdAt,
				lastRunAt: tasks[index].lastRunAt,
				lastRunStatus: tasks[index].lastRunStatus,
				updatedAt: Date.now(),
				...(permissionTiers !== undefined ? { permissionTiers } : {}),
				...(nextTrigger !== undefined && nextTrigger.type !== "cron" ? { trigger: nextTrigger } : {}),
			};
			if (patch.permissionTiers !== undefined && permissionTiers === undefined) {
				delete updated.permissionTiers;
			}
			if (patch.trigger !== undefined && (nextTrigger === undefined || nextTrigger.type === "cron")) {
				delete updated.trigger;
			}
			tasks[index] = updated;
			return updated;
		});
		this.syncScheduledJob(task);
		this.emitTasksChanged();
		return task;
	}

	async deleteTask(taskId: string): Promise<SchedulerCommandResult> {
		if (isTaskRunning(taskId)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "运行中的定时任务不能删除，请先中止。", {
				taskId,
			});
		}
		await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			tasks.splice(index, 1);
		});
		this.dependencies.unscheduleTask(taskId);
		await deleteTaskRecords(taskId);
		this.emitTasksChanged();
		return { status: "accepted", taskId };
	}

	async setEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask> {
		return await this.updateTask(taskId, { enabled });
	}

	async toggleTask(taskId: string): Promise<ScheduledTask> {
		const task = await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			const updated = {
				...tasks[index],
				enabled: !tasks[index].enabled,
				updatedAt: Date.now(),
			};
			tasks[index] = updated;
			return updated;
		});
		this.syncScheduledJob(task);
		this.emitTasksChanged();
		return task;
	}

	async runNow(taskId: string): Promise<SchedulerCommandResult> {
		const task = await this.requireTask(taskId);
		if (isTaskRunning(taskId)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "定时任务已在运行。", { taskId });
		}
		await executeTask(task, this.dependencies.getRuntime(), {
			onOneTimeCompleted: async () => {
				this.dependencies.unscheduleTask(task.id);
				await updateTaskEnabled(task.id, false);
			},
		});
		return { status: "accepted", taskId };
	}

	async abort(taskId: string): Promise<SchedulerCommandResult> {
		await this.requireTask(taskId);
		const aborted = await abortTask(taskId);
		if (!aborted) return { status: "noop", taskId };
		return { status: "accepted", taskId };
	}

	private async requireTask(taskId: string): Promise<ScheduledTask> {
		const task = (await loadTasks()).find((candidate) => candidate.id === taskId);
		if (!task) {
			throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
		}
		return task;
	}

	private async assertDirectory(path: string): Promise<void> {
		const info = await stat(path).catch(() => undefined);
		if (!info?.isDirectory()) {
			throw new SchedulerServiceError("SCHEDULER_CWD_INVALID", "任务工作目录不存在或不是目录。", {
				path,
			});
		}
	}

	private assertCron(cron: string): void {
		if (!isValidCronExpression(cron)) {
			throw new SchedulerServiceError("SCHEDULER_CRON_INVALID", "Cron 表达式无效。", { cron });
		}
	}

	private syncScheduledJob(task: ScheduledTask): void {
		if (task.enabled) {
			this.dependencies.scheduleTask(task);
		} else {
			this.dependencies.unscheduleTask(task.id);
		}
	}

	private emitTasksChanged(): void {
		for (const handler of this.changeHandlers) handler();
	}
}

let desktopSchedulerService: SchedulerService | undefined;

export function initializeDesktopSchedulerService(dependencies: SchedulerServiceDependencies): SchedulerService {
	if (desktopSchedulerService) throw new Error("Desktop scheduler service is already initialized");
	desktopSchedulerService = new SchedulerService(dependencies);
	return desktopSchedulerService;
}

export function getDesktopSchedulerService(): SchedulerService {
	if (!desktopSchedulerService) throw new Error("Desktop scheduler service is not initialized");
	return desktopSchedulerService;
}

/** 调度服务未初始化（测试/轻量进程）时返回 undefined，供「能装就装」的宿主装配路径使用。 */
export function tryGetDesktopSchedulerService(): SchedulerService | undefined {
	return desktopSchedulerService;
}
