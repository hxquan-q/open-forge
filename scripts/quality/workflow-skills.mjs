// Copyright The Open Forge contributors.
// Canonical workflow skills live in .agents; other harness copies are generated.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isDirectRun, repoRoot } from "./lib.mjs";
import { brokenFileLinks } from "./workflow-skill-links.mjs";

const SKILLS = [
	{ name: "open-forge-task-intake", retired: "vetta-task-intake", mirrors: [".devin"] },
	{ name: "open-forge-testing", retired: "vetta-testing", mirrors: [] },
];
export function inspectClaudeAlias(root = repoRoot) {
	const alias = join(root, ".claude/skills");
	const source = join(root, ".agents/skills");
	const help =
		"Enable core.symlinks and Windows Developer Mode, then safely re-checkout .claude/skills; do not overwrite local work";
	if (!existsSync(alias)) return { problems: [`Missing Claude shared entry: ${alias}. ${help}`], notice: null };
	if (statSync(alias).isFile()) {
		if (readFileSync(alias, "utf8").trim() === "../.agents/skills") {
			return {
				problems: [],
				notice: `Claude entry is a Git symlink placeholder; validating .agents directly, Claude path is not ready. ${help}`,
			};
		}
		return { problems: [`Invalid Claude placeholder: ${alias}. ${help}`], notice: null };
	}
	if (!existsSync(source) || realpathSync(alias) !== realpathSync(source)) {
		return { problems: [`Claude shared entry must resolve to .agents/skills: ${alias}. ${help}`], notice: null };
	}
	return { problems: [], notice: null };
}

function inboundProblems(root) {
	const documents = [
		"AGENTS.md",
		...["project", "docs/dev"].flatMap((directory) =>
			filesUnder(join(root, directory))
				.filter((file) => file.endsWith(".md"))
				.map((file) => `${directory}/${file}`),
		),
	];
	return documents
		.filter((file) => existsSync(join(root, file)))
		.flatMap((file) =>
			brokenFileLinks(join(root, file), readFileSync(join(root, file), "utf8"), (link) =>
				/(?:\.agents|\.claude|\.devin)\/skills\/(?:open-forge|vetta)-(?:task-intake|testing)(?:\/|$)/.test(link),
			),
		);
}

function filesUnder(directory, prefix = "") {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const path = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isSymbolicLink()) throw new Error(`Unsupported skill symlink: ${join(directory, entry.name)}`);
			return entry.isDirectory() ? filesUnder(join(directory, entry.name), path) : [path];
		})
		.sort();
}
function sourceRoot(root, name) {
	return join(root, ".agents/skills", name);
}

function checkWriteLocations(root) {
	const workspace = realpathSync(root);
	for (const { name, mirrors } of SKILLS) {
		for (const location of [sourceRoot(root, name), ...mirrors.map((mirror) => join(root, mirror, "skills", name))]) {
			let parent = location;
			while (!existsSync(parent)) parent = dirname(parent);
			const path = relative(workspace, realpathSync(parent));
			if (isAbsolute(path) || path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
				throw new Error(`Skill path outside workspace: ${location}`);
			}
			filesUnder(location);
		}
	}
}

export function checkWorkflowSkills(root = repoRoot) {
	checkWriteLocations(root);
	const problems = [...inspectClaudeAlias(root).problems, ...inboundProblems(root)];
	for (const { retired, mirrors } of SKILLS) {
		for (const directory of [".agents", ...mirrors]) {
			const path = join(root, directory, "skills", retired);
			if (existsSync(path)) problems.push(`Retired skill: ${path}; use the Open Forge entry`);
		}
	}
	for (const { name, mirrors } of SKILLS) {
		const source = sourceRoot(root, name);
		if (!existsSync(join(source, "SKILL.md"))) {
			problems.push(`Missing source: ${name}/SKILL.md`);
			continue;
		}
		const files = filesUnder(source);
		for (const file of files) {
			const content = readFileSync(join(source, file));
			for (const mirror of mirrors) {
				const target = join(root, mirror, "skills", name, file);
				if (!existsSync(target)) problems.push(`Missing mirror: ${mirror}/skills/${name}/${file}`);
				else if (!content.equals(readFileSync(target)))
					problems.push(`Mirror drift: ${mirror}/skills/${name}/${file}`);
			}
			if (!file.endsWith(".md")) continue;
			for (const base of [source, ...mirrors.map((mirror) => join(root, mirror, "skills", name))]) {
				problems.push(...brokenFileLinks(join(base, file), content.toString("utf8")));
			}
		}
		for (const mirror of mirrors) {
			for (const file of filesUnder(join(root, mirror, "skills", name))) {
				if (!files.includes(file)) problems.push(`Unexpected mirror: ${mirror}/skills/${name}/${file}`);
			}
		}
	}
	return problems;
}

export function syncWorkflowSkills(root = repoRoot) {
	checkWriteLocations(root);
	// Check every source before writing any copy; stale copies are reported, never deleted.
	for (const { name } of SKILLS) {
		if (!existsSync(join(sourceRoot(root, name), "SKILL.md"))) throw new Error(`Missing source: ${name}/SKILL.md`);
	}
	const alias = inspectClaudeAlias(root);
	if (alias.problems.length) throw new Error(alias.problems.join("; "));
	for (const { name, mirrors } of SKILLS) {
		const source = sourceRoot(root, name);
		for (const file of filesUnder(source)) {
			for (const mirror of mirrors) {
				const target = join(root, mirror, "skills", name, file);
				if (existsSync(target) && realpathSync(target) === realpathSync(join(source, file))) continue;
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, readFileSync(join(source, file)));
			}
		}
	}
}

if (isDirectRun(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		if (args.some((arg) => arg !== "--write")) throw new Error("Usage: workflow-skills.mjs [--write]");
		if (args.includes("--write")) syncWorkflowSkills();
		const problems = checkWorkflowSkills();
		const { notice } = inspectClaudeAlias();
		if (notice) console.log(`[workflow-skills] ${notice}`);
		for (const problem of problems) console.error(`[workflow-skills] ${problem}`);
		if (problems.length) process.exitCode = 1;
		else
			console.log("[workflow-skills] source, mirrors and relative file links passed (not model routing evaluation)");
	} catch (error) {
		console.error(`[workflow-skills] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
