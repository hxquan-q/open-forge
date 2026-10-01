// Copyright The Open Forge contributors.
// Canonical workflow skills live in .agents; other harness copies are generated.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isDirectRun, repoRoot } from "./lib.mjs";

const SKILLS = [
	{ name: "vetta-task-intake", mirrors: [".claude", ".devin"] },
	{ name: "vetta-testing", mirrors: [".claude"] },
];
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
	const problems = [];
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
			for (const match of content.toString("utf8").matchAll(/\]\(([^)]+)\)/g)) {
				const link = match[1];
				if (/^(?:https?:|mailto:|#)/.test(link)) continue;
				const path = link.split("#")[0];
				for (const base of [source, ...mirrors.map((mirror) => join(root, mirror, "skills", name))]) {
					if (!existsSync(resolve(dirname(join(base, file)), path)))
						problems.push(`Broken link: ${base}/${file} -> ${link}`);
				}
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
		for (const problem of problems) console.error(`[workflow-skills] ${problem}`);
		if (problems.length) process.exitCode = 1;
		else
			console.log("[workflow-skills] source, mirrors and relative file links passed (not model routing evaluation)");
	} catch (error) {
		console.error(`[workflow-skills] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
