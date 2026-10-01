// Copyright The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { collectSkillTargets, findSkillFrontmatterProblems } from "./check-skill-frontmatter.mjs";
import { checkWorkflowSkills, inspectClaudeAlias, syncWorkflowSkills } from "./workflow-skills.mjs";

const roots = [];
function fixture(mode = "link") {
	const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
	roots.push(root);
	write(root, "package.json", JSON.stringify({ workspaces: [] }));
	for (const name of ["open-forge-task-intake", "open-forge-testing"]) {
		write(
			root,
			`.agents/skills/${name}/SKILL.md`,
			`---\nname: ${name}\ndescription: Workflow reference\n---\n# Workflow\n[Reference](references/flow.md)\n`,
		);
		write(root, `.agents/skills/${name}/references/flow.md`, "# Reference\n");
	}
	if (mode === "no-claude") return root;
	mkdirSync(join(root, ".claude"));
	if (mode === "placeholder") write(root, ".claude/skills", "../.agents/skills\n");
	else if (mode === "directory") mkdirSync(join(root, ".claude/skills"));
	else symlinkSync(join(root, ".agents/skills"), join(root, ".claude/skills"), "junction");
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
		write(root, ".devin/skills/open-forge-task-intake/SKILL.md", "drift");
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
		write(root, ".devin/skills/open-forge-task-intake/old.md", "keep for inspection");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Unexpected mirror")]));
		expect(readFileSync(join(root, ".devin/skills/open-forge-task-intake/old.md"), "utf8")).toBe(
			"keep for inspection",
		);
	});
	it("supports Claude's shared directory without materializing a second source", () => {
		const root = fixture();
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
	it("handles Git's symlink placeholder without replacing it or creating children", () => {
		const root = fixture("placeholder");
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
		expect(readFileSync(join(root, ".claude/skills"), "utf8")).toBe("../.agents/skills\n");
		expect(inspectClaudeAlias(root).notice).toContain("core.symlinks");
	});
	it("reports placeholder remediation through the public CLI without changing it", () => {
		const root = fixture("placeholder");
		const result = spawnSync(
			process.execPath,
			[fileURLToPath(new URL("./workflow-skills.mjs", import.meta.url)), "--write"],
			{ cwd: root, encoding: "utf8" },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("core.symlinks");
		expect(result.stdout).toContain("Claude path is not ready");
		expect(readFileSync(join(root, ".claude/skills"), "utf8")).toBe("../.agents/skills\n");
	});
	it("rejects a Claude placeholder reached through a parent outside the workspace", () => {
		const root = fixture("no-claude");
		const outside = fixture("no-claude");
		write(outside, "skills", "../.agents/skills");
		symlinkSync(outside, join(root, ".claude"), "junction");
		expect(inspectClaudeAlias(root).problems).toEqual(
			expect.arrayContaining([expect.stringContaining("outside workspace")]),
		);
		expect(() => syncWorkflowSkills(root)).toThrow("outside workspace");
	});
	it("rejects a malformed placeholder with an actionable error", () => {
		const root = fixture("placeholder");
		write(root, ".claude/skills", "../somewhere-else");
		expect(checkWorkflowSkills(root)).toEqual(
			expect.arrayContaining([expect.stringContaining("Invalid Claude placeholder")]),
		);
		expect(() => syncWorkflowSkills(root)).toThrow("core.symlinks");
	});
	it("rejects an unrelated Claude directory instead of treating it as a mirror", () => {
		const root = fixture("directory");
		expect(() => syncWorkflowSkills(root)).toThrow("Claude");
	});
	it("checks inbound references from project rules", () => {
		const root = fixture();
		syncWorkflowSkills(root);
		write(root, "AGENTS.md", '[Delivery](.agents/skills/open-forge-task-intake/references/missing.md "Delivery")\n');
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("ignores code examples and accepts a link title", () => {
		const root = fixture();
		write(
			root,
			".agents/skills/open-forge-task-intake/SKILL.md",
			'[Flow](references/flow.md "Flow")\n`[Missing](no.md)`\n```md\n[Missing](no.md)\n```\n',
		);
		syncWorkflowSkills(root);
		expect(checkWorkflowSkills(root)).toEqual([]);
	});
	it("includes canonical and Devin frontmatter in full discovery with a Claude placeholder", () => {
		const root = fixture("placeholder");
		syncWorkflowSkills(root);
		write(root, ".agents/skills/open-forge-testing/SKILL.md", "---\nname: broken\n---\n");
		write(root, ".devin/skills/open-forge-task-intake/SKILL.md", "---\nname: broken\n---\n");
		const files = collectSkillTargets(root);
		expect(files).toContain(join(root, ".agents/skills/open-forge-testing/SKILL.md"));
		expect(files).toContain(join(root, ".devin/skills/open-forge-task-intake/SKILL.md"));
		expect(files.filter((file) => findSkillFrontmatterProblems(readFileSync(file, "utf8")).length)).toHaveLength(2);
	});
	it("fails when authoritative entry points are missing", () => {
		const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
		roots.push(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing source")]));
		expect(() => syncWorkflowSkills(root)).toThrow("Missing source");
	});
});
