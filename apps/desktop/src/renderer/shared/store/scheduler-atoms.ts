// Modified by The Open Forge contributors.
import { atom } from "jotai";

export type {
	AutomationRunTarget,
	AutomationSchedule,
	ScheduledTask,
	TaskExecutionRecord,
} from "../../../shared/automation";

import type { ScheduledTask } from "../../../shared/automation";

/** 兼容别名：v1 模型拆除前的既有消费名。 */
export type ScheduledTaskPermissionTiers = NonNullable<ScheduledTask["permissionTiers"]>;
export type ScheduledTaskTrigger = NonNullable<ScheduledTask["trigger"]>;

export const scheduledTasksAtom = atom<ScheduledTask[]>([]);
/** 当前正在执行的任务 id 集合，由 task.started/record.updated 等事件维护。 */
export const runningTaskIdsAtom = atom<Set<string>>(new Set<string>());
export const selectedTaskIdAtom = atom<string | null>(null);
export const selectedRecordIdAtom = atom<string | null>(null);

/**
 * 从别处（如会话右键菜单「基于此会话创建自动化」）带着预填内容打开新建分屏。
 * 自动化页消费后置回 null。字段含义同表单编辑态（SchedulerTaskDraft），这里只放可序列化的部分。
 */
export interface AutomationCreateRequest {
	readonly name: string;
	readonly prompt: string;
	readonly cwd: string;
}
export const automationCreateRequestAtom = atom<AutomationCreateRequest | null>(null);

/**
 * 所有定时任务执行产生的 session 路径集合。侧栏据此给对应 session item
 * 挂定时图标（数据源是调度执行记录里的 sessionPath，可靠且不依赖会话名）。
 */
export const scheduledSessionPathsAtom = atom<Set<string>>(new Set<string>());

/** 自增计数器：删除执行记录后 +1，驱动正在展示的执行历史重新拉取。 */
export const scheduledRecordsVersionAtom = atom(0);
