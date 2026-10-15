// Copyright The Open Forge contributors.
import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "../src/model-context/index.js";

describe("command capability guidance", () => {
	test.each(["shell", "bash"])("routes command tasks through the available %s tool", (commandTool) => {
		const prompt = buildSystemPrompt({ selectedTools: ["read", commandTool, "tool_search"], mcpDeferred: true });
		expect(prompt).toContain(`Command execution is available through \`${commandTool}\``);
		expect(prompt).toContain("ping and ssh are command-line programs, not separate tools");
		expect(prompt).toContain("MCP search results do not determine whether built-in tools are available");
		expect(prompt).toContain("do not bypass approval, sandbox, or network restrictions");
		expect(prompt).toContain("does not prove that a program is installed or a host is reachable");
	});

	test.each([{ selectedTools: [] }, { selectedTools: ["read"] }, { selectedTools: ["read", "tool_search"] }])(
		"does not advertise command access for $selectedTools",
		({ selectedTools }) => {
			const prompt = buildSystemPrompt({ selectedTools });
			expect(prompt).not.toContain("Command execution is available through");
		},
	);

	test("keeps the command guidance with a custom prompt and without MCP", () => {
		const prompt = buildSystemPrompt({ customPrompt: "Custom assistant", selectedTools: ["shell"] });
		expect(prompt).toContain("Command execution is available through `shell`");
		expect(prompt).toContain("Custom assistant");
	});
});
