// Modified by The Open Forge contributors.
/**
 * 调度描述的纯函数（ADR-0155：编辑器直编判别联合，不再有选择器中间形状）。
 * 切档默认值与 cron 五段可视化在 automation-schedule.ts。
 */

import type { TFunction } from "i18next";
import type { AutomationSchedule, ScheduledTask } from "@/shared/automation";
import { pad2, sortMonthDays } from "./automation-schedule";

/** 列表、审批与表单共用的「重复」描述。 */
export function describeSchedule(schedule: AutomationSchedule, t: TFunction<"automation">): string {
	switch (schedule.kind) {
		case "once": {
			const date = new Date(schedule.at);
			return t("schedule.once", {
				date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
				time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
			});
		}
		case "interval":
			return schedule.everyMinutes % 60 === 0
				? t("schedule.intervalHours", { hours: schedule.everyMinutes / 60 })
				: t("schedule.intervalMinutes", { minutes: schedule.everyMinutes });
		case "hourly":
			return t("schedule.hourly", { minute: pad2(schedule.minute) });
		case "daily":
			return t("schedule.daily", { time: `${pad2(schedule.hour)}:${pad2(schedule.minute)}` });
		case "weekly": {
			const names = t("schedule.weekdayNames", { returnObjects: true }) as string[];
			const days = [...schedule.weekdays].sort((a, b) => a - b).map((day) => names[day]);
			return t("schedule.weekly", {
				days: days.join(t("schedule.weekdayJoin")),
				time: `${pad2(schedule.hour)}:${pad2(schedule.minute)}`,
			});
		}
		case "monthly": {
			const days = sortMonthDays(schedule.days).map((day) =>
				day === "last" ? t("schedule.lastDay") : t("schedule.monthDay", { day }),
			);
			return t("schedule.monthly", {
				days: days.join(t("schedule.weekdayJoin")),
				time: `${pad2(schedule.hour)}:${pad2(schedule.minute)}`,
			});
		}
		case "custom":
			return t("schedule.custom");
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

/**
 * 任务详情/列表共用的计划描述。event / manual 触发没有计划时沿用触发说明；
 * cron 触发（含缺省）理论上必有 schedule，缺失时展示触发名而不是空白。
 */
export function describeTaskSchedule(task: ScheduledTask, t: TFunction<"automation">): string {
	if (task.schedule) return describeSchedule(task.schedule, t);
	const trigger = task.trigger;
	if (trigger?.type === "event" && trigger.event) return t(`trigger.events.${trigger.event}`);
	if (trigger?.type === "manual") return t("trigger.manual");
	return t("trigger.cron");
}
