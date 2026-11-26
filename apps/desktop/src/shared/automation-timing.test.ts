// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { isValidCronExpression, isValidSchedule, nextFireTime, summarizeFireTimes } from "./automation-timing";

const T0 = new Date("2026-01-05T10:00:00").getTime(); // 周一

describe("isValidCronExpression", () => {
	it("accepts standard 5-field cron and rejects malformed input", () => {
		expect(isValidCronExpression("0 9 * * 1")).toBe(true);
		expect(isValidCronExpression("*/5 * * * *")).toBe(true);
		expect(isValidCronExpression("0 9 * *")).toBe(false);
		expect(isValidCronExpression("not a cron")).toBe(false);
		expect(isValidCronExpression("61 9 * * *")).toBe(false);
	});
});

describe("isValidSchedule", () => {
	it("validates interval and once without a cron compile", () => {
		expect(isValidSchedule({ kind: "interval", everyMinutes: 45, startAt: T0 })).toBe(true);
		expect(isValidSchedule({ kind: "interval", everyMinutes: 0, startAt: T0 })).toBe(false);
		expect(isValidSchedule({ kind: "once", at: T0 })).toBe(true);
		expect(isValidSchedule({ kind: "daily", hour: 9, minute: 0 })).toBe(true);
	});
});

describe("nextFireTime", () => {
	it("returns the once time only when still in the future", () => {
		expect(nextFireTime({ kind: "once", at: T0 + 1000 }, T0)).toBe(T0 + 1000);
		expect(nextFireTime({ kind: "once", at: T0 }, T0)).toBeNull();
		expect(nextFireTime({ kind: "once", at: T0 - 1 }, T0)).toBeNull();
	});

	it("computes daily fire times in local time", () => {
		const expected = new Date("2026-01-06T09:00:00").getTime(); // T0 是当天 10 点，9 点已过
		expect(nextFireTime({ kind: "daily", hour: 9, minute: 0 }, T0)).toBe(expected);
	});

	it("anchors interval fires strictly to startAt steps", () => {
		const startAt = T0;
		const step = 45 * 60_000;
		// 第一触发点是 startAt + step（间隔语义），不是 startAt 本身
		expect(nextFireTime({ kind: "interval", everyMinutes: 45, startAt }, startAt - 1)).toBe(startAt + step);
		expect(nextFireTime({ kind: "interval", everyMinutes: 45, startAt }, startAt)).toBe(startAt + step);
		expect(nextFireTime({ kind: "interval", everyMinutes: 45, startAt }, startAt + step)).toBe(startAt + 2 * step);
		// 两个触发点之间的任意时刻都落在下一个整步上
		expect(nextFireTime({ kind: "interval", everyMinutes: 45, startAt }, startAt + step + 123)).toBe(
			startAt + 2 * step,
		);
	});
});

describe("summarizeFireTimes", () => {
	it("counts a single once fire inside the window", () => {
		const inside = T0 + 60_000;
		expect(summarizeFireTimes({ kind: "once", at: inside }, T0, T0 + 120_000)).toEqual({
			count: 1,
			first: inside,
			last: inside,
		});
		expect(summarizeFireTimes({ kind: "once", at: inside }, inside, T0 + 120_000)).toBeNull();
		expect(summarizeFireTimes({ kind: "once", at: inside }, T0, inside - 1)).toBeNull();
	});

	it("counts interval fires across a multi-hour window", () => {
		const startAt = T0;
		const step = 30 * 60_000;
		const to = T0 + 3 * 60 * 60_000;
		const summary = summarizeFireTimes({ kind: "interval", everyMinutes: 30, startAt }, T0, to);
		expect(summary?.count).toBe(6); // +30m..+180m 六个整点（窗口右端含 180 分钟整点）
		expect(summary?.first).toBe(startAt + step);
		expect(summary?.last).toBe(T0 + 180 * 60_000);
	});

	it("counts cron fires inside the window", () => {
		// 每天 9:00；窗口跨两天
		const dayMs = 24 * 60 * 60_000;
		const summary = summarizeFireTimes({ kind: "daily", hour: 9, minute: 0 }, T0, T0 + 2 * dayMs);
		expect(summary?.count).toBe(2);
	});

	it("returns null for empty windows and invalid schedules", () => {
		expect(summarizeFireTimes({ kind: "daily", hour: 9, minute: 0 }, T0, T0)).toBeNull();
		expect(summarizeFireTimes({ kind: "custom", cron: "bad cron here now yes" }, T0, T0 + 1000)).toBeNull();
	});

	it("caps very dense windows", () => {
		const summary = summarizeFireTimes({ kind: "custom", cron: "* * * * *" }, T0, T0 + 200_000 * 60_000, 10);
		expect(summary?.count).toBe(10);
	});
});
