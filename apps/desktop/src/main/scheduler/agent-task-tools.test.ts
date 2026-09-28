// Copyright The Open Forge contributors.
import type { RuntimeToolDefinition, RuntimeToolExecutionRequest } from "@vetta/runtime-core/kernel";
import { describe, expect, it, vi } from "vitest";

// 真模块会顺着 task-executor 拖进 electron/ipc；桥接测试只需要它的错误类型与单例访问口。
vi.mock("./scheduler-service.js", () => ({
	SchedulerServiceError: class SchedulerServiceError extends Error {
		constructor(
			readonly code: string,
			message: string,
			readonly details?: Record<string, string | string[]>,
		) {
			super(message);
			this.name = "SchedulerServiceError";
		}
	},
	tryGetDesktopSchedulerService: () => undefined,
}));

import {
	createDesktopScheduledTaskSessionTools,
	createSchedulerServiceTaskStore,
	type DesktopSchedulerTaskPort,
} from "./agent-task-tools.js";
import { SchedulerServiceError } from "./scheduler-service.js";
import type { ScheduledTask } from "./task-storage.js";

const PROJECT = "C:/repo/alpha";

function scheduledTask(overrides: Partial<ScheduledTask>): ScheduledTask {
	return {
		id: "task-1",
		name: "daily checks",
		prompt: "run static checks",
		cron: "0 14 * * *",
		isOnce: false,
		enabled: true,
		cwd: PROJECT,
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
		...overrides,
	};
}

/** 假 SchedulerService：以内存数组模拟持久化，不碰真实文件与定时器。 */
function createFakeScheduler(initial: readonly ScheduledTask[]): {
	readonly service: DesktopSchedulerTaskPort;
	readonly tasks: ScheduledTask[];
} {
	const tasks = [...initial];
	return {
		tasks,
		service: {
			listTasks: async () => tasks.map((task) => ({ ...task })),
			createTask: async (data) => {
				const created: ScheduledTask = {
					...data,
					id: `task-${tasks.length + 1}`,
					createdAt: 2,
					updatedAt: 2,
					lastRunAt: null,
					lastRunStatus: null,
				};
				tasks.push(created);
				return created;
			},
			updateTask: async (taskId, patch) => {
				const index = tasks.findIndex((candidate) => candidate.id === taskId);
				if (index < 0) {
					throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
				}
				tasks[index] = { ...tasks[index], ...patch, id: tasks[index].id, updatedAt: tasks[index].updatedAt + 1 };
				return tasks[index];
			},
			deleteTask: async (taskId) => {
				const index = tasks.findIndex((candidate) => candidate.id === taskId);
				if (index < 0) {
					throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
				}
				tasks.splice(index, 1);
				return { status: "accepted", taskId };
			},
		},
	};
}

function request(input: Readonly<Record<string, unknown>>): RuntimeToolExecutionRequest {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "call-1",
		input,
		signal: new AbortController().signal,
	};
}

function toolNamed(registrations: readonly { tool: RuntimeToolDefinition }[], name: string): RuntimeToolDefinition {
	const registration = registrations.find((candidate) => candidate.tool.name === name);
	if (!registration) throw new Error(`missing tool ${name}`);
	return registration.tool;
}

describe("createSchedulerServiceTaskStore", () => {
	it("delegates list/create to the scheduler service with store defaults", async () => {
		const { service, tasks } = createFakeScheduler([scheduledTask({ id: "a1" })]);
		const store = createSchedulerServiceTaskStore(service);

		expect(await store.listTasks()).toHaveLength(1);
		const created = await store.createTask({
			name: "nightly",
			prompt: "run",
			cron: "0 2 * * *",
			cwd: PROJECT,
		});
		expect(created.isOnce).toBe(false);
		expect(created.enabled).toBe(true);
		expect(tasks).toHaveLength(2);
	});

	it("maps NOT_FOUND errors to the store contract and propagates the rest", async () => {
		const { service } = createFakeScheduler([]);
		const store = createSchedulerServiceTaskStore(service);

		expect(await store.updateTask("ghost", { name: "x" })).toBeUndefined();
		expect(await store.deleteTask("ghost")).toBe(false);

		const failing: DesktopSchedulerTaskPort = {
			...service,
			deleteTask: async () => {
				throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "运行中的定时任务不能删除，请先中止。", {
					taskId: "a1",
				});
			},
		};
		await expect(createSchedulerServiceTaskStore(failing).deleteTask("a1")).rejects.toMatchObject({
			code: "SCHEDULER_TASK_RUNNING",
		});
	});
});

describe("createDesktopScheduledTaskSessionTools", () => {
	it("injects the four tools bound to the session project", () => {
		const { service } = createFakeScheduler([]);
		const registrations = createDesktopScheduledTaskSessionTools(PROJECT, service);

		expect(registrations.map(({ tool }) => tool.name)).toEqual([
			"scheduled_task_list",
			"scheduled_task_create",
			"scheduled_task_update",
			"scheduled_task_delete",
		]);
	});

	it("returns no tools when the scheduler service is not initialized", () => {
		expect(createDesktopScheduledTaskSessionTools(PROJECT)).toEqual([]);
	});

	it("carries a create→list→update→delete flow through the real service port", async () => {
		const { service, tasks } = createFakeScheduler([
			scheduledTask({ id: "other-1", name: "other project task", cwd: "C:/repo/beta" }),
		]);
		const registrations = createDesktopScheduledTaskSessionTools(PROJECT, service);
		const list = toolNamed(registrations, "scheduled_task_list");
		const create = toolNamed(registrations, "scheduled_task_create");
		const update = toolNamed(registrations, "scheduled_task_update");
		const del = toolNamed(registrations, "scheduled_task_delete");

		// 用户的「把这个项目的静态检查改成每天下午 2 点自动跑一次」落到 create。
		const created = await create.execute(
			request({ name: "静态检查", prompt: "run static checks", cron: "0 14 * * *" }),
		);
		expect(created.isError).toBeUndefined();
		const createdId = tasks.find((task) => task.name === "静态检查")?.id;
		expect(createdId).toBeTruthy();
		expect(tasks.find((task) => task.id === createdId)?.cwd).toBe(PROJECT);

		const listed = await list.execute(request({}));
		const listText = listed.content[0].type === "text" ? listed.content[0].text : "";
		expect(listText).toContain("静态检查");
		expect(listText).not.toContain("other project task");

		const rescheduled = await update.execute(request({ task_id: createdId ?? "", cron: "0 15 * * *" }));
		expect(rescheduled.isError).toBeUndefined();
		expect(tasks.find((task) => task.id === createdId)?.cron).toBe("0 15 * * *");

		// 别的项目的任务在更新/删除时同样 NOT_FOUND。
		const foreign = await update.execute(request({ task_id: "other-1", cron: "0 1 * * *" }));
		expect(foreign.isError).toBe(true);
		expect(tasks.find((task) => task.id === "other-1")?.cron).toBe("0 14 * * *");

		const deleted = await del.execute(request({ task_id: createdId ?? "" }));
		expect(deleted.isError).toBeUndefined();
		expect(tasks.find((task) => task.id === createdId)).toBeUndefined();
	});
});
