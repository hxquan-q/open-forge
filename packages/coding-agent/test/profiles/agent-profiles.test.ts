import { describe, expect, it } from "vitest";
import type { AgentConfigurationSelection } from "../../src/agent-configuration/configuration-schema.js";
import { applyAgentProfileDefaults, resolveAgentProfile } from "../../src/profiles/agent-profiles.js";

describe("resolveAgentProfile", () => {
	it("未知/缺省 id 回落 coding，不静默收紧既有会话", () => {
		expect(resolveAgentProfile(undefined).id).toBe("coding");
		expect(resolveAgentProfile("mystery").id).toBe("coding");
		expect(resolveAgentProfile("coding").defaultToolNames).toBeNull();
	});

	it("work Profile 默认不含 Shell 写类工具，但保留读写与文档类", () => {
		const work = resolveAgentProfile("work");
		expect(work.defaultToolNames).not.toContain("bash");
		expect(work.defaultToolNames).not.toContain("shell");
		for (const tool of ["read", "write", "edit", "doc_to_pdf", "kb_write_page"]) {
			expect(work.defaultToolNames).toContain(tool);
		}
	});
});

describe("applyAgentProfileDefaults", () => {
	it("无显式选择时应用 Profile 默认工具子集", () => {
		const selection = applyAgentProfileDefaults(resolveAgentProfile("work"), undefined);
		expect(selection.overrides.tools).toContain("read");
		expect(selection.overrides.tools).not.toContain("bash");
	});

	it("coding Profile 不注入默认子集（保持现状全量）", () => {
		expect(applyAgentProfileDefaults(resolveAgentProfile("coding"), undefined)).toEqual({
			template: null,
			overrides: {},
		});
	});

	it("显式工具选择永远优先（含刻意禁用的空数组）", () => {
		const explicit: AgentConfigurationSelection = {
			template: null,
			overrides: { tools: ["bash"] },
		};
		expect(applyAgentProfileDefaults(resolveAgentProfile("work"), explicit)).toBe(explicit);
		const disabled: AgentConfigurationSelection = { template: null, overrides: { tools: [] } };
		expect(applyAgentProfileDefaults(resolveAgentProfile("work"), disabled)).toBe(disabled);
	});

	it("模板已定工具集合时不覆盖，其余 overrides 保留", () => {
		const withTemplate = applyAgentProfileDefaults(resolveAgentProfile("work"), {
			template: {
				id: "tpl",
				revision: 1,
				name: "tpl",
				configuration: {
					appendSystemPrompt: "",
					skills: null,
					tools: ["read"],
					mcpServers: null,
					plugins: null,
					modelKey: null,
					thinkingLevel: null,
				},
			},
			overrides: { appendSystemPrompt: "keep" },
		});
		expect(withTemplate.overrides.tools).toBeUndefined();
		expect(withTemplate.overrides.appendSystemPrompt).toBe("keep");
	});
});
