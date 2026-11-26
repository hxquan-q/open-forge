// Modified by The Open Forge contributors.
/**
 * 自动化任务的服务层（ADR-0155）：v2 数据模型的输入校验、补丁语义、
 * 目标失效暂停（绝不顶替）与任务包导入（v1 封套转 v2，TASK-0522 前的兼容桥）。
 * 结构参照上游重写，保留本地权限分层字段（permissionTiers / trigger / executionMode / skill）。
 */
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import {
	isCronTriggered,
	normalizeAutomationTaskTrigger,
	normalizeUnattendedPermissionTiers,
} from "@vetta/coding-agent/runtime";
import type { RuntimeHost } from "@vetta/runtime-core";
import {
	type AutomationPermissionTiers,
	type AutomationSkillRef,
	type AutomationTaskCreateRequest,
	type AutomationTaskInput,
	type AutomationTaskPatch,
	type AutomationTaskUpdateRequest,
	isAutomationModel,
	isAutomationRunTarget,
	isAutomationSchedule,
	type ScheduledTask,
	type TaskExecutionRecord,
} from "../../shared/automation.js";
import { legacyCronToSchedule } from "../../shared/automation-timing.js";
import { recordAutomationTaskCreated } from "../app-monitor/app-monitor-service.js";
import { isValidSchedule } from "./cron.js";
import { abortTask, executeTask, isTaskRunning } from "./task-executor.js";
import {
	deleteRecordsBySessionPaths,
	deleteTaskRecords,
	generateId,
	loadRecords,
	loadTasks,
	mutateTasks,
} from "./task-storage.js";

export type CreateScheduledTaskInput = AutomationTaskCreateRequest;
export type UpdateScheduledTaskInput = AutomationTaskPatch;

/** 任务包导入（v1 封套形状）：保留包 id，强制停用。 */
export type ImportScheduledTaskInput = {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce: boolean;
	readonly cwd: string;
	readonly modelKey?: string;
	readonly executionMode?: "inherit" | "sandbox" | "full-access";
	readonly skill?: AutomationSkillRef;
	readonly permissionTiers?: AutomationPermissionTiers;
};

export interface SchedulerCommandResult {
	status: "accepted" | "noop";
	taskId: string;
}

