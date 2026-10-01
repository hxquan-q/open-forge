// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkWorkflowSkills, syncWorkflowSkills } from "./workflow-skills.mjs";

const roots = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
	roots.push(root);
	for (const name of ["open-forge-task-intake", "open-forge-testing"]) {
		write(
			root,
			`.agents/skills/${name}/SKILL.md`,
			`---\nname: ${name}\ndescription: Workflow reference\n---\n# Workflow\n[Reference](references/flow.md)\n`,
		);
		write(root, `.agents/skills/${name}/references/flow.md`, "# Reference\n");
	}
	return root;
}
function write(root, path, text) {
	const target = join(root, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, text);
}
afterEach(() => {
	for (const root of roots.splice(0)) {
		// Only directories returned by this test's mkdtemp are removed.
		if (!root.startsWith(join(tmpdir(), "open-forge-workflow-"))) throw new Error("Unexpected fixture path");
		rmSync(root, { recursive: true, force: true });
	}
});
describe("workflow skill delivery", () => {
	it("publishes the confirmed Open Forge names and headings", () => {
		for (const name of ["open-forge-task-intake", "open-forge-testing"]) {
			const skill = readFileSync(new URL(`../../.agents/skills/${name}/SKILL.md`, import.meta.url), "utf8");
			expect(skill.split("\n")).toContain(`name: ${name}`);
			expect(skill).toMatch(/^# Open Forge /m);
			expect(skill).not.toMatch(/OpenVetta|open-vetta/);
		}
	});
	it("detects absent mirrors without writing, then syncs a complete multi-file workflow", () => {
		const root = fixture();
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing mirror")]));
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing mirror")]));
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
		expect(readFileSync(join(root, ".devin/skills/open-forge-task-intake/references/flow.md"), "utf8")).toBe(
			"# Reference\n",
		);
	});
	it("detects drift and restores it from the authoritative source", () => {
		const root = fixture();
		syncWorkflowSkills(root);
		write(root, ".claude/skills/open-forge-testing/SKILL.md", "drift");
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Mirror drift")]));
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
	});
	it("rejects broken relative links, including links from references", () => {
		const root = fixture();
		write(root, ".agents/skills/open-forge-task-intake/references/flow.md", "[Missing](missing.md)\n");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("allows repository references, anchors and external evidence without network access", () => {
		const root = fixture();
		write(root, "project/README.md", "# Project\n");
		write(
			root,
			".agents/skills/open-forge-task-intake/SKILL.md",
			"[Project](../../../project/README.md#project) [Anchor](#here) [Source](https://example.invalid/docs)\n",
		);
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
	});
	it("reports obsolete mirror files instead of silently deleting them", () => {
		const root = fixture();
		syncWorkflowSkills(root);
		write(root, ".claude/skills/open-forge-task-intake/old.md", "keep for inspection");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Unexpected mirror")]));
		expect(readFileSync(join(root, ".claude/skills/open-forge-task-intake/old.md"), "utf8")).toBe(
			"keep for inspection",
		);
	});
	it("supports Claude's shared directory without materializing a second source", () => {
		const root = fixture();
		mkdirSync(join(root, ".claude"));
		symlinkSync(join(root, ".agents/skills"), join(root, ".claude/skills"), "junction");
		const before = readFileSync(join(root, ".agents/skills/open-forge-task-intake/SKILL.md"), "utf8");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
		expect(readFileSync(join(root, ".agents/skills/open-forge-task-intake/SKILL.md"), "utf8")).toBe(before);
	});
	it("finds a sibling link that works in the source but not the Devin mirror", () => {
		const root = fixture();
		write(root, ".agents/skills/open-forge-task-intake/SKILL.md", "[Tests](../open-forge-testing/SKILL.md)\n");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
		write(
			root,
			".agents/skills/open-forge-task-intake/SKILL.md",
			"[Tests](../../../.agents/skills/open-forge-testing/SKILL.md)\n",
		);
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
	});
	it("refuses a mirror redirected outside the workspace before writing", () => {
		const root = fixture();
		const outside = fixture();
		write(outside, "keep.md", "unchanged");
		mkdirSync(join(root, ".devin"));
		symlinkSync(outside, join(root, ".devin/skills"), "junction");
		expect(() => syncWorkflowSkills(root)).toThrow("outside workspace");
		expect(readFileSync(join(outside, "keep.md"), "utf8")).toBe("unchanged");
	});
	it.each([".agents", ".devin"])("reports retired intake copies in %s without deleting them", (directory) => {
		const root = fixture();
		syncWorkflowSkills(root);
		write(root, `${directory}/skills/vetta-task-intake/SKILL.md`, "retired entry");
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Retired skill")]));
		expect(readFileSync(join(root, directory, "skills/vetta-task-intake/SKILL.md"), "utf8")).toBe("retired entry");
	});
	it("fails when authoritative entry points are missing", () => {
		const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
		roots.push(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing source")]));
		expect(() => syncWorkflowSkills(root)).toThrow("Missing source");
	});
});
