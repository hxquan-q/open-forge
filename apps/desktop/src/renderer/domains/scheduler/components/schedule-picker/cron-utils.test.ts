// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import {
	automationToSchedule,
	automationToV1Fields,
	describeAutomationSchedule,
	describeTaskSchedule,
	scheduleToAutomation,
} from "./cron-utils";

/** 最小 t 替身：插值直接拼回 key，断言只看结构与占位符。 */
function fakeT(key: string, options?: Record<string, unknown>): string {
	if (!options) return key;
	return `${key}:${Object.entries(options)
		.map(([name, value]) => `${name}=${String(value)}`)
		.join(",")}`;
}
const t = fakeT as never;

describe("scheduleToAutomation", () => {
	it("converts once into an absolute timestamp", () => {
		const result = scheduleToAutomation({
			mode: "once",
			year: 2028,
			month: 6,
			day: 20,
			hour: 8,
			minute: 5,
		});
		expect(result).toEqual({
			kind: "once",
			at: new Date(2028, 5, 20, 8, 5).getTime(),
		});
	});

	it("anchors interval startAt at edit time（编辑重新锚定）", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2028, 0, 1, 10, 0));
		const result = scheduleToAutomation({ mode: "interval", intervalHours: 2 });
		expect(result).toEqual({ kind: "interval", everyMinutes: 120, startAt: Date.now() });
		vi.useRealTimers();
	});

	it("converts weekly into sorted weekdays", () => {
		const result = scheduleToAutomation({ mode: "weekly", weekdays: new Set([5, 1]), hour: 17, minute: 30 });
		expect(result).toEqual({ kind: "weekly", weekdays: [1, 5], hour: 17, minute: 30 });
	});
});

describe("automationToSchedule", () => {
	it("round-trips picker-expressible kinds", () => {
		expect(automationToSchedule({ kind: "daily", hour: 9, minute: 15 })).toEqual({
			mode: "daily",
			hour: 9,
			minute: 15,
		});
		expect(automationToSchedule({ kind: "interval", everyMinutes: 120, startAt: 1 })).toEqual({
			mode: "interval",
			intervalHours: 2,
		});
	});

	it("returns null for shapes the picker cannot express", () => {
		expect(automationToSchedule({ kind: "hourly", minute: 30 })).toBeNull();
		expect(automationToSchedule({ kind: "monthly", days: [1], hour: 9, minute: 0 })).toBeNull();
		expect(automationToSchedule({ kind: "custom", cron: "*/5 * * * *" })).toBeNull();
		expect(automationToSchedule({ kind: "interval", everyMinutes: 45, startAt: 1 })).toBeNull();
		expect(automationToSchedule(undefined)).toBeNull();
	});
});

describe("automationToV1Fields", () => {
	it("expresses daily / weekly / hourly / custom as cron", () => {
		expect(automationToV1Fields({ kind: "daily", hour: 9, minute: 5 })).toEqual({
			cron: "5 9 * * *",
			isOnce: false,
		});
		expect(automationToV1Fields({ kind: "weekly", weekdays: [3, 1], hour: 18, minute: 30 })).toEqual({
			cron: "30 18 * * 1,3",
			isOnce: false,
		});
		expect(automationToV1Fields({ kind: "hourly", minute: 15 })).toEqual({ cron: "15 * * * *", isOnce: false });
		expect(automationToV1Fields({ kind: "custom", cron: "*/5 * * * *" })).toEqual({
			cron: "*/5 * * * *",
			isOnce: false,
		});
	});

	it("returns null instead of approximating shapes cron cannot carry", () => {
		expect(automationToV1Fields({ kind: "interval", everyMinutes: 120, startAt: 1 })).toBeNull();
		expect(automationToV1Fields({ kind: "monthly", days: [1, "last"], hour: 9, minute: 0 })).toBeNull();
	});

	it("marks once as isOnce with its calendar date", () => {
		const at = new Date(2028, 5, 20, 8, 5).getTime();
		expect(automationToV1Fields({ kind: "once", at })).toEqual({ cron: "5 8 20 6 *", isOnce: true });
	});
});

describe("describeAutomationSchedule", () => {
	it("uses intervalMinutes for sub-hour intervals the picker cannot show", () => {
		expect(describeAutomationSchedule({ kind: "interval", everyMinutes: 45, startAt: 1 }, t)).toBe(
			"schedule.intervalMinutes:minutes=45",
		);
	});

	it("falls back to the raw cron for custom schedules", () => {
		expect(describeAutomationSchedule({ kind: "custom", cron: "*/5 * * * *" }, t)).toBe("*/5 * * * *");
	});
});

describe("describeTaskSchedule", () => {
	const base = {
		id: "task-1",
		name: "n",
		prompt: "p",
		runTarget: { mode: "new-session" as const, projectCwd: "/x" },
		enabled: true,
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
	};

	it("explains event / manual triggers when there is no schedule", () => {
		expect(describeTaskSchedule({ ...base, trigger: { type: "event", event: "session.created" } }, t)).toBe(
			"trigger.events.session.created",
		);
		expect(describeTaskSchedule({ ...base, trigger: { type: "manual" } }, t)).toBe("trigger.manual");
	});

	it("falls back to the trigger name for cron tasks without a schedule", () => {
		expect(describeTaskSchedule(base, t)).toBe("trigger.cron");
	});
});
