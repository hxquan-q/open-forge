// Copyright The Open Forge contributors.
import { describe, expect, test } from "vitest";
import { BROWSER_TAB_TOOL_DESCRIPTION } from "../src/features/browser-tab/browser-tab-tool-contract.js";
import { buildSystemPrompt } from "../src/model-context/index.js";

const browserDescriptions = { browser_tab: BROWSER_TAB_TOOL_DESCRIPTION };

describe("browser capability evidence", () => {
	test.each([{ selectedTools: ["browser_tab"] }, { selectedTools: ["browser_tab", "shell", "tool_search"] }])(
		"routes $selectedTools to the in-app page without requiring a command tool",
		({ selectedTools }) => {
			const prompt = buildSystemPrompt({ selectedTools, toolDescriptions: browserDescriptions });
			expect(prompt).toContain("Use the currently callable tools and their results as capability evidence");
			expect(prompt).toContain("MCP index is not an inventory of built-in tools");
			expect(prompt).toContain("Loading a Skill does not register tools or grant permissions");
			expect(prompt).toContain("In-app browser access is available through `browser_tab`");
			expect(prompt).toContain("No shell, CLI installation, or MCP search is needed for this tool");
			expect(prompt).toContain("snapshot before choosing an elementRef");
			expect(prompt).toContain("separate browser session");
			expect(prompt).toContain("not a shell, raw network probe, or arbitrary JavaScript executor");
		},
	);

	test.each([
		{ selectedTools: [] },
		{ selectedTools: ["read"] },
		{ selectedTools: ["shell", "tool_search", "invoke_skill"] },
	])("does not infer browser access from $selectedTools or a loaded skill", ({ selectedTools }) => {
		const prompt = buildSystemPrompt({
			selectedTools,
			toolDescriptions: browserDescriptions,
			skills: [
				{
					name: "browser-use",
					description: "Operate a separate browser",
					type: "skill",
					disableModelInvocation: false,
				},
			],
		});
		expect(prompt).not.toContain("In-app browser access is available through");
	});

	test("preserves capability boundaries in a custom prompt", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "Custom instructions",
			selectedTools: ["browser_tab"],
			toolDescriptions: browserDescriptions,
		});
		expect(prompt).toContain("Custom instructions");
		expect(prompt).toContain("In-app browser access is available through");
	});
});
