// Copyright The Open Forge contributors.
import type { ConversationScenario } from "../../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../../runtime-contracts/index.js";
import type {
	ScheduledTaskCreateInput,
	ScheduledTaskDeleteInput,
	ScheduledTaskListInput,
	ScheduledTaskToolContext,
	ScheduledTaskUpdateInput,
} from "./scheduled-task-tools.js";
import {
	createScheduledTaskCreateTool,
	createScheduledTaskDeleteTool,
	createScheduledTaskListTool,
	createScheduledTaskUpdateTool,
} from "./scheduled-task-tools.js";

export const SCHEDULED_TASK_TOOL_SCOPES = [
	"im-claw",
	"conversation",
	"project",
	"batch",
	"automation",
	"kb-processing",
	"cli",
] as const satisfies readonly ConversationScenario[];

export const SCHEDULED_TASK_TOOL_CATEGORY = "agent-control" as const;

export type ScheduledTaskToolRegistration =
	| CodingAgentRuntimeToolRegistration<ScheduledTaskListInput>
	| CodingAgentRuntimeToolRegistration<ScheduledTaskCreateInput>
	| CodingAgentRuntimeToolRegistration<ScheduledTaskUpdateInput>
	| CodingAgentRuntimeToolRegistration<ScheduledTaskDeleteInput>;

/**
 * 定时任务工具由宿主按会话注入（sessionRuntimeTools），项目作用域随会话绑定根
 * 固化；宿主不提供调度端口时不注册，不可用能力不留在模型视野里。
 */
export function createScheduledTaskToolRegistrations(
	context: ScheduledTaskToolContext,
): readonly ScheduledTaskToolRegistration[] {
	return [
		{
			tool: createScheduledTaskListTool(context),
			scopeUse: SCHEDULED_TASK_TOOL_SCOPES,
			category: SCHEDULED_TASK_TOOL_CATEGORY,
		},
		{
			tool: createScheduledTaskCreateTool(context),
			scopeUse: SCHEDULED_TASK_TOOL_SCOPES,
			category: SCHEDULED_TASK_TOOL_CATEGORY,
		},
		{
			tool: createScheduledTaskUpdateTool(context),
			scopeUse: SCHEDULED_TASK_TOOL_SCOPES,
			category: SCHEDULED_TASK_TOOL_CATEGORY,
		},
		{
			tool: createScheduledTaskDeleteTool(context),
			scopeUse: SCHEDULED_TASK_TOOL_SCOPES,
			category: SCHEDULED_TASK_TOOL_CATEGORY,
		},
	];
}
