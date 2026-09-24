import { describe, expect, it } from "vitest";
import { firstToolViolates, projectSessionTrace } from "./project-trace.js";

describe("projectSessionTrace", () => {
	it("keeps the first completed tool and ignores start events", () => {
		const trace = projectSessionTrace("给网页加深色模式", "已改网站主题", [
			{ type: "tool_execution_start", toolName: "edit_website_theme", args: { target: "site" } },
			{ type: "tool_execution_end", toolName: "edit_website_theme", args: { target: "site" }, isError: false },
			{ type: "agent_end" },
		]);

		expect(trace.firstToolName).toBe("edit_website_theme");
		expect(trace.toolsCalled).toEqual([{ name: "edit_website_theme", input: { target: "site" }, isError: false }]);
		expect(firstToolViolates(trace, "edit_website_theme", ["vetta_appearance"])).toEqual([]);
	});

	it("reports a wrong first tool and a forbidden later call", () => {
		const trace = projectSessionTrace("给网页加深色模式", "改了 Vetta 外观", [
			{ type: "tool_execution_end", toolName: "vetta_appearance", args: {}, isError: false },
			{ type: "tool_execution_end", toolName: "edit_website_theme", args: {}, isError: false },
		]);

		expect(firstToolViolates(trace, "edit_website_theme", ["vetta_appearance"])).toEqual([
			"first tool was vetta_appearance, expected edit_website_theme",
			"called forbidden tool vetta_appearance",
		]);
	});

	it("treats an empty expected tool as no-tool", () => {
		const ok = projectSessionTrace("12、47、9 这几个值谁最大？", "47 最大", []);
		expect(firstToolViolates(ok, "", ["render_chart"])).toEqual([]);

		const charted = projectSessionTrace("12、47、9 这几个值谁最大？", "见图", [
			{ type: "tool_execution_end", toolName: "render_chart", args: {}, isError: false },
		]);
		expect(firstToolViolates(charted, "", ["render_chart"])).toEqual([
			"first tool was render_chart, expected (none)",
			"called forbidden tool render_chart",
		]);
	});
});
