import { describe, expect, it } from "vitest";
import { EMPTY_ISOLATION } from "./isolation.js";
import { parseRunCaseArgs, serializeRoutingCase } from "./run-case.js";

describe("run-case CLI contract", () => {
	it("parses --id and --input without treating later flags as values", () => {
		expect(parseRunCaseArgs(["--id", "website-dark-mode", "--input", "给网页加深色模式"])).toEqual({
			id: "website-dark-mode",
			input: "给网页加深色模式",
		});
		expect(parseRunCaseArgs([])).toEqual({});
	});

	it("serializes a shared JSON result for Promptfoo and MASEval", () => {
		const payload = serializeRoutingCase(
			{
				trace: {
					input: "把 Vetta 窗口切成深色",
					actualOutput: "已切换",
					toolsCalled: [{ name: "vetta_appearance", input: {}, isError: false }],
					firstToolName: "vetta_appearance",
				},
				isolation: {
					skillNames: [],
					activeToolNames: ["vetta_appearance"],
				},
				errorMessage: undefined,
			},
			{
				id: "vetta-window-dark",
				input: "把 Vetta 窗口切成深色",
				expectedFirstTool: "vetta_appearance",
				forbiddenTools: ["edit_website_theme"],
				criteria: "window appearance",
			},
		);

		expect(payload).toMatchObject({
			id: "vetta-window-dark",
			firstToolName: "vetta_appearance",
			toolsCalled: ["vetta_appearance"],
			expectedFirstTool: "vetta_appearance",
			firstToolViolations: [],
			errorMessage: null,
		});
		const unmatched = serializeRoutingCase({
			trace: { input: "x", actualOutput: "", toolsCalled: [], firstToolName: undefined },
			isolation: EMPTY_ISOLATION,
			errorMessage: "boom",
		});
		expect(unmatched.id).toBeNull();
		expect(unmatched.errorMessage).toBe("boom");
	});
});
