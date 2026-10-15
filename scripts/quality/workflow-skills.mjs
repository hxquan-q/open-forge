// Copyright The Open Forge contributors.
// Read-only checks for canonical workflow skills and their shared Claude entry.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isDirectRun, repoRoot } from "./lib.mjs";
import { brokenFileLinks } from "./workflow-skill-links.mjs";

const SKILLS = [
	{ name: "open-forge-task-intake", retired: "vetta-task-intake" },
	{ name: "open-forge-testing", retired: "vetta-testing" },
];
export function inspectClaudeAlias(root = repoRoot) {
	const alias = join(root, ".claude/skills");
	const source = join(root, ".agents/skills");
	const help =
		"Enable core.symlinks and Windows Developer Mode, then safely re-checkout .claude/skills; do not overwrite local work";
	if (!existsSync(alias)) return { problems: [`Missing Claude shared entry: ${alias}. ${help}`], notice: null };
	const path = relative(realpathSync(root), realpathSync(alias));
	if (isAbsolute(path) || path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
		return { problems: [`Claude shared entry outside workspace: ${alias}. ${help}`], notice: null };
	}
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

function checkSourceLocations(root) {
	const workspace = realpathSync(root);
	for (const { name } of SKILLS) {
		const location = sourceRoot(root, name);
		let parent = location;
		while (!existsSync(parent)) parent = dirname(parent);
		const path = relative(workspace, realpathSync(parent));
		if (isAbsolute(path) || path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
			throw new Error(`Skill path outside workspace: ${location}`);
		}
		filesUnder(location);
	}
}

export function checkWorkflowSkills(root = repoRoot) {
	checkSourceLocations(root);
	const problems = [...inspectClaudeAlias(root).problems, ...inboundProblems(root)];
	for (const { name, retired } of SKILLS) {
		for (const directory of [".agents", ".devin"]) {
			const path = join(root, directory, "skills", retired);
			if (existsSync(path)) problems.push(`Retired skill: ${path}; use the Open Forge entry`);
		}
		const mirror = join(root, ".devin/skills", name);
		if (existsSync(mirror)) problems.push(`Devin mirror retired: ${mirror}; use .agents/skills`);
		const source = sourceRoot(root, name);
		if (!existsSync(join(source, "SKILL.md"))) {
			problems.push(`Missing source: ${name}/SKILL.md`);
			continue;
		}
		for (const file of filesUnder(source).filter((path) => path.endsWith(".md"))) {
			const target = join(source, file);
			problems.push(...brokenFileLinks(target, readFileSync(target, "utf8")));
		}
	}
	return problems;
}

if (isDirectRun(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		if (args.length) throw new Error("Usage: workflow-skills.mjs (read-only; --write was removed)");
		const problems = checkWorkflowSkills();
		const { notice } = inspectClaudeAlias();
		if (notice) console.log(`[workflow-skills] ${notice}`);
		for (const problem of problems) console.error(`[workflow-skills] ${problem}`);
		if (problems.length) process.exitCode = 1;
		else
			console.log(
				"[workflow-skills] canonical sources, shared entry and relative file links passed (not model routing evaluation)",
			);
	} catch (error) {
		console.error(`[workflow-skills] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
