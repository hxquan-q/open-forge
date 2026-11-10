// Modified by The Open Forge contributors.
import type { SkillInfo } from "@preload/api";
import { describe, expect, it } from "vitest";
import { prepareSkillsForSurface } from "./useSkillList";

const skills: SkillInfo[] = [
	{ name: "work-only", description: "", source: "builtin", type: "skill", workspaceMode: "work" },
	{ name: "code-only", description: "", source: "builtin", type: "skill", workspaceMode: "coding" },
	{ name: "shared", description: "", source: "builtin", type: "skill" },
];

describe("prepareSkillsForSurface workspace mode", () => {
	it("filters explicit modes while keeping untagged skills visible", () => {
		expect(prepareSkillsForSurface(skills, "commandPalette", "work").map((skill) => skill.name)).toEqual([
			"work-only",
			"shared",
		]);
		expect(prepareSkillsForSurface(skills, "commandPalette", "coding").map((skill) => skill.name)).toEqual([
			"code-only",
			"shared",
		]);
	});

	it("does not mode-filter other skill surfaces", () => {
		expect(prepareSkillsForSurface(skills, "skillPicker", "work").map((skill) => skill.name)).toEqual([
			"work-only",
			"code-only",
			"shared",
		]);
	});
});
