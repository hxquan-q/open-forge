// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	AUTOMATION_INTERVAL_MAX_MINUTES,
	automationScheduleToCron,
	isAutomationModel,
	isAutomationRunTarget,
	isAutomationSchedule,
} from "./automation";

describe("isAutomationSchedule", () => {
	it("accepts each kind with exact keys", () => {
		expect(isAutomationSchedule({ kind: "once", at: 1_700_000_000_000 })).toBe(true);
		expect(isAutomationSchedule({ kind: "hourly", minute: 30 })).toBe(true);
		expect(isAutomationSchedule({ kind: "daily", hour: 9, minute: 0 })).toBe(true);
		expect(isAutomationSchedule({ kind: "weekly", weekdays: [1, 3, 5], hour: 9, minute: 30 })).toBe(true);
		expect(isAutomationSchedule({ kind: "monthly", days: [1, "last"], hour: 9, minute: 0 })).toBe(true);
		expect(isAutomationSchedule({ kind: "custom", cron: "0 9 * * 1" })).toBe(true);
	});

	it("accepts interval within the one-week cap", () => {
		expect(isAutomationSchedule({ kind: "interval", everyMinutes: 45, startAt: 1_700_000_000_000 })).toBe(true);
		expect(
			isAutomationSchedule({ kind: "interval", everyMinutes: AUTOMATION_INTERVAL_MAX_MINUTES, startAt: 0 }),
		).toBe(true);
	});

	it("rejects interval beyond the cap, non-integer, or missing startAt", () => {
		expect(
			isAutomationSchedule({ kind: "interval", everyMinutes: AUTOMATION_INTERVAL_MAX_MINUTES + 1, startAt: 0 }),
		).toBe(false);
		expect(isAutomationSchedule({ kind: "interval", everyMinutes: 0, startAt: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "interval", everyMinutes: 1.5, startAt: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "interval", everyMinutes: 30 })).toBe(false);
	});

	it("rejects unknown kinds, extra keys, and out-of-range fields", () => {
		expect(isAutomationSchedule({ kind: "minutely", everyMinutes: 5 })).toBe(false);
		expect(isAutomationSchedule({ kind: "daily", hour: 24, minute: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "daily", hour: 9, minute: 0, note: "x" })).toBe(false);
		expect(isAutomationSchedule({ kind: "weekly", weekdays: [], hour: 9, minute: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "weekly", weekdays: [7], hour: 9, minute: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "monthly", days: [0], hour: 9, minute: 0 })).toBe(false);
		expect(isAutomationSchedule({ kind: "custom", cron: "0 9 * *" })).toBe(false);
		expect(isAutomationSchedule(null)).toBe(false);
	});
});

describe("automationScheduleToCron", () => {
	it("compiles cron-expressible kinds", () => {
		expect(automationScheduleToCron({ kind: "hourly", minute: 15 })).toBe("15 * * * *");
		expect(automationScheduleToCron({ kind: "daily", hour: 9, minute: 30 })).toBe("30 9 * * *");
		expect(automationScheduleToCron({ kind: "weekly", weekdays: [5, 1, 3], hour: 9, minute: 0 })).toBe(
			"0 9 * * 1,3,5",
		);
		expect(automationScheduleToCron({ kind: "monthly", days: [15, 1, "last"], hour: 8, minute: 0 })).toBe(
			"0 8 1,15,L * *",
		);
		expect(automationScheduleToCron({ kind: "custom", cron: "  5 4 * * 0 " })).toBe("5 4 * * 0");
	});

	it("returns null for absolute-time kinds", () => {
		expect(automationScheduleToCron({ kind: "once", at: 0 })).toBeNull();
		expect(automationScheduleToCron({ kind: "interval", everyMinutes: 30, startAt: 0 })).toBeNull();
	});
});

describe("isAutomationRunTarget", () => {
	it("accepts both modes with valid shapes", () => {
		expect(isAutomationRunTarget({ mode: "new-session", projectCwd: "/repo" })).toBe(true);
		expect(isAutomationRunTarget({ mode: "same-session", projectCwd: "/repo", sessionPath: null })).toBe(true);
		expect(isAutomationRunTarget({ mode: "same-session", projectCwd: "/repo", sessionPath: "/s.jsonl" })).toBe(true);
	});

	it("rejects missing or blank project, unknown modes, extra keys", () => {
		expect(isAutomationRunTarget({ mode: "new-session" })).toBe(false);
		expect(isAutomationRunTarget({ mode: "new-session", projectCwd: "  " })).toBe(false);
		expect(isAutomationRunTarget({ mode: "fixed-session", projectCwd: "/repo" })).toBe(false);
		expect(isAutomationRunTarget({ mode: "new-session", projectCwd: "/repo", sessionPath: null })).toBe(false);
		expect(isAutomationRunTarget({ mode: "same-session", projectCwd: "/repo", sessionPath: "" })).toBe(false);
	});
});

describe("isAutomationModel", () => {
	it("accepts key with optional reasoning", () => {
		expect(isAutomationModel({ key: "gpt-5" })).toBe(true);
		expect(isAutomationModel({ key: "gpt-5", reasoning: "high" })).toBe(true);
	});

	it("rejects blank keys and extra fields", () => {
		expect(isAutomationModel({ key: " " })).toBe(false);
		expect(isAutomationModel({ key: "gpt-5", reasoning: 3 })).toBe(false);
		expect(isAutomationModel({ key: "gpt-5", provider: "x" })).toBe(false);
	});
});