export interface SchedulerServiceDependencies {
	getRuntime: () => RuntimeHost;
	/** 按任务当前配置同步调度作业（启用则排程，停用则撤下）。 */
	syncTask: (task: ScheduledTask) => void;
	unscheduleTask: (taskId: string) => void;
	/** 判断项目是否仍在侧边栏（含归档）；「对话」恒为 true。 */
	isKnownProject: (cwd: string) => Promise<boolean>;
	sameProjectPath: (first: string, second: string) => boolean;
	/** 默认「对话」的 cwd：外部输入省略项目时落在这里。 */
	conversationCwd: string;
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

const INPUT_KEYS = new Set([
	"name",
	"prompt",
	"schedule",
	"runTarget",
	"model",
	"executionMode",
	"skill",
	"permissionTiers",
	"trigger",
	"enabled",
]);

function isNonBlankString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isExecutionMode(value: unknown): boolean {
	return value === "inherit" || value === "sandbox" || value === "full-access";
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

/** 空对象表示清除全部无人值守授权（v1 语义保留），与 null 等价。 */
function isPermissionTiers(value: unknown): boolean {
	if (value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
		return true;
	}
	return normalizeUnattendedPermissionTiers(value) !== undefined;
}

function isTrigger(value: unknown): boolean {
	return normalizeAutomationTaskTrigger(value) !== undefined;
}

function invalid(message: string): SchedulerServiceError {
	return new SchedulerServiceError("SCHEDULER_TASK_INVALID_INPUT", message);
}

function assertFieldShapes(input: Record<string, unknown>): void {
	if (!Object.keys(input).every((key) => INPUT_KEYS.has(key))) throw invalid("Unknown scheduled task field.");
	if (input.name !== undefined && !isNonBlankString(input.name)) throw invalid("Task name must not be blank.");
	if (input.prompt !== undefined && !isNonBlankString(input.prompt)) throw invalid("Task prompt must not be blank.");
	if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw invalid("enabled must be a boolean.");
	if (input.schedule !== undefined && input.schedule !== null) {
		if (!isAutomationSchedule(input.schedule) || !isValidSchedule(input.schedule)) {
			throw new SchedulerServiceError("SCHEDULER_SCHEDULE_INVALID", "Invalid automation schedule.");
		}
	}
	if (input.runTarget !== undefined && !isAutomationRunTarget(input.runTarget)) throw invalid("Invalid run target.");
	if (input.model !== undefined && input.model !== null && !isAutomationModel(input.model)) {
		throw invalid("Invalid model selection.");
	}
	if (input.executionMode !== undefined && input.executionMode !== null && !isExecutionMode(input.executionMode)) {
		throw invalid("Invalid execution mode.");
	}
	if (input.skill !== undefined && input.skill !== null && !isSelectedSkill(input.skill)) {
		throw invalid("Invalid skill selection.");
	}
	if (
		input.permissionTiers !== undefined &&
		input.permissionTiers !== null &&
		!isPermissionTiers(input.permissionTiers)
	) {
		throw invalid("Invalid unattended permission tiers.");
	}
	if (input.trigger !== undefined && !isTrigger(input.trigger)) {
		throw invalid("Invalid task trigger.");
	}
	if (input.trigger != null) {
		const trigger = normalizeAutomationTaskTrigger(input.trigger);
		if (trigger?.type === "event" && trigger.event === undefined) {
			throw invalid("Event trigger requires an event name.");
		}
	}
}

function assertCreateInput(value: unknown): asserts value is AutomationTaskInput {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		throw invalid("Scheduled task input must be an object.");
	}
	const input = value as Record<string, unknown>;
	assertFieldShapes(input);
	if (
		input.name === undefined ||
		input.prompt === undefined ||
		input.runTarget === undefined ||
		input.enabled === undefined
	) {
		throw invalid("Missing required scheduled task fields.");
	}
}

function assertPatchInput(value: unknown): asserts value is AutomationTaskPatch {
	if (value == null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
		throw invalid("Scheduled task update must be a non-empty object.");
	}
	assertFieldShapes(value as Record<string, unknown>);
}

/** cron 触发（含缺省）必须有计划；event / manual 不要求。 */
function assertTriggerScheduleConsistency(task: Pick<ScheduledTask, "trigger" | "schedule">): void {
	if (!isCronTriggered(task.trigger)) return;
	if (!task.schedule) {
		throw new SchedulerServiceError("SCHEDULER_SCHEDULE_REQUIRED", "Cron-triggered tasks require a schedule.");
	}
}

/**
 * 应用补丁：null（或归一化后为空的 permissionTiers）清除可选字段；
 * trigger 清除/落回 cron 缺省则不持久化该键；
 * 目标（运行会话 / 项目）变化或重新启用后清掉因目标失效产生的暂停原因。
 */
function applyPatch(task: ScheduledTask, patch: AutomationTaskPatch, now: number): ScheduledTask {
	const { model, executionMode, skill, permissionTiers, trigger, schedule, ...rest } = patch;
	let next: ScheduledTask = { ...task, ...rest, updatedAt: now };
	if (model === null) {
		const { model: _cleared, ...without } = next;
		next = without as ScheduledTask;
	} else if (model !== undefined) {
		next = { ...next, model };
	}
	if (executionMode === null) {
		const { executionMode: _cleared, ...without } = next;
		next = without as ScheduledTask;
	} else if (executionMode !== undefined) {
		next = { ...next, executionMode };
	}
	if (skill === null) {
		const { skill: _cleared, ...without } = next;
		next = without as ScheduledTask;
	} else if (skill !== undefined) {
		next = { ...next, skill };
	}
	if (schedule === null) {
		const { schedule: _cleared, ...without } = next;
		next = without as ScheduledTask;
	} else if (schedule !== undefined) {
		next = { ...next, schedule };
	}
	if (permissionTiers !== undefined) {
		const normalized = normalizeUnattendedPermissionTiers(permissionTiers);
		if (permissionTiers === null || normalized === undefined) {
			const { permissionTiers: _cleared, ...without } = next;
			next = without as ScheduledTask;
		} else {
			next = { ...next, permissionTiers: normalized };
		}
	}
	if (trigger !== undefined) {
		const normalized = trigger === null ? { type: "cron" as const } : normalizeAutomationTaskTrigger(trigger);
		if (normalized === undefined || normalized.type === "cron") {
			const { trigger: _cleared, ...without } = next;
			next = without as ScheduledTask;
		} else {
			next = { ...next, trigger: normalized };
		}
	}
	const cleaned = JSON.parse(JSON.stringify(next)) as ScheduledTask;
	if (patch.runTarget !== undefined || (patch.enabled === true && cleaned.suspendedReason)) {
		const { suspendedReason: _cleared, ...unsuspended } = cleaned;
		return unsuspended;
	}
	return cleaned;
}

/** 省略或留空的 projectCwd 补成默认「对话」，其余字段原样交给结构校验。 */
function withDefaultProject<T extends { runTarget?: unknown }>(input: T, conversationCwd: string): T {
	if (!input || typeof input !== "object" || !input.runTarget || typeof input.runTarget !== "object") return input;
	const target = input.runTarget as Record<string, unknown>;
	if (typeof target.projectCwd === "string" && target.projectCwd.trim().length > 0) return input;
	return { ...input, runTarget: { ...target, projectCwd: conversationCwd } };
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

	async createTask(request: AutomationTaskCreateRequest): Promise<ScheduledTask> {
		const data = withDefaultProject(request as { runTarget?: unknown }, this.dependencies.conversationCwd) as unknown;
		assertCreateInput(data);
		const now = Date.now();
		const task = applyPatch(
			{
				...data,
				id: generateId(),
				createdAt: now,
				updatedAt: now,
				lastRunAt: null,
				lastRunStatus: null,
			},
			{},
			now,
		);
		assertTriggerScheduleConsistency(task);
		await this.assertTargetUsable(task);
		await mutateTasks((tasks) => {
			tasks.push(task);
		});
		this.dependencies.syncTask(task);
		this.emitTasksChanged();
		recordAutomationTaskCreated();
		return task;
	}

	/**
	 * 从自动化任务包导入（v1 封套桥，TASK-0522 前）：v1 cron/isOnce 经迁移同款转换
	 * 进入 v2 schedule 联合，运行策略固定「每次新建会话」；使用包 id 作为任务 id，
	 * 强制 enabled=false，同 id 不覆盖。
	 */
	async importTask(data: ImportScheduledTaskInput): Promise<ScheduledTask> {
		if (!isNonBlankString(data.id)) {
			throw invalid("Imported task id is required.");
		}
		if (!isNonBlankString(data.name) || !isNonBlankString(data.prompt) || !isNonBlankString(data.cron)) {
			throw invalid("Invalid automation package task fields.");
		}
		if (data.skill !== undefined && !isSelectedSkill(data.skill)) throw invalid("Invalid skill selection.");
		if (data.executionMode !== undefined && !isExecutionMode(data.executionMode)) {
			throw invalid("Invalid execution mode.");
		}
		if (data.permissionTiers !== undefined && !isPermissionTiers(data.permissionTiers)) {
			throw invalid("Invalid unattended permission tiers.");
		}
		const schedule = legacyCronToSchedule(data.cron, data.isOnce, Date.now());
		if (!isValidSchedule(schedule)) {
			throw new SchedulerServiceError("SCHEDULER_SCHEDULE_INVALID", "Invalid automation schedule.", {
				cron: data.cron,
			});
		}
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
			id: data.id,
			name: data.name,
			prompt: data.prompt,
			schedule,
			runTarget: { mode: "new-session", projectCwd: data.cwd },
			...(isNonBlankString(data.modelKey) ? { model: { key: data.modelKey } } : {}),
			...(data.executionMode !== undefined ? { executionMode: data.executionMode } : {}),
			...(data.skill !== undefined ? { skill: data.skill } : {}),
			...(permissionTiers !== undefined ? { permissionTiers } : {}),
			enabled: false,
			createdAt: now,
			updatedAt: now,
			lastRunAt: null,
			lastRunStatus: null,
		};
		await mutateTasks((tasks) => {
			tasks.push(task);
		});
		// 导入强制停用：不排程。
		this.emitTasksChanged();
		recordAutomationTaskCreated();
		return task;
	}

