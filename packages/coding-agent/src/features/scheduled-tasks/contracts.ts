// Copyright The Open Forge contributors.
/**
 * Agent 侧定时任务能力的宿主端口与视图合同。
 *
 * `ScheduledTaskStore` 由宿主（Desktop scheduler-service 等）实现；它不持有
 * 会话项目作用域——作用域判定在工具层按任务 `cwd` 与本会话项目根的一致性完成。
 */
export type AgentScheduledTaskExecutionMode = "inherit" | "sandbox" | "full-access";

export interface AgentScheduledTaskSkillRef {
	readonly name: string;
	readonly alias?: string;
	readonly type: "skill" | "scene";
}

export interface AgentScheduledTask {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce: boolean;
	readonly enabled: boolean;
	/** 任务执行时的工作目录，同时是会话项目作用域的判定依据。 */
	readonly cwd: string;
	readonly modelKey?: string;
	readonly executionMode?: AgentScheduledTaskExecutionMode;
	readonly skill?: AgentScheduledTaskSkillRef;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly lastRunAt: number | null;
	readonly lastRunStatus: "success" | "failed" | null;
}

export interface AgentScheduledTaskCreate {
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly cwd: string;
	readonly isOnce?: boolean;
	readonly enabled?: boolean;
	readonly modelKey?: string;
	readonly executionMode?: AgentScheduledTaskExecutionMode;
	readonly skill?: AgentScheduledTaskSkillRef;
}

export type AgentScheduledTaskPatch = Partial<AgentScheduledTaskCreate>;

export interface ScheduledTaskStore {
	listTasks(): Promise<readonly AgentScheduledTask[]>;
	createTask(input: AgentScheduledTaskCreate): Promise<AgentScheduledTask>;
	/** 任务 id 不存在时返回 undefined；其它失败（如校验、运行中）以异常抛出。 */
	updateTask(taskId: string, patch: AgentScheduledTaskPatch): Promise<AgentScheduledTask | undefined>;
	/** 任务 id 不存在时返回 false；其它失败（如运行中）以异常抛出。 */
	deleteTask(taskId: string): Promise<boolean>;
}
