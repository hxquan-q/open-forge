/**
 * Shared logic for the per-module `## Context Boundary` contract (TASK-0110).
 *
 * Each module declares its boundary in its own README.md (AGENTS.md only when
 * no README exists) as a fenced yaml block under a `## Context Boundary`
 * heading:
 *
 *   ## Context Boundary
 *   ```yaml
 *   purpose: 一句话职责
 *   provides: [公开入口或对外合同]
 *   consumes: [依赖的对外合同]
 *   internal_dependencies: ["@vetta/runtime-core"]
 *   ```
 *
 * `internal_dependencies` is the whitelist of workspace package names this
 * module is allowed to import. The guard scans real import specifiers and
 * fails on any cross-module import that is not declared. Relative-path
 * escapes out of the module root and `@pkg/src/**` deep links are always
 * violations — the whitelist never rescues them.
 *
 * Keep this file dependency-free (Node/Bun built-ins only).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectImportSpecifiers } from "./check-package-boundaries.mjs";
import { discoverWorkspacePackages, toPosix, walkFiles } from "./lib.mjs";

/** Non-workspace deliverables (Go/Kotlin) still carry a declaration block. */
export const EXTRA_MODULE_DIRS = ["apps/im-gateway", "apps/kotlin", "apps/ssh-helper"];

export const DEPENDENTS_PATH = "docs/architecture/dependents.md";

const BOUNDARY_HEADING = /(?:^|\n)##[ \t]+Context Boundary[ \t]*\n/;
const DECLARATION_FILES = ["README.md", "AGENTS.md"];
const LIST_KEYS = new Set(["provides", "consumes", "internal_dependencies"]);
const KNOWN_KEYS = new Set(["purpose", ...LIST_KEYS]);

export function discoverModules(root) {
	const modules = discoverWorkspacePackages(root).map((pkg) => ({
		key: pkg.key,
		dir: pkg.dir,
		name: pkg.name,
	}));
	for (const dir of EXTRA_MODULE_DIRS) {
		if (existsSync(join(root, dir))) {
			modules.push({ key: dir, dir, name: null });
		}
	}
	// Longest directory first: nested workspaces (presets, examples) win over parents.
	return modules.sort((left, right) => right.dir.length - left.dir.length);
}

/** Parse the strict yaml subset allowed inside a Context Boundary fence. */
export function parseBoundaryYaml(yamlText) {
	const fields = {};
	let currentKey = null;
	for (const rawLine of yamlText.split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item) {
			if (!currentKey || !LIST_KEYS.has(currentKey)) {
				return { fields: null, error: `list item outside a list key: ${trimmed}` };
			}
			const value = unquote(item[1].trim());
			if (value === "") return { fields: null, error: `empty list item under ${currentKey}` };
			fields[currentKey].push(value);
			continue;
		}
		const pair = line.match(/^([A-Za-z_]+):[ \t]*(.*)$/);
		if (!pair || line.startsWith(" ") || line.startsWith("\t")) {
			return { fields: null, error: `unparseable line: ${trimmed}` };
		}
		const [, key, rawValue] = pair;
		if (!KNOWN_KEYS.has(key)) return { fields: null, error: `unknown key: ${key}` };
		currentKey = key;
		if (LIST_KEYS.has(key)) {
			const inline = rawValue.trim();
			if (inline === "") {
				fields[key] = [];
			} else if (inline.startsWith("[") && inline.endsWith("]")) {
				const inner = inline.slice(1, -1).trim();
				fields[key] = inner === "" ? [] : inner.split(",").map((part) => unquote(part.trim()));
			} else {
				return { fields: null, error: `${key} must be a list ([] or dash items)` };
			}
		} else {
			fields[key] = unquote(rawValue.trim());
		}
	}
	return { fields, error: null };
}

