// Modified by The Open Forge contributors.
/**
 * Built-in automation templates shown when the user has no scheduled tasks.
 * User-facing strings live in i18n (`automation.recommend.items.<id>.*`).
 * 计划直写 v2 判别联合（ADR-0155），不再经 cron 编译。
 */
import type { AutomationSchedule } from "@shared/store/atoms";

export interface RecommendedAutomationTaskTemplate {
	readonly id: "morningBrief" | "dailySummary" | "weeklyReview";
	/** Iconify class used by the empty-state cards. */
	readonly icon: string;
	readonly schedule: AutomationSchedule;
}

export const RECOMMENDED_AUTOMATION_TASKS: readonly RecommendedAutomationTaskTemplate[] = [
	{
		id: "morningBrief",
		icon: "icon-[mdi--weather-sunny]",
		// Weekdays 09:00
		schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5], hour: 9, minute: 0 },
	},
	{
		id: "dailySummary",
		icon: "icon-[mdi--clipboard-text-outline]",
		// Every day 18:00
		schedule: { kind: "daily", hour: 18, minute: 0 },
	},
	{
		id: "weeklyReview",
		icon: "icon-[mdi--chart-timeline-variant]",
		// Friday 17:00
		schedule: { kind: "weekly", weekdays: [5], hour: 17, minute: 0 },
	},
] as const;
