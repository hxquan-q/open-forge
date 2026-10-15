/**
 * Arch test for the per-module `## Context Boundary` declarations (TASK-0110).
 *
 * Rules:
 * - every workspace module (plus apps/im-gateway, apps/kotlin, apps/ssh-helper)
 *   must declare `## Context Boundary` in its README.md (or AGENTS.md);
 * - any cross-module import must be listed in `internal_dependencies`;
 * - relative-path escapes out of the module root and `@pkg/src/**` deep links
 *   are always violations, regardless of the whitelist;
 * - docs/architecture/dependents.md is machine-generated and must stay fresh.
 *
 * Usage:
 *   bun run scripts/quality/check-context-boundaries.mjs                 # check only
 *   bun run scripts/quality/check-context-boundaries.mjs --write-dependents
 *   bun run scripts/quality/check-context-boundaries.mjs --apply         # scaffold missing blocks
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	boundaryImportProblems,
	DEPENDENTS_PATH,
	loadModuleBoundary,
	renderDependents,
	scanContextBoundaries,
} from "./context-boundary-lib.mjs";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

const BOUNDARY_SECTION = "## Context Boundary";

function yamlBlock({ purpose, provides = [], consumes = [], internalDependencies = [] }) {
	const list = (values) => (values.length === 0 ? "  []" : `\n${values.map((v) => `  - ${v}`).join("\n")}`);
	return [
		"",
		BOUNDARY_SECTION,
		"",
		"```yaml",
		`purpose: ${purpose}`,
		`provides:${list(provides)}`,
		`consumes:${list(consumes)}`,
		`internal_dependencies:${list(internalDependencies.map((dep) => `"${dep}"`))}`,
		"```",
		"",
	].join("\n");
}

function suggestPurpose(root, moduleDir, name) {
	const pkgJson = join(root, moduleDir, "package.json");
	if (existsSync(pkgJson)) {
		const manifest = JSON.parse(readFileSync(pkgJson, "utf8"));
		if (typeof manifest.description === "string" && manifest.description.trim() !== "") {
			return manifest.description.trim();
		}
	}
	const pluginJson = join(root, moduleDir, "plugin.json");
	if (existsSync(pluginJson)) {
		const manifest = JSON.parse(readFileSync(pluginJson, "utf8"));
		if (typeof manifest.description === "string" && manifest.description.trim() !== "") {
			return manifest.description.trim();
		}
		if (typeof manifest.name === "string" && manifest.name.trim() !== "") {
			return `${manifest.name.trim()} 插件`;
		}
	}
	return `TODO: describe the role of ${name ?? moduleDir}`;
}

function applyScaffolds(root) {
	const { modules, imports } = scanContextBoundaries(root);
	let applied = 0;
	for (const module of modules) {
		const boundary = loadModuleBoundary(root, module.dir);
		if (boundary.file) continue;
		const deps = [...(imports.get(module.dir) ?? new Map()).keys()]
			.filter((target) => modules.some((candidate) => candidate.name === target))
			.sort();
		const block = yamlBlock({
			purpose: suggestPurpose(root, module.dir, module.name),
			internalDependencies: deps,
		});
		const readme = join(root, module.dir, "README.md");
		if (existsSync(readme)) {
			writeFileSync(readme, `${readFileSync(readme, "utf8").replace(/\s*$/, "\n")}\n${block}`, "utf8");
		} else {
			const title = module.name ?? module.dir;
			writeFileSync(readme, `# ${title}\n${block}`, "utf8");
		}
		applied += 1;
		console.log(`[context-boundary] scaffolded ${module.dir}/README.md`);
	}
	ok(`[context-boundary] scaffolded ${applied} module declaration(s)`);
	return 0;
}

function writeDependents(root) {
	const { modules, imports } = scanContextBoundaries(root);
	const output = renderDependents(modules, imports);
	const target = join(root, DEPENDENTS_PATH);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, output, "utf8");
	ok(`[context-boundary] wrote ${DEPENDENTS_PATH}`);
	return 0;
}

export function main(args = process.argv.slice(2), root = repoRoot) {
	if (args.includes("--apply")) return applyScaffolds(root);
	if (args.includes("--write-dependents")) return writeDependents(root);
	if (args.length > 0) {
		console.error(`unknown argument: ${args[0]}`);
		return 1;
	}

	const scanned = scanContextBoundaries(root);
	const { modules, imports } = scanned;
	const problems = boundaryImportProblems(root, scanned);
	const expected = renderDependents(modules, imports);
	const dependentsFile = join(root, DEPENDENTS_PATH);
	if (!existsSync(dependentsFile)) {
		problems.push(`${DEPENDENTS_PATH}: missing; run check-context-boundaries.mjs --write-dependents`);
	} else if (readFileSync(dependentsFile, "utf8").replace(/\r\n/g, "\n") !== expected) {
		problems.push(`${DEPENDENTS_PATH}: stale; run check-context-boundaries.mjs --write-dependents`);
	}

	if (problems.length > 0) {
		fail(`[context-boundary] ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}`);
		return 1;
	}
	ok("[context-boundary] all module declarations and internal_dependencies whitelists are consistent");
	return 0;
}

if (isDirectRun(import.meta.url)) {
	process.exit(main());
}
