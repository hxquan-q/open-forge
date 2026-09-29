// Copyright The Open Forge contributors.

/**
 * Repository-level Worktree configuration: `.worktreeconfig.json` plus `.worktreeinclude`.
 *
 * Defaults are deliberately inert — no setup commands, no ignored-file copying. A missing
 * or empty config must never silently install packages or pull local files into a new
 * checkout, so every default that could have a side effect only takes effect once the
 * versioned config says so.
 *
 * Pure functions only: the caller supplies the gitignored file list and ref resolution,
 * so this module is testable without Git and without a real checkout.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WORKTREE_CONFIG_FILE = ".worktreeconfig.json";
export const WORKTREE_INCLUDE_FILE = ".worktreeinclude";

export const DEFAULT_CONFIG = {
	worktreeRoot: "../open-forge-wt",
	baseRef: "main",
	baseRefFallbacks: [],
	setup: {},
	copyIgnored: false,
	cleanup: { intervalHours: 6, maxWorktrees: 25 },
};

/**
 * Committed-by-convention example files. Checked before the deny list, and kept narrow on
 * purpose: only an explicit example suffix qualifies, so `.env.example.production` — which
 * can hold real values — stays denied.
 */
const EXAMPLE_ALLOW = [
	/(?:^|\/)\.env(?:\.[\w-]+)?\.(?:example|sample|template)$/i,
	/(?:^|\/)config\.(?:example|sample|template)\.ya?ml$/i,
];

/**
 * Paths that must never be copied into a worktree even when a pattern matches them.
 * `.worktreeinclude` exists to carry local configuration, not credentials, and a
 * deny list is the only place this can be enforced: the pattern author cannot be
 * trusted to remember, and a mistake here leaks a key into every new checkout.
 */
const SENSITIVE_PATTERNS = [
	/(?:^|\/)\.env(?:\.[\w-]+)*$/i,
	/\.(?:pem|key|p12|pfx|jks|keystore)$/i,
	/(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)[^/]*$/i,
	/(?:^|\/)\.?(?:npmrc|netrc|_netrc|git-credentials)$/i,
	/(?:^|\/)(?:credentials?|secrets?|tokens?)(?:\.|$)/i,
	/(?:^|\/)settings\.local\.json$/i,
	/(?:^|\/)deploy\/config\.[^/]*\.ya?ml$/i,
];