function unquote(value) {
	const match = value.match(/^(["'])(.*)\1$/);
	return match ? match[2] : value;
}

/** Locate the `## Context Boundary` fenced block inside a markdown document. */
export function extractBoundaryFromMarkdown(text) {
	const heading = BOUNDARY_HEADING.exec(text);
	if (!heading) return { found: false };
	const after = text.slice(heading.index + heading[0].length);
	const fence = after.match(/^```ya?ml[ \t]*\n([\s\S]*?)```/m);
	if (!fence) {
		return { found: true, fields: null, error: "Context Boundary section must contain a ```yaml fenced block" };
	}
	const { fields, error } = parseBoundaryYaml(fence[1]);
	return { found: true, fields, error };
}

function validateBoundaryFields(fields, label) {
	const problems = [];
	if (typeof fields.purpose !== "string" || fields.purpose.trim() === "") {
		problems.push(`${label}: purpose must be a non-empty string`);
	}
	for (const key of LIST_KEYS) {
		if (!Array.isArray(fields[key])) {
			problems.push(`${label}: ${key} must be present (use [] when empty)`);
		}
	}
	for (const key of LIST_KEYS) {
		if (!Array.isArray(fields[key])) continue;
		const seen = new Set();
		for (const value of fields[key]) {
			if (typeof value !== "string" || value === "") {
				problems.push(`${label}: ${key} contains an empty entry`);
				continue;
			}
			if (seen.has(value)) problems.push(`${label}: ${key} duplicates ${value}`);
			seen.add(value);
		}
	}
	return problems;
}

/** Load a module's declaration: README.md wins, AGENTS.md is the fallback. */
export function loadModuleBoundary(root, moduleDir) {
	const present = DECLARATION_FILES.filter((file) => existsSync(join(root, moduleDir, file)));
	const withBlocks = [];
	for (const file of present) {
		const text = readFileSync(join(root, moduleDir, file), "utf8");
		const extracted = extractBoundaryFromMarkdown(text);
		if (extracted.found) withBlocks.push({ file, ...extracted });
	}
	if (withBlocks.length > 1) {
		return {
			file: null,
			fields: null,
			problems: [`${moduleDir}: Context Boundary declared in both ${withBlocks.map((b) => b.file).join(" and ")}`],
		};
	}
	if (withBlocks.length === 0) {
		return {
			file: null,
			fields: null,
			problems:
				present.length === 0
					? [`${moduleDir}: missing README.md with a ## Context Boundary yaml block`]
					: [`${moduleDir}: ${present.join("/")} has no ## Context Boundary yaml block`],
		};
	}
	const block = withBlocks[0];
	const problems = [];
	if (block.error) problems.push(`${moduleDir}/${block.file}: ${block.error}`);
	if (block.fields) problems.push(...validateBoundaryFields(block.fields, `${moduleDir}/${block.file}`));
	return { file: block.file, fields: block.fields, problems };
}

/** The module dir that owns a repo-relative posix path, or null. */
export function moduleDirForPath(modules, posixPath) {
	for (const module of modules) {
		if (posixPath === module.dir || posixPath.startsWith(`${module.dir}/`)) return module.dir;
	}
	return null;
}

function packageNameIndex(modules) {
	const index = new Map();
	for (const module of modules) {
		if (module.name) index.set(module.name, module.dir);
	}
	return index;
}

/** Files owned by a module: inside its dir but not inside a nested module dir. */
export function moduleSourceFiles(root, modules, moduleDir) {
	return walkFiles(join(root, moduleDir))
		.map((file) => toPosix(file.slice(root.length + 1)))
		.filter((posix) => moduleDirForPath(modules, posix) === moduleDir);
}

/**
 * Resolve an import specifier to a cross-module dependency.
 * Returns { kind: 'package'|'relative-escape'|'src-deep-link', target } or null.
 */
export function resolveSpecifier(root, modules, specifier, filePosixPath) {
	const names = packageNameIndex(modules);
	if (specifier.startsWith(".")) {
		const resolved = toPosix(resolve(join(root, dirname(filePosixPath)), specifier));
		const rootPosix = toPosix(root);
		const rel = resolved.startsWith(`${rootPosix}/`) ? resolved.slice(rootPosix.length + 1) : resolved;
		const ownDir = moduleDirForPath(modules, filePosixPath);
		if (ownDir !== null && rel.startsWith(`${ownDir}/`)) return null;
		const targetDir = moduleDirForPath(modules, rel);
		return { kind: "relative-escape", target: targetDir ?? rel };
	}
	for (const [name, dir] of names) {
		if (specifier === name) {
			return dir === moduleDirForPath(modules, filePosixPath) ? null : { kind: "package", target: name };
		}
		if (specifier.startsWith(`${name}/`)) {
			if (dir === moduleDirForPath(modules, filePosixPath)) return null;
			const subpath = specifier.slice(name.length + 1);
			if (subpath === "src" || subpath.startsWith("src/")) {
				return { kind: "src-deep-link", target: name };
			}
			return { kind: "package", target: name };
		}
	}
	return null;
}

/**
 * Scan every module's source files.
 * Returns { modules, boundaries, imports, problems } where imports maps
 * moduleDir → Map(target → [{ file, specifier, kind }]).
 */
export function scanContextBoundaries(root) {
	const modules = discoverModules(root);
	const boundaries = new Map();
	const imports = new Map();
	const problems = [];

	for (const module of modules) {
		const boundary = loadModuleBoundary(root, module.dir);
		boundaries.set(module.dir, boundary);
		problems.push(...boundary.problems);

		const seen = new Map();
		for (const file of moduleSourceFiles(root, modules, module.dir)) {
			const text = readFileSync(join(root, file), "utf8");
			for (const specifier of collectImportSpecifiers(file, text)) {
				const resolved = resolveSpecifier(root, modules, specifier, file);
				if (!resolved) continue;
				if (!seen.has(resolved.target)) seen.set(resolved.target, []);
				seen.get(resolved.target).push({ file, specifier, kind: resolved.kind });
			}
		}
		imports.set(module.dir, seen);
	}
	return { modules, boundaries, imports, problems };
}

/** Contract violations: undeclared imports, relative escapes, src deep links. */
export function boundaryImportProblems(root, scanned = scanContextBoundaries(root)) {
	const { modules, boundaries, imports, problems } = scanned;
	const validNames = new Set(modules.map((module) => module.name).filter(Boolean));
	for (const [moduleDir, boundary] of boundaries) {
		for (const dep of boundary.fields?.internal_dependencies ?? []) {
			if (!validNames.has(dep)) {
				problems.push(`${moduleDir}: internal_dependencies entry ${dep} is not a workspace package name`);
			}
		}
	}
	const isTestFile = (file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes("/test/");
	for (const [moduleDir, targets] of imports) {
		const declared = new Set(boundaries.get(moduleDir)?.fields?.internal_dependencies ?? []);
		for (const [target, uses] of [...targets.entries()].sort()) {
			for (const use of uses) {
				if (use.kind === "relative-escape") {
					const targetModule = modules.find((module) => module.dir === target);
					const declaredTarget = targetModule?.name && declared.has(targetModule.name);
					// Test files may reach into a declared dependency's tree (existing
					// test-coupling pattern); production code never may.
					if (!(isTestFile(use.file) && declaredTarget)) {
						problems.push(`${use.file}: relative import ${use.specifier} escapes the module root into ${target}`);
					}
				} else if (use.kind === "src-deep-link") {
					problems.push(
						`${use.file}: deep link ${use.specifier} bypasses ${target} exports; use a declared subpath export`,
					);
				} else if (!declared.has(target)) {
					problems.push(
						`${use.file}: ${use.specifier} imports ${target}, which is not in ${moduleDir} internal_dependencies`,
					);
				}
			}
		}
	}
	return problems;
}

/** Render the machine-generated reverse view (dependents.md). */
export function renderDependents(modules, imports) {
	const byDir = new Map(modules.map((module) => [module.dir, module]));
	const dependents = new Map(modules.map((module) => [module.dir, new Set()]));
	for (const [moduleDir, targets] of imports) {
		for (const [target] of targets) {
			const targetModule = modules.find((module) => module.name === target || module.dir === target);
			if (!targetModule || targetModule.dir === moduleDir) continue;
			dependents.get(targetModule.dir)?.add(moduleDir);
		}
	}
	const lines = [
		"<!-- Machine-generated by `bun run scripts/quality/check-context-boundaries.mjs --write-dependents`. Do not edit by hand. -->",
		"# 模块反向依赖视图（dependents）",
		"",
		"每行列出一个模块以及**声明或实际依赖它的内部模块**。事实源是各模块 README 的 `## Context Boundary` 声明与 `internal_dependencies` 白名单的扫描结果。",
		"",
		"| 模块 | 依赖它的模块 |",
		"| --- | --- |",
	];
	for (const module of [...modules].sort((a, b) => a.dir.localeCompare(b.dir))) {
		const who = [...(dependents.get(module.dir) ?? [])]
			.map((dir) => `\`${byDir.get(dir)?.name ?? dir}\``)
			.sort()
			.join("<br>");
		lines.push(`| \`${module.name ?? module.dir}\` | ${who || "—"} |`);
	}
	lines.push("");
	return lines.join("\n");
}
