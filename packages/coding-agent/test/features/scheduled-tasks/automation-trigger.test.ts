// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	isCronTriggered,
	normalizeAutomationTaskTrigger,
	resolveAutomationTaskTrigger,
} from "../../../src/features/scheduled-tasks/automation-trigger.js";

describe("normalizeAutomationTaskTrigger", () => {
	it("defaults missing trigger to cron", () => {
		expect(normalizeAutomationTaskTrigger(undefined)).toEqual({ type: "cron" });
		expect(resolveAutomationTaskTrigger(undefined)).toEqual({ type: "cron" });
		expect(isCronTriggered(undefined)).toBe(true);
	});

	it("accepts event and manual shapes", () => {
		expect(normalizeAutomationTaskTrigger({ type: "event", event: "session.created" })).toEqual({
			type: "event",
			event: "session.created",
		});
		expect(normalizeAutomationTaskTrigger({ type: "manual" })).toEqual({ type: "manual" });
	});

	it("rejects unknown events and extra keys", () => {
		expect(normalizeAutomationTaskTrigger({ type: "event", event: "dom.click" })).toBeUndefined();
		expect(normalizeAutomationTaskTrigger({ type: "cron", extra: true })).toBeUndefined();
	});
});