export function isSensitiveIncludePath(path) {
	const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
	if (EXAMPLE_ALLOW.some((pattern) => pattern.test(normalized))) return false;
	return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Glob matcher for the `.worktreeinclude` subset: `**`, `*` and `?`, anchored at the root. */
export function globToRegExp(pattern) {
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === "*") {
			if (pattern[index + 1] === "*") {
				index += 1;
				// `**/` spans directories; a trailing `**` covers everything below.
				if (pattern[index + 1] === "/") {
					index += 1;
					source += "(?:.*/)?";
				} else {
					source += ".*";
				}
				continue;
			}
			source += "[^/]*";
			continue;
		}
		if (char === "?") {
			source += "[^/]";
			continue;
		}
		source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`);
}

export function matchesAny(patterns, path) {
	const normalized = path.replaceAll("\\", "/");
	return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function readJson(path) {
	try {
		return { value: JSON.parse(readFileSync(path, "utf8")), problem: null };
	} catch (error) {
		return { value: null, problem: error instanceof Error ? error.message : String(error) };
	}
}

function validateStringArray(problems, key, value) {
	if (value === undefined) return;
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
		problems.push(`${key} must be an array of non-empty command strings`);
	}
}

/**
 * `{ config, present, problems }`. Problems are reported rather than thrown so `doctor`
 * can list every configuration fault in one run.
 */
export function loadWorktreeConfig(primaryRoot) {
	const path = join(primaryRoot, WORKTREE_CONFIG_FILE);
	const problems = [];

	if (!existsSync(path)) {
		return { config: { ...DEFAULT_CONFIG }, present: false, path, problems };
	}

	const { value, problem } = readJson(path);
	if (problem) {
		return { config: { ...DEFAULT_CONFIG }, present: true, path, problems: [`invalid JSON: ${problem}`] };
	}

	const config = {
		...DEFAULT_CONFIG,
		...value,
		setup: { ...(value.setup ?? {}) },
		cleanup: { ...DEFAULT_CONFIG.cleanup, ...(value.cleanup ?? {}) },
	};

	if (typeof config.worktreeRoot !== "string" || config.worktreeRoot.trim() === "") {
		problems.push("worktreeRoot must be a non-empty string");
	}
	if (typeof config.copyIgnored !== "boolean") problems.push("copyIgnored must be a boolean");
	if (config.baseRef !== "" && typeof config.baseRef !== "string") problems.push("baseRef must be a string");
	if (!Array.isArray(config.baseRefFallbacks) || config.baseRefFallbacks.some((ref) => typeof ref !== "string")) {
		problems.push("baseRefFallbacks must be an array of git refs");
	}
	for (const key of ["windows", "unix", "fallback"]) {
		validateStringArray(problems, `setup.${key}`, config.setup[key]);
	}
	if (typeof config.cleanup.intervalHours !== "number" || config.cleanup.intervalHours <= 0) {
		problems.push("cleanup.intervalHours must be a positive number");
	}
	if (!Number.isInteger(config.cleanup.maxWorktrees) || config.cleanup.maxWorktrees <= 0) {
		problems.push("cleanup.maxWorktrees must be a positive integer");
	}

	return { config, present: true, path, problems };
}

/**
 * Platform-specific setup wins over the generic fallback. An explicitly empty
 * platform list means "run nothing here" and does not fall through.
 */
export function selectSetupCommands(config, platform = process.platform) {
	const setup = config.setup ?? {};
	const key = platform === "win32" ? "windows" : "unix";
	if (Array.isArray(setup[key])) return [...setup[key]];
	if (Array.isArray(setup.fallback)) return [...setup.fallback];
	return [];
}

/** Non-comment, non-empty patterns from `.worktreeinclude`. */
export function parseWorktreeInclude(text) {
	const patterns = [];
	const problems = [];
	for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		if (line.startsWith("!")) {
			problems.push(`negation pattern "${line}" is not supported`);
			continue;
		}
		patterns.push(line.replace(/^\.\//, "").replace(/^\//, ""));
	}
	return { patterns, problems };
}

export function readWorktreeInclude(primaryRoot) {
	const path = join(primaryRoot, WORKTREE_INCLUDE_FILE);
	if (!existsSync(path)) return { patterns: [], problems: [], path, present: false };
	const { patterns, problems } = parseWorktreeInclude(readFileSync(path, "utf8"));
	for (const pattern of patterns) {
		if (isSensitiveIncludePath(pattern)) {
			problems.push(`pattern "${pattern}" targets credentials; .worktreeinclude must not copy secrets`);
		}
	}
	return { patterns, problems, path, present: true };
}

/**
 * Which ignored files to carry into a new worktree: matched by a pattern, ignored by Git
 * (the caller supplies that list), and not on the credentials deny list.
 */
export function selectIncludeFiles({ patterns, ignoredFiles }) {
	const selected = [];
	const skipped = [];
	for (const file of ignoredFiles) {
		if (!matchesAny(patterns, file)) continue;
		if (isSensitiveIncludePath(file)) {
			skipped.push(file);
			continue;
		}
		selected.push(file);
	}
	return { selected: selected.sort(), skipped: skipped.sort() };
}

/**
 * Resolve the baseline: an explicit `--base` wins, then the configured `baseRef`, then the
 * configured fallback list. There is no implicit `HEAD` fallback: when the project pins a
 * base branch, a missing ref must fail closed rather than quietly branching from whichever
 * task worktree happened to invoke the command. `exists` is injected so this stays Git-free.
 */
export function chooseBaseRef({ requested, config, exists }) {
	if (requested) return exists(requested) ? requested : null;
	if (config.baseRef && exists(config.baseRef)) return config.baseRef;
	for (const ref of config.baseRefFallbacks ?? []) {
		if (exists(ref)) return ref;
	}
	return null;
}
