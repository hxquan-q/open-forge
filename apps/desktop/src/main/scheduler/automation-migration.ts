// Modified by The Open Forge contributors.
/**
 * v1（prompt + cron + isOnce）→ v2（schedule 判别联合 + runTarget）的一次性迁移（ADR-0155 §8）。
 * 与上游迁移的关键差异：permissionTiers / trigger / executionMode / skill 原样保留（D4 拍板），
 * event / manual 任务的 cron 字段丢弃且不转 schedule——执行链路本就不为它们注册 cron。
 */
import { normalizeAutomationTaskTrigger, normalizeUnattendedPermissionTiers } from "@vetta/coding-agent/runtime";
import type { ScheduledTask } from "../../shared/automation.js";
import { legacyCronToSchedule } from "../../shared/automation-timing.js";

/** 重新设计前写入 scheduled-tasks.json 的任务形状。 */
export interface LegacyScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	isOnce?: boolean;
	enabled: boolean;
	cwd?: string;
	modelKey?: string;
	executionMode?: string;
	skill?: { name: string; alias?: string; type: "skill" | "scene" };
	permissionTiers?: Record<string, unknown>;
	trigger?: unknown;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface LegacyMigrationContext {
	readonly conversationCwd: string;
	readonly isKnownProject: (cwd: string) => boolean;
	readonly now: number;
}

/**
 * 旧任务 → 新结构：策略一律「每次新建会话」；项目由旧 cwd 推断，认不出就落「对话」；
 * skill / permissionTiers / trigger / executionMode 原样保留（ADR-0155 §4 / §8），
 * 不走上游「丢弃权限字段 + 技能转行内 token」的路线。
 */
export function migrateLegacyTask(legacy: LegacyScheduledTask, context: LegacyMigrationContext): ScheduledTask {
	const projectCwd = legacy.cwd && context.isKnownProject(legacy.cwd) ? legacy.cwd : context.conversationCwd;
	const normalizedTrigger = normalizeAutomationTaskTrigger(legacy.trigger);
	const trigger = normalizedTrigger ?? { type: "cron" as const };
	const isCron = trigger.type === "cron";
	// 非法 / 缺省的 cron 触发是常态缺省，不写进持久化；event / manual 原样保留。
	const persistTrigger = normalizedTrigger && normalizedTrigger.type !== "cron" ? normalizedTrigger : undefined;
	const schedule = isCron ? legacyCronToSchedule(legacy.cron, legacy.isOnce === true, context.now) : undefined;
	const executionMode =
		legacy.executionMode === "inherit" || legacy.executionMode === "sandbox" || legacy.executionMode === "full-access"
			? legacy.executionMode
			: undefined;
	const tiers = normalizeUnattendedPermissionTiers(legacy.permissionTiers);
	return {
		id: legacy.id,
		name: legacy.name,
		prompt: legacy.prompt,
		...(schedule ? { schedule } : {}),
		runTarget: { mode: "new-session", projectCwd },
		...(legacy.modelKey ? { model: { key: legacy.modelKey } } : {}),
		...(executionMode ? { executionMode } : {}),
		...(legacy.skill ? { skill: legacy.skill } : {}),
		...(tiers ? { permissionTiers: tiers } : {}),
		...(persistTrigger ? { trigger: persistTrigger } : {}),
		// 过期的一次性任务不再有下一次，迁移后保持停用；event/manual 不受影响。
		enabled: legacy.enabled && (!schedule || schedule.kind !== "once" || schedule.at > context.now),
		createdAt: legacy.createdAt,
		updatedAt: legacy.updatedAt,
		lastRunAt: legacy.lastRunAt,
		lastRunStatus: legacy.lastRunStatus,
	};
}
