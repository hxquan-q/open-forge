import { describe, expect, it } from "vitest";
import {
	codingAgentBinaryContentHint,
	isCodingAgentInstructionMarkdown,
} from "../../src/tool-policy/read-tool-policy.js";

describe("Coding Agent read tool policy", () => {
	it("preserves instruction documents without matching near-miss directories", () => {
		expect(isCodingAgentInstructionMarkdown("C:/workspace/SKILL.md")).toBe(true);
		expect(isCodingAgentInstructionMarkdown("C:/workspace/skills/demo/reference.md")).toBe(true);
		expect(isCodingAgentInstructionMarkdown("C:/workspace/skills-preset/reference.md")).toBe(false);
		expect(isCodingAgentInstructionMarkdown("C:/workspace/skills/demo/data.json")).toBe(false);
	});

	it("only names a skill the session can actually invoke", () => {
		expect(codingAgentBinaryContentHint(".doc", { availableSkillNames: new Set(["docx"]) })).toContain(
			'"docx" skill',
		);
	});

	it("never names a skill that is unavailable or unverifiable", () => {
		// 宿主没给出可用技能集（未知）时不得点名，否则模型会去加载不存在的技能并空转（BUG-0025）。
		expect(codingAgentBinaryContentHint(".doc")).not.toContain("docx");
		expect(codingAgentBinaryContentHint(".xlsx", { availableSkillNames: new Set(["docx"]) })).not.toContain("xlsx");
	});

	it("points at an alternative path when no installed skill covers the format", () => {
		const hint = codingAgentBinaryContentHint(".xlsx", { availableSkillNames: new Set() });
		expect(hint).toContain("No installed skill");
		expect(hint).not.toContain("xlsx");
	});

	it("does not fabricate a skill name for unknown extensions", () => {
		const hint = codingAgentBinaryContentHint(".custom", { availableSkillNames: new Set(["xlsx"]) });
		expect(hint).toContain("No matching skill found");
		expect(hint).not.toContain("custom");
	});
});
