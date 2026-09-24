import { describe, expect, it } from "vitest";
import { ROUTING_EVAL_TOOL_NAMES } from "./fake-tools.js";
import { loadToolRoutingGoldens } from "./goldens.js";

describe("tool-routing goldens", () => {
	it("covers the paired routing scenarios from the evaluation doc", () => {
		const goldens = loadToolRoutingGoldens();
		expect(goldens.map((golden) => golden.id)).toEqual([
			"website-dark-mode",
			"vetta-window-dark",
			"install-vetta-plugin",
			"install-project-vite-plugin",
			"create-react-project",
			"add-dir-to-sidebar",
			"business-cron",
			"vetta-daily-summary",
			"scheduler-capabilities",
			"use-pdf-skill",
			"list-execution-plan",
			"add-to-vetta-board",
			"who-is-max",
			"draw-monthly-trend",
			"implement-trend-chart",
			"preview-react-app",
			"export-remotion-mp4",
		]);
		const catalog = new Set<string>(ROUTING_EVAL_TOOL_NAMES);
		for (const golden of goldens) {
			expect(golden.input.length).toBeGreaterThan(0);
			if (golden.expectedFirstTool.length > 0) {
				expect(catalog.has(golden.expectedFirstTool)).toBe(true);
			}
			expect(golden.forbiddenTools.every((name) => catalog.has(name))).toBe(true);
		}
	});
});
