// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition, RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import type { AgentScheduledTask, ScheduledTaskStore } from "../contracts.js";
import { isScheduledTaskInScope, scheduledTaskScopeKey } from "../scope.js";
import {
	SCHEDULED_TASK_CREATE_TOOL_DESCRIPTION,
	SCHEDULED_TASK_DELETE_TOOL_DESCRIPTION,
	SCHEDULED_TASK_LIST_TOOL_DESCRIPTION,
	SCHEDULED_TASK_UPDATE_TOOL_DESCRIPTION,
} from "./description.js";

export const SCHEDULED_TASK_LIST_TOOL_NAME = "scheduled_task_list";
export const SCHEDULED_TASK_CREATE_TOOL_NAME = "scheduled_task_create";
export const SCHEDULED_TASK_UPDATE_TOOL_NAME = "scheduled_task_update";
export const SCHEDULED_TASK_DELETE_TOOL_NAME = "scheduled_task_delete";

export const SCHEDULED_TASK_TOOL_NAMES = [
	SCHEDULED_TASK_LIST_TOOL_NAME,
	SCHEDULED_TASK_CREATE_TOOL_NAME,
	SCHEDULED_TASK_UPDATE_TOOL_NAME,
	SCHEDULED_TASK_DELETE_TOOL_NAME,
] as const;

export interface ScheduledTaskToolContext {
	readonly store: ScheduledTaskStore;
	/** 调用会话绑定的项目根：既是新建任务的执行目录，也是作用域判定基准。 */
	readonly projectCwd: string;
}

export const ScheduledTaskListInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
});

export const ScheduledTaskCreateInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	name: Type.String({ minLength: 1, maxLength: 80, description: "Short task name (max 80 chars)." }),
	prompt: Type.String({
		minLength: 1,
		maxLength: 64000,
		description: "The instruction the scheduled agent session executes on each run.",
	}),
	cron: Type.String({
		minLength: 1,
		description: 'Cron expression in the host local time, e.g. "0 14 * * *" for every day at 14:00.',
	}),
	isOnce: Type.Optional(
		Type.Boolean({ description: "Run once then auto-disable after the first successful run (default false)." }),
	),
	enabled: Type.Optional(Type.Boolean({ description: "Start enabled right away (default true)." })),
});

export const ScheduledTaskUpdateInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	task_id: Type.String({ minLength: 1, description: "Task id returned by scheduled_task_list." }),
	name: Type.Optional(Type.String({ minLength: 1, maxLength: 80, description: "New task name." })),
	prompt: Type.Optional(Type.String({ minLength: 1, maxLength: 64000, description: "New run instruction." })),
	cron: Type.Optional(Type.String({ minLength: 1, description: "New cron expression in host local time." })),
	enabled: Type.Optional(Type.Boolean({ description: "Enable or pause the task." })),
	isOnce: Type.Optional(Type.Boolean({ description: "Whether the task auto-disables after one successful run." })),
});

export const ScheduledTaskDeleteInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	task_id: Type.String({ minLength: 1, description: "Task id returned by scheduled_task_list." }),
});

export type ScheduledTaskListInput = Static<typeof ScheduledTaskListInputSchema>;
export type ScheduledTaskCreateInput = Static<typeof ScheduledTaskCreateInputSchema>;
export type ScheduledTaskUpdateInput = Static<typeof ScheduledTaskUpdateInputSchema>;
export type ScheduledTaskDeleteInput = Static<typeof ScheduledTaskDeleteInputSchema>;

export function createScheduledTaskListTool(
	context: ScheduledTaskToolContext,
): RuntimeToolDefinition<ScheduledTaskListInput> {
	return {
		name: SCHEDULED_TASK_LIST_TOOL_NAME,
		label: "scheduled_task_list",
		description: SCHEDULED_TASK_LIST_TOOL_DESCRIPTION,
		inputSchema: ScheduledTaskListInputSchema,
		async execute() {
			return await run(context, async () => {
				const scopeKey = scheduledTaskScopeKey(context.projectCwd);
				const tasks = (await context.store.listTasks()).filter((task) =>
					isScheduledTaskInScope(task.cwd, scopeKey),
				);
				return result(formatTaskList(tasks, context.projectCwd), { operation: "list", taskCount: tasks.length });
			});
		},
	};
}

export function createScheduledTaskCreateTool(
	context: ScheduledTaskToolContext,
): RuntimeToolDefinition<ScheduledTaskCreateInput> {
	return {
		name: SCHEDULED_TASK_CREATE_TOOL_NAME,
		label: "scheduled_task_create",
		description: SCHEDULED_TASK_CREATE_TOOL_DESCRIPTION,
		inputSchema: ScheduledTaskCreateInputSchema,
		async execute({ input }) {
			return await run(context, async () => {
				const task = await context.store.createTask({
					name: input.name,
					prompt: input.prompt,
					cron: input.cron,
					isOnce: input.isOnce ?? false,
					enabled: input.enabled ?? true,
					cwd: context.projectCwd,
				});
				return result(
					`Created scheduled task "${task.name}" (id: ${task.id}) — cron "${task.cron}", ` +
						`${task.isOnce ? "runs once" : "recurring"}, ${task.enabled ? "enabled" : "disabled"}, ` +
						`working directory ${task.cwd}.\n` +
						"It will run as a background session on schedule and is visible in the Automation page.",
					{ operation: "create", taskId: task.id },
				);
			});
		},
	};
}