	async updateTask(taskId: string, request: AutomationTaskUpdateRequest): Promise<ScheduledTask> {
		const patch = withDefaultProject(
			request as { runTarget?: unknown },
			this.dependencies.conversationCwd,
		) as unknown;
		assertPatchInput(patch);
		const current = await this.requireTask(taskId);
		const now = Date.now();
		const preview = applyPatch(current, patch, now);
		assertTriggerScheduleConsistency(preview);
		await this.assertTargetUsable(preview);
		const task = await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			tasks[index] = applyPatch(tasks[index], patch, now);
			return tasks[index];
		});
		this.dependencies.syncTask(task);
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
		const task = await this.requireTask(taskId);
		return await this.updateTask(taskId, { enabled: !task.enabled });
	}

	/** 「立即运行」：遵守同一时刻只跑一次；运行失败记在执行记录里，不向调用方抛异步异常。 */
	async runNow(taskId: string): Promise<SchedulerCommandResult> {
		const task = await this.requireTask(taskId);
		if (isTaskRunning(taskId)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "定时任务已在运行。", { taskId });
		}
		void executeTask(task, this.dependencies.getRuntime(), {
			trigger: "manual",
			onTaskChanged: (changed) => this.dependencies.syncTask(changed),
		}).catch(() => {
			// 只剩「已在运行」的竞态与关停路径的拒绝：两者已可感知（record / 进程退出），无需传播。
		});
		return { status: "accepted", taskId };
	}

	async abort(taskId: string): Promise<SchedulerCommandResult> {
		await this.requireTask(taskId);
		const aborted = await abortTask(taskId);
		return { status: aborted ? "accepted" : "noop", taskId };
	}

	/**
	 * 会话被删除：清掉指向它们的执行记录；绑定到它们的自动化暂停并标明原因，
	 * 绝不悄悄换一个新会话顶上（ADR-0155 §2 / ADR-0127 决策）。
	 */
	async handleSessionsDeleted(isDeleted: (sessionPath: string) => boolean): Promise<void> {
		const suspended = await mutateTasks((tasks) => {
			const changed: ScheduledTask[] = [];
			tasks.forEach((task, index) => {
				if (task.runTarget.mode !== "same-session" || !task.runTarget.sessionPath) return;
				if (!isDeleted(task.runTarget.sessionPath)) return;
				tasks[index] = { ...task, enabled: false, suspendedReason: "session-deleted", updatedAt: Date.now() };
				changed.push(tasks[index]);
			});
			return changed;
		});
		for (const task of suspended) this.dependencies.syncTask(task);
		const affected = await deleteRecordsBySessionPaths(isDeleted);
		if (suspended.length > 0 || affected.length > 0) this.emitTasksChanged();
	}

	/** 项目从侧边栏移除：以它为目标的自动化暂停并标明原因。 */
	async handleProjectRemoved(projectCwd: string): Promise<void> {
		const suspended = await mutateTasks((tasks) => {
			const changed: ScheduledTask[] = [];
			tasks.forEach((task, index) => {
				if (!this.dependencies.sameProjectPath(task.runTarget.projectCwd, projectCwd)) return;
				tasks[index] = { ...task, enabled: false, suspendedReason: "project-removed", updatedAt: Date.now() };
				changed.push(tasks[index]);
			});
			return changed;
		});
		for (const task of suspended) this.dependencies.syncTask(task);
		if (suspended.length > 0) this.emitTasksChanged();
	}

	private async requireTask(taskId: string): Promise<ScheduledTask> {
		const task = (await loadTasks()).find((candidate) => candidate.id === taskId);
		if (!task) {
			throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
		}
		return task;
	}

	/** 任务必须有可用的目标；启用的一次性任务的时刻必须仍在未来。 */
	private async assertTargetUsable(task: Pick<ScheduledTask, "runTarget" | "schedule" | "enabled">): Promise<void> {
		if (!(await this.dependencies.isKnownProject(task.runTarget.projectCwd))) {
			throw new SchedulerServiceError("SCHEDULER_PROJECT_INVALID", "目标项目不存在。", {
				projectCwd: task.runTarget.projectCwd,
			});
		}
		if (task.enabled && task.runTarget.mode === "same-session" && task.runTarget.sessionPath) {
			if (!existsSync(task.runTarget.sessionPath)) {
				throw new SchedulerServiceError("SCHEDULER_SESSION_INVALID", "绑定的会话不存在。", {
					sessionPath: task.runTarget.sessionPath,
				});
			}
		}
		if (task.enabled && task.schedule?.kind === "once" && task.schedule.at <= Date.now()) {
			throw new SchedulerServiceError("SCHEDULER_SCHEDULE_PAST", "一次性任务的执行时间已过去。");
		}
	}

	/** 包导入的落点目录检查：不必须是侧边栏项目（用户导入时另选目录），但必须存在。 */
	private async assertDirectory(path: string): Promise<void> {
		const info = await stat(path).catch(() => undefined);
		if (!info?.isDirectory()) {
			throw new SchedulerServiceError("SCHEDULER_CWD_INVALID", "任务工作目录不存在或不是目录。", {
				path,
			});
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
