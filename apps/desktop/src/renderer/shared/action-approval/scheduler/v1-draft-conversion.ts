// Copyright The Open Forge contributors.
/**
 * 审批抽屉边界的 v1（cron / isOnce）↔ v2（schedule 判别联合）转换（ADR-0155 §7）。
 *
 * Agent 工具与插件域的输入契约保持 cron 形状，抽屉表单直编 v2 联合：
 * 进 —— 任务当前 v2 形态打底，再叠加 v1 补丁（cron / isOnce 先换算成 schedule）；
 * 出 —— schedule 能无损回到 cron 才写回 v1 键，表达不了的形态不下发
 * （update 语义下等于保持原计划，不近似、不漂移）。
 */

import type { SchedulerTaskDraft } from "@domains/scheduler/components/SchedulerTaskFields";
import { automationToV1Fields } from "@domains/scheduler/components/schedule-picker/cron-utils";
import { automationScheduleToCron, type ScheduledTask } from "@/shared/automation";
import { legacyCronToSchedule } from "@/shared/automation-timing";

/** 任务当前的 v2 形态 → 抽屉初始草稿。 */
export function taskToDraft(task: ScheduledTask): SchedulerTaskDraft {
	return {
		name: task.name,
		prompt: task.prompt,
		schedule: task.schedule,
		enabled: task.enabled,
		cwd: task.runTarget.projectCwd,
		modelKey: task.model?.key ?? null,
		executionMode: task.executionMode,
		skill: task.skill,
		trigger: task.trigger,
	};
}

/**
 * v1 输入（可带 cron / isOnce / cwd / modelKey）叠加到草稿上。
 * cron 缺省时沿用叠加前的 schedule 换算；isOnce 缺省沿用叠加前计划是否为 once——
 * 与 main 侧 v1PatchToV2 的口径一致（同一表达式两侧理解相同）。
 */
export function mergeV1InputIntoDraft<T extends SchedulerTaskDraft>(base: T, input: Record<string, unknown>): T {
	const merged = { ...base } as Record<string, unknown>;
	const cron = typeof input.cron === "string" ? input.cron : undefined;
	const isOnce = typeof input.isOnce === "boolean" ? input.isOnce : undefined;
	if (cron !== undefined || isOnce !== undefined) {
		const baseCron = cron ?? (base.schedule ? (automationScheduleToCron(base.schedule) ?? "") : "");
		const baseIsOnce = isOnce ?? base.schedule?.kind === "once";
		merged.schedule = legacyCronToSchedule(baseCron, baseIsOnce, Date.now());
	}
	for (const key of ["name", "prompt", "enabled", "cwd", "modelKey", "executionMode", "skill"] as const) {
		if (key in input) merged[key] = input[key];
	}
	return merged as T;
}

/**
 * 草稿里的 schedule → v1 输出键。cron 能无损表达才写 cron / isOnce；
 * 表达不了（interval、monthly 含 "last"、once 丢年份会逐年重复）不写——
 * update 语义下保持原计划，不近似。
 */
export function scheduleToV1Output(schedule: SchedulerTaskDraft["schedule"]): {
	readonly cron?: string;
	readonly isOnce?: boolean;
} {
	if (!schedule) return {};
	const fields = automationToV1Fields(schedule);
	if (!fields) return {};
	return { cron: fields.cron, isOnce: fields.isOnce };
}
