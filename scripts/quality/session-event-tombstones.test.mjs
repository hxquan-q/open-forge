// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { findSessionEventTombstoneViolations, RETIRED_SESSION_EVENT_TYPES } from "./check-session-event-tombstones.mjs";

describe("session event tombstones", () => {
	it("registers the SessionEvent types deleted in TASK-0204", () => {
		expect(Object.keys(RETIRED_SESSION_EVENT_TYPES).sort()).toEqual(["message.final", "toolcall.args"]);
	});

	it("flags quoted references to retired types outside the guard itself", () => {
		const violations = findSessionEventTombstoneViolations([
			{ path: "apps/desktop/src/main/pet/policy.ts", text: `if (event.type === "message.final") return;` },
			{ path: "packages/runtime-core/test/legacy.test.ts", text: "expect(name).toBe(`toolcall.args`);" },
		]);
		expect(violations).toHaveLength(2);
		expect(violations[0]).toContain("apps/desktop/src/main/pet/policy.ts:1");
		expect(violations[0]).toContain("message.final");
		expect(violations[1]).toContain("toolcall.args");
	});

	it("ignores unquoted text and the guard's own files", () => {
		const violations = findSessionEventTombstoneViolations([
			{ path: "docs/notes.md", text: "message.final and toolcall.args were removed without quotes" },
			{ path: "scripts/quality/check-session-event-tombstones.mjs", text: `"message.final"` },
			{ path: "scripts/quality/session-event-tombstones.test.mjs", text: `"toolcall.args"` },
		]);
		expect(violations).toEqual([]);
	});
});