export function createScheduledTaskUpdateTool(
	context: ScheduledTaskToolContext,
): RuntimeToolDefinition<ScheduledTaskUpdateInput> {
	return {
		name: SCHEDULED_TASK_UPDATE_TOOL_NAME,
		label: "scheduled_task_update",
		description: SCHEDULED_TASK_UPDATE_TOOL_DESCRIPTION,
		inputSchema: ScheduledTaskUpdateInputSchema,
		async execute({ input }) {
			return await run(context, async () => {
				const existing = await findScopedTask(context, input.task_id);
				if (!existing) return notFound(input.task_id, "update");
				const patch = {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
					...(input.cron !== undefined ? { cron: input.cron } : {}),
					...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
					...(input.isOnce !== undefined ? { isOnce: input.isOnce } : {}),
				};
				if (Object.keys(patch).length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "Error: scheduled_task_update needs at least one field to change (name, prompt, cron, enabled, or isOnce).",
							},
						],
						details: { operation: "update", taskId: input.task_id },
						isError: true,
					};
				}
				const updated = await context.store.updateTask(input.task_id, patch);
				if (!updated) return notFound(input.task_id, "update");
				return result(`Updated scheduled task "${updated.name}" (id: ${updated.id}).\n${formatTask(updated)}`, {
					operation: "update",
					taskId: updated.id,
				});
			});
		},
	};
}

export function createScheduledTaskDeleteTool(
	context: ScheduledTaskToolContext,
): RuntimeToolDefinition<ScheduledTaskDeleteInput> {
	return {
		name: SCHEDULED_TASK_DELETE_TOOL_NAME,
		label: "scheduled_task_delete",
		description: SCHEDULED_TASK_DELETE_TOOL_DESCRIPTION,
		inputSchema: ScheduledTaskDeleteInputSchema,
		async execute({ input }) {
			return await run(context, async () => {
				const existing = await findScopedTask(context, input.task_id);
				if (!existing) return notFound(input.task_id, "delete");
				const deleted = await context.store.deleteTask(input.task_id);
				if (!deleted) return notFound(input.task_id, "delete");
				return result(`Deleted scheduled task "${existing.name}" (id: ${existing.id}) and its run history.`, {
					operation: "delete",
					taskId: existing.id,
				});
			});
		},
	};
}

async function findScopedTask(
	context: ScheduledTaskToolContext,
	taskId: string,
): Promise<AgentScheduledTask | undefined> {
	const scopeKey = scheduledTaskScopeKey(context.projectCwd);
	const tasks = await context.store.listTasks();
	return tasks.find((task) => task.id === taskId && isScheduledTaskInScope(task.cwd, scopeKey));
}

async function run(
	context: ScheduledTaskToolContext,
	action: () => Promise<RuntimeToolResult>,
): Promise<RuntimeToolResult> {
	try {
		return await action();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: "text", text: `Error: ${message}` }],
			details: { projectCwd: context.projectCwd },
			isError: true,
		};
	}
}

function notFound(taskId: string, operation: "update" | "delete"): RuntimeToolResult {
	return {
		content: [
			{
				type: "text",
				text:
					`NOT_FOUND: scheduled task "${taskId}" does not exist in this project. ` +
					`Call scheduled_task_list to see the task ids available here before retrying ${operation}.`,
			},
		],
		details: { operation, taskId },
		isError: true,
	};
}

function result(text: string, details: Record<string, unknown>): RuntimeToolResult {
	return { content: [{ type: "text", text }], details };
}

function formatTaskList(tasks: readonly AgentScheduledTask[], projectCwd: string): string {
	if (tasks.length === 0) {
		return `No scheduled tasks exist for this project (${projectCwd}).`;
	}
	const lines = tasks.map((task) => formatTask(task));
	return [`${tasks.length} scheduled task(s) for this project:`, ...lines].join("\n");
}

function formatTask(task: AgentScheduledTask): string {
	const state = task.enabled ? "enabled" : "disabled";
	const cadence = task.isOnce ? "once" : "recurring";
	const lastRun =
		task.lastRunAt === null
			? "never run"
			: `last run ${task.lastRunStatus ?? "unknown"} at ${new Date(task.lastRunAt).toLocaleString()}`;
	return `- "${task.name}" (id: ${task.id}) — cron "${task.cron}", ${cadence}, ${state}, ${lastRun}`;
}
