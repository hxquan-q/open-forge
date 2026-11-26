// Copyright The Open Forge contributors.
/**
 * v1（cron / isOnce / cwd / modelKey）外部契约 ↔ v2（schedule 联合 / runTarget / model）
 * 内部模型的边界翻译（ADR-0155 §7）。
 *
 * Agent 定时任务工具与 capability-sdk 插件域的输入契约保持 cron 形状；
 * v2 独有的 interval / 事件 / 手动形态在这些面上以空串 cron 标示，
 * 经 v1 面更新计划时按工具输入契约落为「自定义 cron」。
 */
import type {
	AgentScheduledTask,
	AgentScheduledTaskCreate,
	AgentScheduledTaskPatch,
} from "@vetta/coding-agent/runtime";
import {
	type AutomationSchedule,
	type AutomationTaskInput,
	type AutomationTaskPatch,
	automationScheduleToCron,
	type ScheduledTask,
} from "../../shared/automation.js";
import { legacyCronToSchedule } from "../../shared/automation-timing.js";

/** v2 任务 → v1 视图。 */
export function taskToV1Shape(task: ScheduledTask): AgentScheduledTask {
	const schedule = task.schedule;
	return {
		id: task.id,
		name: task.name,
		prompt: task.prompt,
		cron: schedule ? (automationScheduleToCron(schedule) ?? "") : "",
		isOnce: schedule?.kind === "once",
		enabled: task.enabled,
		cwd: task.runTarget.projectCwd,
		...(task.model ? { modelKey: task.model.key } : {}),
		...(task.executionMode ? { executionMode: task.executionMode } : {}),
		...(task.skill ? { skill: task.skill } : {}),
		...(task.permissionTiers ? { permissionTiers: task.permissionTiers } : {}),
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
		lastRunAt: task.lastRunAt,
		lastRunStatus: task.lastRunStatus,
	};
}

/** v1 创建输入 → v2 创建请求。 */
export function v1CreateToV2(
	input: Pick<
		AgentScheduledTaskCreate,
		| "name"
		| "prompt"
		| "cron"
		| "isOnce"
		| "enabled"
		| "cwd"
		| "modelKey"
		| "executionMode"
		| "skill"
		| "permissionTiers"
	>,
): AutomationTaskInput {
	return {
		name: input.name,
		prompt: input.prompt,
		schedule: legacyCronToSchedule(input.cron, input.isOnce ?? false, Date.now()),
		runTarget: { mode: "new-session", projectCwd: input.cwd },
		enabled: input.enabled ?? true,
		...(input.modelKey !== undefined ? { model: { key: input.modelKey } } : {}),
		...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
		...(input.skill !== undefined ? { skill: input.skill } : {}),
		...(input.permissionTiers !== undefined ? { permissionTiers: input.permissionTiers } : {}),
	};
}

/**
 * v1 补丁 → v2 补丁。cron / isOnce / cwd 的换算依赖任务当前形态，传入当前任务；
 * modelKey / skill 为 null 时清除对应字段（v1 契约已带 null 清除语义）。
 */
export function v1PatchToV2(
	patch: Omit<AgentScheduledTaskPatch, "modelKey" | "skill"> & {
		readonly modelKey?: string | null;
		readonly skill?: object | null;
	},
	current: ScheduledTask,
): AutomationTaskPatch {
	const schedule = translateSchedulePatch(patch, current);
	return {
		...(patch.name !== undefined ? { name: patch.name } : {}),
		...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
		...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
		...(patch.modelKey !== undefined
			? patch.modelKey === null
				? { model: null }
				: { model: { key: patch.modelKey } }
			: {}),
		...(patch.executionMode !== undefined ? { executionMode: patch.executionMode } : {}),
		...(patch.skill !== undefined
			? { skill: patch.skill === null ? null : (patch.skill as AutomationTaskPatch["skill"]) }
			: {}),
		...(patch.permissionTiers !== undefined ? { permissionTiers: patch.permissionTiers } : {}),
		...(schedule ? { schedule } : {}),
		...(patch.cwd !== undefined
			? {
					runTarget:
						current.runTarget.mode === "same-session"
							? { ...current.runTarget, projectCwd: patch.cwd }
							: { mode: "new-session" as const, projectCwd: patch.cwd },
				}
			: {}),
	};
}

/**
 * cron / isOnce 补丁合成 v2 schedule；都未涉及时返回 undefined。
 * 只改 isOnce 时用任务当前 cron 重换算；当前计划无法用 cron 表达时按空串进入
 * 迁移转换（落为非法自定义 cron 被服务层拒绝，与 v1 面输入契约一致）。
 */
function translateSchedulePatch(
	patch: Pick<AgentScheduledTaskPatch, "cron" | "isOnce">,
	current: ScheduledTask,
): AutomationSchedule | undefined {
	if (patch.cron === undefined && patch.isOnce === undefined) return undefined;
	const cron = patch.cron ?? (current.schedule ? (automationScheduleToCron(current.schedule) ?? "") : "");
	const isOnce = patch.isOnce ?? current.schedule?.kind === "once";
	return legacyCronToSchedule(cron, isOnce, Date.now());
}
