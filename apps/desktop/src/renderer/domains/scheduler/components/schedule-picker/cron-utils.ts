// Modified by The Open Forge contributors.
/**
 * Cron expression generation and parsing utilities for the schedule picker.
 *
 * Cron format (node-cron): minute hour day-of-month month day-of-week
 * Fields:
 *   minute      (0-59)
 *   hour        (0-23)
 *   day-of-month (1-31)
 *   month       (1-12)
 *   day-of-week (0-6, 0=Sunday)
 */

import type { AutomationSchedule, ScheduledTask } from "@shared/store/atoms";
import type { TFunction } from "i18next";

export type ScheduleMode = "once" | "daily" | "weekly" | "interval";

export interface OnceSchedule {
	mode: "once";
	/** Year as integer, e.g. 2026 */
	year: number;
	/** Month as integer (1-12) */
	month: number;
	/** Day as integer (1-31) */
	day: number;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface DailySchedule {
	mode: "daily";
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface WeeklySchedule {
	mode: "weekly";
	/** Set of weekdays (0=Sunday, 1=Monday, ..., 6=Saturday) */
	weekdays: Set<number>;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface IntervalSchedule {
	mode: "interval";
	/** Interval value in hours */
	intervalHours: number;
}

export type Schedule = OnceSchedule | DailySchedule | WeeklySchedule | IntervalSchedule;

/** Human-readable description of a schedule */
export function describeSchedule(schedule: Schedule, t: TFunction<"automation">): string {
	switch (schedule.mode) {
		case "once": {
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.once", {
				year: schedule.year,
				month: schedule.month,
				day: schedule.day,
				time: timeStr,
			});
		}
		case "daily": {
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.daily", { time: timeStr });
		}
		case "weekly": {
			const weekdayNames = t("schedule.weekdayNames", { returnObjects: true }) as string[];
			const sortedDays = [...schedule.weekdays].sort((a, b) => a - b);
			const dayStr =
				sortedDays.length === 1
					? weekdayNames[sortedDays[0]]
					: sortedDays.map((d) => weekdayNames[d]).join(t("schedule.weekdayJoin"));
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.weekly", { days: dayStr, time: timeStr });
		}
		case "interval": {
			if (schedule.intervalHours === 1) return t("schedule.intervalOne");
			return t("schedule.interval", { hours: schedule.intervalHours });
		}
	}
}

/** Get default schedule values for each mode */
export function getDefaultOnceSchedule(): OnceSchedule {
	const now = new Date();
	// Default to next hour (minimum non-past time)
	const next = new Date(now);
	next.setMinutes(next.getMinutes() + 1);
	next.setSeconds(0);
	next.setMilliseconds(0);
	// If we're at minute 59, go to next hour
	if (next.getMinutes() === 0 && now.getMinutes() > 0) {
		// Already set to next hour correctly
	}
	return {
		mode: "once",
		year: next.getFullYear(),
		month: next.getMonth() + 1,
		day: next.getDate(),
		hour: next.getHours(),
		minute: next.getMinutes(),
	};
}

export function getDefaultDailySchedule(): DailySchedule {
	return { mode: "daily", hour: 9, minute: 0 };
}

export function getDefaultWeeklySchedule(): WeeklySchedule {
	return { mode: "weekly", weekdays: new Set([1]), hour: 9, minute: 0 };
}

export function getDefaultIntervalSchedule(): IntervalSchedule {
	// Default to 2 hours so "custom" mode is active on first click,
	// allowing users to enter any interval value.
	return { mode: "interval", intervalHours: 2 };
}

/**
 * 选择器状态 → v2 调度判别联合（ADR-0155：编辑器直编联合，不再经 cron 编译）。
 * 间隔按「编辑重新锚定」语义把 startAt 记为当前时刻。
 */
export function scheduleToAutomation(schedule: Schedule): AutomationSchedule {
	switch (schedule.mode) {
		case "once":
			return {
				kind: "once",
				at: new Date(schedule.year, schedule.month - 1, schedule.day, schedule.hour, schedule.minute).getTime(),
			};
		case "daily":
			return { kind: "daily", hour: schedule.hour, minute: schedule.minute };
		case "weekly":
			return {
				kind: "weekly",
				weekdays: [...schedule.weekdays].sort((a, b) => a - b),
				hour: schedule.hour,
				minute: schedule.minute,
			};
		case "interval":
			return { kind: "interval", everyMinutes: schedule.intervalHours * 60, startAt: Date.now() };
	}
}

/**
 * v2 判别联合 → 选择器状态。选择器只有单次/每天（含每周）/整小时间隔三档；
 * hourly、monthly、custom 与非整小时间隔返回 null——调用方用原文展示且不跟随重置。
 */
export function automationToSchedule(schedule: AutomationSchedule | undefined): Schedule | null {
	if (!schedule) return null;
	switch (schedule.kind) {
		case "once": {
			const at = new Date(schedule.at);
			return {
				mode: "once",
				year: at.getFullYear(),
				month: at.getMonth() + 1,
				day: at.getDate(),
				hour: at.getHours(),
				minute: at.getMinutes(),
			};
		}
		case "daily":
			return { mode: "daily", hour: schedule.hour, minute: schedule.minute };
		case "weekly":
			return {
				mode: "weekly",
				weekdays: new Set(schedule.weekdays),
				hour: schedule.hour,
				minute: schedule.minute,
			};
		case "interval":
			if (schedule.everyMinutes % 60 !== 0) return null;
			return { mode: "interval", intervalHours: schedule.everyMinutes / 60 };
		default:
			return null;
	}
}

/**
 * v2 判别联合 → v1（cron / isOnce）外部形状。无法完整表达的形态返回 null：
 * once 的 cron 近似不带年份会逐年重复，interval 超出 cron 表达力，按输入契约不近似。
 */
export function automationToV1Fields(schedule: AutomationSchedule): { cron: string; isOnce: boolean } | null {
	switch (schedule.kind) {
		case "once": {
			const at = new Date(schedule.at);
			return {
				cron: `${at.getMinutes()} ${at.getHours()} ${at.getDate()} ${at.getMonth() + 1} *`,
				isOnce: true,
			};
		}
		case "daily":
			return { cron: `${schedule.minute} ${schedule.hour} * * *`, isOnce: false };
		case "weekly":
			return {
				cron: `${schedule.minute} ${schedule.hour} * * ${[...schedule.weekdays].sort((a, b) => a - b).join(",")}`,
				isOnce: false,
			};
		case "hourly":
			return { cron: `${schedule.minute} * * * *`, isOnce: false };
		case "monthly": {
			if (schedule.days.some((day) => day === "last")) return null;
			return {
				cron: `${schedule.minute} ${schedule.hour} ${schedule.days.join(",")} * *`,
				isOnce: false,
			};
		}
		case "custom":
			return { cron: schedule.cron.trim(), isOnce: false };
		case "interval":
			return null;
	}
}

/** 单个计划的人类可读描述；选择器表达不了的档位展示原文，不近似成别的计划。 */
export function describeAutomationSchedule(schedule: AutomationSchedule, t: TFunction<"automation">): string {
	const picker = automationToSchedule(schedule);
	if (picker) {
		// 非整小时间隔已由 automationToSchedule 排除；这里只需要选择器三档的描述。
		if (picker.mode !== "interval" || schedule.kind === "interval") return describeSchedule(picker, t);
	}
	switch (schedule.kind) {
		case "interval":
			return t("schedule.intervalMinutes", { minutes: schedule.everyMinutes });
		default: {
			const cron = automationToV1Fields(schedule);
			return cron ? cron.cron : t("schedule.customFallback");
		}
	}
}

/**
 * 任务详情/列表共用的计划描述。event / manual 触发没有计划时沿用触发说明；
 * cron 触发（含缺省）理论上必有 schedule，缺失时展示触发名而不是空白。
 */
export function describeTaskSchedule(task: ScheduledTask, t: TFunction<"automation">): string {
	if (task.schedule) return describeAutomationSchedule(task.schedule, t);
	const trigger = task.trigger;
	if (trigger?.type === "event" && trigger.event) return t(`trigger.events.${trigger.event}`);
	if (trigger?.type === "manual") return t("trigger.manual");
	return t("trigger.cron");
}
