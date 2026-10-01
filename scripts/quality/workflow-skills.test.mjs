// Copyright The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { collectSkillTargets, findSkillFrontmatterProblems } from "./check-skill-frontmatter.mjs";
import { checkWorkflowSkills, inspectClaudeAlias } from "./workflow-skills.mjs";

const roots = [];
const names = ["open-forge-task-intake", "open-forge-testing"];
function write(root, path, text) {
	const target = join(root, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, text);
}
function fixture(mode = "link") {
	const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
	roots.push(root);
	write(root, "package.json", JSON.stringify({ workspaces: [] }));
	for (const name of names) {
		write(
			root,
			`.agents/skills/${name}/SKILL.md`,
			`---\nname: ${name}\ndescription: Workflow reference\n---\n# Open Forge workflow\n[Reference](references/flow.md)\n`,
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
function cli(root, ...args) {
	return spawnSync(process.execPath, [fileURLToPath(new URL("./workflow-skills.mjs", import.meta.url)), ...args], {
		cwd: root,
		encoding: "utf8",
	});
}
afterEach(() => {
	for (const root of roots.splice(0)) {
		if (!root.startsWith(join(tmpdir(), "open-forge-workflow-"))) throw new Error("Unexpected fixture path");
		rmSync(root, { recursive: true, force: true });
	}
});
describe("single-source workflow skill delivery", () => {
	it("publishes the confirmed Open Forge names and headings", () => {
		for (const name of names) {
			const skill = readFileSync(new URL(`../../.agents/skills/${name}/SKILL.md`, import.meta.url), "utf8");
			expect(skill.split("\n")).toContain(`name: ${name}`);
			expect(skill).toMatch(/^# Open Forge /m);
			expect(skill).not.toMatch(/OpenVetta|open-vetta/);
		}
	});
	it("checks the real repository without a Devin mirror", () => {
		expect(existsSync(new URL("../../.devin/skills/open-forge-task-intake", import.meta.url))).toBe(false);
		expect(checkWorkflowSkills()).toEqual([]);
	});
	it("checks canonical files and their Claude alias without creating copies", () => {
		const root = fixture();
		const before = readFileSync(join(root, ".agents/skills/open-forge-testing/SKILL.md"), "utf8");
		expect(checkWorkflowSkills(root)).toEqual([]);
		const result = cli(root);
		expect(result.status, result.stderr).toBe(0);
		expect(existsSync(join(root, ".devin"))).toBe(false);
		expect(readFileSync(join(root, ".agents/skills/open-forge-testing/SKILL.md"), "utf8")).toBe(before);
	});
	it("rejects the removed write command without creating a mirror", () => {
		const root = fixture();
		const result = cli(root, "--write");
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("read-only");
		expect(existsSync(join(root, ".devin"))).toBe(false);
	});
	it("detects broken outgoing references", () => {
		const root = fixture();
		write(root, ".agents/skills/open-forge-task-intake/references/flow.md", "[Missing](missing.md)\n");
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("detects inbound workflow references in project rules", () => {
		const root = fixture();
		write(root, "AGENTS.md", '[Delivery](.agents/skills/open-forge-task-intake/references/missing.md "Delivery")\n');
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("ignores code examples and external evidence while accepting link titles", () => {
		const root = fixture();
		write(
			root,
			".agents/skills/open-forge-task-intake/SKILL.md",
			'[Flow](references/flow.md "Flow") [Source](https://example.invalid) [Anchor](#here)\n`[Missing](no.md)`\n```md\n[Missing](no.md)\n```\n',
		);
		expect(checkWorkflowSkills(root)).toEqual([]);
	});
	it.each(names)("rejects a reintroduced Devin copy of %s without deleting it", (name) => {
		const root = fixture();
		write(root, `.devin/skills/${name}/SKILL.md`, "keep for inspection");
		expect(checkWorkflowSkills(root)).toEqual(
			expect.arrayContaining([expect.stringContaining("Devin mirror retired")]),
		);
		expect(readFileSync(join(root, `.devin/skills/${name}/SKILL.md`), "utf8")).toBe("keep for inspection");
	});
	it.each([".agents", ".devin"])("rejects retired names in %s", (directory) => {
		const root = fixture();
		write(root, `${directory}/skills/vetta-task-intake/SKILL.md`, "retired");
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Retired skill")]));
	});
	it("reports Git placeholders via the read-only CLI without changing them", () => {
		const root = fixture("placeholder");
		const result = cli(root);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("core.symlinks");
		expect(result.stdout).toContain("Claude path is not ready");
		expect(readFileSync(join(root, ".claude/skills"), "utf8")).toBe("../.agents/skills\n");
		expect(existsSync(join(root, ".devin"))).toBe(false);
	});
	it("rejects malformed Claude placeholders", () => {
		const root = fixture("placeholder");
		write(root, ".claude/skills", "../elsewhere");
		expect(checkWorkflowSkills(root)).toEqual(
			expect.arrayContaining([expect.stringContaining("Invalid Claude placeholder")]),
		);
	});
	it("rejects unrelated Claude directories", () => {
		const root = fixture("directory");
		expect(checkWorkflowSkills(root)).toEqual(
			expect.arrayContaining([expect.stringContaining("Claude shared entry must resolve")]),
		);
	});
	it("rejects a Claude entry reached through a parent outside the workspace", () => {
		const root = fixture("no-claude");
		const outside = fixture("no-claude");
		write(outside, "skills", "../.agents/skills");
		symlinkSync(outside, join(root, ".claude"), "junction");
		expect(inspectClaudeAlias(root).problems).toEqual(
			expect.arrayContaining([expect.stringContaining("outside workspace")]),
		);
	});
	it("still scans project frontmatter independently of the Claude link", () => {
		const root = fixture("placeholder");
		write(root, ".agents/skills/open-forge-testing/SKILL.md", "---\nname: broken\n---\n");
		write(root, ".devin/skills/other/SKILL.md", "---\nname: broken\n---\n");
		const files = collectSkillTargets(root);
		expect(files.filter((file) => findSkillFrontmatterProblems(readFileSync(file, "utf8")).length)).toHaveLength(2);
	});
	it("reports missing canonical entries without creating files", () => {
		const root = mkdtempSync(join(tmpdir(), "open-forge-workflow-"));
		roots.push(root);
		expect(checkWorkflowSkills(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing source")]));
	});
});
