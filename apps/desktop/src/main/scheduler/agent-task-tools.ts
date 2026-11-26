// Copyright The Open Forge contributors.
import {
	type AgentScheduledTaskCreate,
	type AgentScheduledTaskPatch,
	type CodingAgentRuntimeToolRegistration,
	createScheduledTaskToolRegistrations,
	type ScheduledTaskStore,
} from "@vetta/coding-agent/runtime";
import { type SchedulerService, SchedulerServiceError, tryGetDesktopSchedulerService } from "./scheduler-service.js";
import { taskToV1Shape, v1CreateToV2, v1PatchToV2 } from "./v1-shape-adapter.js";

/** 定时任务 Agent 工具需要的 SchedulerService 窄端口；便于测试注入假实现。 */
export type DesktopSchedulerTaskPort = Pick<
	SchedulerService,
	"listTasks" | "getTask" | "createTask" | "updateTask" | "deleteTask"
>;

/**
 * 把现有 SchedulerService 适配成 Coding Agent 的 ScheduledTaskStore。
 * 只做端口翻译与 NOT_FOUND 收敛（v1↔v2 形状见 v1-shape-adapter，ADR-0155 §7）——
 * 调度、校验、执行都仍归 service 所有，不产生第二条存储或调度路径。
 */
export function createSchedulerServiceTaskStore(service: DesktopSchedulerTaskPort): ScheduledTaskStore {
	return {
		listTasks: async () => (await service.listTasks()).map(taskToV1Shape),
		createTask: async (input: AgentScheduledTaskCreate) =>
			taskToV1Shape(await service.createTask(v1CreateToV2(input))),
		updateTask: async (taskId: string, patch: AgentScheduledTaskPatch) => {
			try {
				const current = await service.getTask(taskId);
				const updated = await service.updateTask(taskId, v1PatchToV2(patch, current));
				return taskToV1Shape(updated);
			} catch (error) {
				if (isSchedulerTaskNotFound(error)) return undefined;
				throw error;
			}
		},
		deleteTask: async (taskId: string) => {
			try {
				await service.deleteTask(taskId);
				return true;
			} catch (error) {
				if (isSchedulerTaskNotFound(error)) return false;
				throw error;
			}
		},
	};
}

/**
 * 为一个会话构造定时任务工具注册。`projectCwd` 是调用方按会话绑定根折算出的
 * 项目作用域；调度服务未初始化（如纯测试进程）时不注入工具，不可用能力不留在
 * 模型视野里。
 */
export function createDesktopScheduledTaskSessionTools(
	projectCwd: string,
	service?: DesktopSchedulerTaskPort,
): readonly CodingAgentRuntimeToolRegistration[] {
	const scheduler = service ?? tryGetDesktopSchedulerService();
	if (!scheduler) return [];
	return createScheduledTaskToolRegistrations({
		store: createSchedulerServiceTaskStore(scheduler),
		projectCwd,
	});
}

function isSchedulerTaskNotFound(error: unknown): boolean {
	return error instanceof SchedulerServiceError && error.code === "SCHEDULER_TASK_NOT_FOUND";
}
