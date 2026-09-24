import { describe, expect, it } from "vitest";
import { ROUTING_EVAL_TOOL_NAMES } from "./fake-tools.js";
import { isolationViolations } from "./isolation.js";

describe("eval session isolation", () => {
	it("accepts an empty skill list and the eval catalog tools", () => {
		expect(
			isolationViolations({
				skillNames: [],
				activeToolNames: [...ROUTING_EVAL_TOOL_NAMES],
			}),
		).toEqual([]);
	});

	it("rejects host skills and leftover invoke_skill", () => {
		const violations = isolationViolations({
			skillNames: ["impeccable", "find-skills"],
			activeToolNames: ["invoke_skill", "edit_website_theme"],
		});
		expect(violations[0]).toBe("loaded leaked skills: impeccable, find-skills");
		expect(violations).toContain("unexpected active tools: invoke_skill");
		expect(violations.some((violation) => violation.startsWith("missing routing tools:"))).toBe(true);
	});
});
