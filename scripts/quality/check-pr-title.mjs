/**
 * Validate a PR title against `<type>(<scope>): <description>` (TASK-0114).
 *
 * Scopes are derived from workspace package dirs (basename of each
 * `package.json#workspaces` entry) plus a fixed set of non-package domains.
 * The workflow in `.github/workflows/pr-title.yml` runs this on every PR
 * title change; commit messages are intentionally not gated here.
 *
 * Usage:
 *   bun run scripts/quality/check-pr-title.mjs -- "<title>"
 *   node scripts/quality/check-pr-title.mjs "<title>"
 */

import { discoverWorkspacePackages, fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

const ALLOWED_TYPES = new Set([
	"feat",
	"fix",
	"docs",
	"style",
	"refactor",
	"perf",
	"test",
	"build",
	"ci",
	"chore",
	"revert",
	"i18n",
	"merge",
]);

// Non-package domains with established usage; package-scoped changes should
// use the owning workspace dir name instead of these.
const EXTRA_SCOPES = [
	"ci",
	"claude",
	"deps",
	"docs",
	"exprot",
	"i18n",
	"mcp",
	"plugins",
	"project",
	"quality",
	"release",
	"release-notes",
	"runtime",
	"test",
	"workflow",
];

const TITLE_PATTERN = /^([a-z]+)\(([^()\s]+)\): \S/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function collectPrTitleScopes(root = repoRoot) {
	const scopes = new Set(EXTRA_SCOPES);
	for (const pkg of discoverWorkspacePackages(root)) {
		const basename = pkg.dir.split("/").at(-1);
		if (basename) scopes.add(basename);
	}
	return scopes;
}

export function validatePrTitle(title, scopes = collectPrTitleScopes()) {
	const problems = [];
	if (typeof title !== "string" || title.trim() === "") {
		return ["title is empty"];
	}
	const match = title.trim().match(TITLE_PATTERN);
	if (!match) {
		return ["title must match `<type>(<scope>): <description>` — e.g. `feat(desktop): add canvas batch save`"];
	}
	const [, type, scopeText] = match;
	if (!ALLOWED_TYPES.has(type)) {
		problems.push(`type "${type}" is not allowed (allowed: ${[...ALLOWED_TYPES].join(", ")})`);
	}
	const parts = scopeText.split(",").map((part) => part.trim());
	for (const part of parts) {
		if (!SCOPE_PATTERN.test(part)) {
			problems.push(`scope "${part}" must be lowercase kebab-case`);
			continue;
		}
		if (!scopes.has(part)) {
			problems.push(`scope "${part}" is not a workspace package or known domain`);
		}
	}
	return problems;
}

export function main(args = process.argv.slice(2), root = repoRoot) {
	const title = args
		.filter((arg) => arg !== "--")
		.join(" ")
		.trim();
	const problems = validatePrTitle(title, collectPrTitleScopes(root));
	if (problems.length > 0) {
		fail(`[pr-title] invalid PR title ${JSON.stringify(title)}\n${problems.map((p) => `  - ${p}`).join("\n")}`);
		return 1;
	}
	ok(`[pr-title] valid: ${title}`);
	return 0;
}

if (isDirectRun(import.meta.url)) {
	process.exit(main());
}
