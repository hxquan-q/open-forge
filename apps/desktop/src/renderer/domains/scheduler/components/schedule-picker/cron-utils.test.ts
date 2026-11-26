// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { CRON_FIELDS, defaultScheduleFor, formatCronField, parseCronField, sortMonthDays } from "./automation-schedule";
import { automationToV1Fields, describeSchedule, describeTaskSchedule } from "./cron-utils";

/**
 * 最小 t 替身：插值直接拼回 key，断言只看结构与占位符；
 * weekdayNames 的 returnObjects 分支返回固定数组，weekdayJoin 返回固定连接符便于阅读。
 */
function fakeT(key: string, options?: Record<string, unknown>): string | string[] {
	if (key === "schedule.weekdayNames") return ["w0", "w1", "w2", "w3", "w4", "w5", "w6"];
	if (key === "schedule.weekdayJoin") return "|";
	if (!options) return key;
	return `${key}:${Object.entries(options)
		.filter(([name]) => name !== "returnObjects")
		.map(([name, value]) => `${name}=${String(value)}`)
		.join(",")}`;
}
const t = fakeT as never;

describe("describeSchedule", () => {
	it("describes every picker kind through its own i18n key", () => {
		const at = new Date(2028, 5, 20, 8, 5).getTime();
		expect(describeSchedule({ kind: "once", at }, t)).toBe("schedule.once:date=2028-06-20,time=08:05");
		expect(describeSchedule({ kind: "hourly", minute: 15 }, t)).toBe("schedule.hourly:minute=15");
		expect(describeSchedule({ kind: "daily", hour: 9, minute: 5 }, t)).toBe("schedule.daily:time=09:05");
		expect(describeSchedule({ kind: "weekly", weekdays: [3, 1], hour: 18, minute: 30 }, t)).toBe(
			"schedule.weekly:days=w1|w3,time=18:30",
		);
		expect(describeSchedule({ kind: "monthly", days: [15, 1], hour: 9, minute: 0 }, t)).toBe(
			"schedule.monthly:days=schedule.monthDay:day=1|schedule.monthDay:day=15,time=09:00",
		);
		expect(describeSchedule({ kind: "custom", cron: "*/5 * * * *" }, t)).toBe("schedule.custom");
	});

	it("sorts month days with last at the end", () => {
		expect(describeSchedule({ kind: "monthly", days: ["last", 20, 1], hour: 9, minute: 0 }, t)).toBe(
			"schedule.monthly:days=schedule.monthDay:day=1|schedule.monthDay:day=20|schedule.lastDay,time=09:00",
		);
	});

	it("uses hour units for divisible intervals and minutes otherwise", () => {
		expect(describeSchedule({ kind: "interval", everyMinutes: 120, startAt: 1 }, t)).toBe(
			"schedule.intervalHours:hours=2",
		);
		expect(describeSchedule({ kind: "interval", everyMinutes: 45, startAt: 1 }, t)).toBe(
			"schedule.intervalMinutes:minutes=45",
		);
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

	it("expresses numeric-only monthly as cron but refuses last-day shapes", () => {
		expect(automationToV1Fields({ kind: "monthly", days: [1, 15], hour: 9, minute: 0 })).toEqual({
			cron: "0 9 1,15 * *",
			isOnce: false,
		});
		expect(automationToV1Fields({ kind: "monthly", days: [1, "last"], hour: 9, minute: 0 })).toBeNull();
	});

	it("returns null instead of approximating shapes cron cannot carry", () => {
		expect(automationToV1Fields({ kind: "interval", everyMinutes: 120, startAt: 1 })).toBeNull();
	});

	it("marks once as isOnce with its calendar date", () => {
		const at = new Date(2028, 5, 20, 8, 5).getTime();
		expect(automationToV1Fields({ kind: "once", at })).toEqual({ cron: "5 8 20 6 *", isOnce: true });
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

	it("prefers the schedule description when present", () => {
		expect(describeTaskSchedule({ ...base, schedule: { kind: "daily", hour: 9, minute: 5 } }, t)).toBe(
			"schedule.daily:time=09:05",
		);
	});

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

describe("defaultScheduleFor", () => {
	it("keeps the previous time of day when switching kinds", () => {
		const result = defaultScheduleFor("daily", 0, { kind: "weekly", weekdays: [1], hour: 17, minute: 42 });
		expect(result).toEqual({ kind: "daily", hour: 17, minute: 42 });
	});

	it("picks the time of day out of a once timestamp", () => {
		const at = new Date(2028, 5, 20, 8, 5).getTime();
		expect(defaultScheduleFor("hourly", 0, { kind: "once", at })).toEqual({ kind: "hourly", minute: 5 });
	});

	it("rolls once to the next day when the time today has already passed", () => {
		const now = new Date(2028, 0, 10, 20, 0).getTime();
		const result = defaultScheduleFor("once", now, { kind: "daily", hour: 9, minute: 0 });
		if (result.kind !== "once") throw new Error("expected once");
		expect(new Date(result.at).getDate()).toBe(11);
		expect(new Date(result.at).getHours()).toBe(9);

		const sameDay = defaultScheduleFor("once", now, { kind: "daily", hour: 21, minute: 0 });
		if (sameDay.kind !== "once") throw new Error("expected once");
		expect(new Date(sameDay.at).getDate()).toBe(10);
	});

	it("anchors weekly/monthly defaults on the current day", () => {
		const now = new Date(2028, 0, 10, 20, 0).getTime();
		expect(defaultScheduleFor("weekly", now)).toEqual({
			kind: "weekly",
			weekdays: [new Date(now).getDay()],
			hour: 9,
			minute: 0,
		});
		expect(defaultScheduleFor("monthly", now)).toEqual({
			kind: "monthly",
			days: [new Date(now).getDate()],
			hour: 9,
			minute: 0,
		});
	});

	it("carries expressible shapes into the custom cron text", () => {
		expect(defaultScheduleFor("custom", 0, { kind: "daily", hour: 9, minute: 30 })).toEqual({
			kind: "custom",
			cron: "30 9 * * *",
		});
		// 只有整除 60 的间隔能写成 cron 分钟步长。
		expect(defaultScheduleFor("custom", 0, { kind: "interval", everyMinutes: 30, startAt: 1 })).toEqual({
			kind: "custom",
			cron: "*/30 * * * *",
		});
	});

	it("falls back to a daily cron for shapes a cron cannot express", () => {
		expect(defaultScheduleFor("custom", 0, { kind: "interval", everyMinutes: 45, startAt: 1 })).toEqual({
			kind: "custom",
			cron: "0 9 * * *",
		});
		// once 有明确时刻时回退也沿用该时刻。
		const at = new Date(2028, 5, 20, 8, 5).getTime();
		expect(defaultScheduleFor("custom", 0, { kind: "once", at })).toEqual({
			kind: "custom",
			cron: "5 8 * * *",
		});
		expect(defaultScheduleFor("custom", 0)).toEqual({ kind: "custom", cron: "0 9 * * *" });
	});
});

describe("parseCronField / formatCronField", () => {
	const minute = CRON_FIELDS.find((spec) => spec.key === "minute");
	const weekday = CRON_FIELDS.find((spec) => spec.key === "weekday");
	if (!minute || !weekday) throw new Error("missing specs");

	it("returns null for wildcard and undefined for unvisualizable syntax", () => {
		expect(parseCronField("*", minute)).toBeNull();
		expect(parseCronField("L", minute)).toBeUndefined();
		expect(parseCronField("W", minute)).toBeUndefined();
		expect(parseCronField("?", minute)).toBeUndefined();
		expect(parseCronField("5-2", minute)).toBeUndefined();
		expect(parseCronField("70", minute)).toBeUndefined();
	});

	it("expands lists, ranges and steps into value sets", () => {
		expect([...(parseCronField("1,3,5", minute) as ReadonlySet<number>)].sort((a, b) => a - b)).toEqual([1, 3, 5]);
		expect([...(parseCronField("1-5", minute) as ReadonlySet<number>)].sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect([...(parseCronField("*/15", minute) as ReadonlySet<number>)].sort((a, b) => a - b)).toEqual([
			0, 15, 30, 45,
		]);
	});

	it("normalizes weekday 7 to sunday 0", () => {
		expect([...(parseCronField("0-7", weekday) as ReadonlySet<number>)].sort((a, b) => a - b)).toEqual([
			0, 1, 2, 3, 4, 5, 6,
		]);
	});

	it("formats wildcards and compresses consecutive runs into ranges", () => {
		expect(formatCronField(null)).toBe("*");
		expect(formatCronField(new Set())).toBe("*");
		expect(formatCronField(new Set([1, 2, 3, 7]))).toBe("1-3,7");
		expect(formatCronField(new Set([1, 2]))).toBe("1,2");
		expect(formatCronField(new Set([5]))).toBe("5");
	});

	it("round-trips parsed visualization values", () => {
		for (const field of ["1,3,5", "1-5", "0,15,30,45", "9"]) {
			const parsed = parseCronField(field, minute);
			expect(parsed).toBeDefined();
			expect(parseCronField(formatCronField(parsed as ReadonlySet<number>), minute)).toEqual(parsed);
		}
	});
});

describe("sortMonthDays", () => {
	it("orders numeric days ascending with last at the end", () => {
		expect(sortMonthDays(["last", 20, 1])).toEqual([1, 20, "last"]);
	});
});
