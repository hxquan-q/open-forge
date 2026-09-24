import { describe, expect, it } from "vitest";
import { createRoutingEvalTools, ROUTING_EVAL_SYSTEM_PROMPT, ROUTING_EVAL_TOOL_NAMES } from "./fake-tools.js";
import { loadToolRoutingGoldens } from "./goldens.js";

/**
 * VERIFY-0006/0007 found these pairs flaky under live DeepSeek.
 * Keep the isolated eval fixture and production-facing descriptions aligned so
 * removing the regression cues fails without needing another paid live run.
 */
const UNSTABLE_ROUTING_IDS = [
	"vetta-daily-summary",
	"scheduler-capabilities",
	"draw-monthly-trend",
	"implement-trend-chart",
] as const;

describe("eval fixture encodes unstable routing pairs from VERIFY", () => {
	it("keeps the unstable golden ids in the shared catalog", () => {
		const ids = new Set(loadToolRoutingGoldens().map((golden) => golden.id));
		for (const id of UNSTABLE_ROUTING_IDS) {
			expect(ids.has(id), id).toBe(true);
		}
	});

	it("requires scheduler create for daily Vetta digests and query for capability questions", () => {
		expect(ROUTING_EVAL_SYSTEM_PROMPT).toContain("vetta_scheduler_create");
		expect(ROUTING_EVAL_SYSTEM_PROMPT).toContain("vetta_scheduler_query");
		expect(ROUTING_EVAL_SYSTEM_PROMPT).toContain("每天汇总");
		expect(ROUTING_EVAL_SYSTEM_PROMPT).toContain("定时任务支持什么");

		const tools = Object.fromEntries(createRoutingEvalTools().map((tool) => [tool.name, tool.description]));
		expect(tools.vetta_scheduler_create).toContain("让 Vetta 每天");
		expect(tools.vetta_scheduler_query).toContain("定时任务支持什么");
		expect(ROUTING_EVAL_TOOL_NAMES).toContain("vetta_scheduler_create");
		expect(ROUTING_EVAL_TOOL_NAMES).toContain("vetta_scheduler_query");
	});

	it("keeps conversation charts separate from website chart implementation", () => {
		expect(ROUTING_EVAL_SYSTEM_PROMPT).toContain("render_chart");
		const tools = Object.fromEntries(createRoutingEvalTools().map((tool) => [tool.name, tool.description]));
		expect(tools.render_chart).toContain("visualize numbers in chat");
		expect(tools.project_code_edit).toContain("charts");
	});
});
