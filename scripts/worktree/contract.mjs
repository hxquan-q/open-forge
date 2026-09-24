// Copyright The Open Forge contributors.

/**
 * The Task ↔ Worktree development contract, as executable checks.
 *
 * `project/collaboration/README.md` defines the contract in prose and
 * `project/tasks/templates/task.md` carries the fields. This module is the single
 * source of truth for what those fields must contain, shared by:
 *
 *   - `scripts/quality/check-task-worktrees.mjs` — hermetic structural guard (no Git),
 *     runs inside `bun run check` on every checkout;
 *   - `scripts/worktree/cli.mjs` — the coordinator-facing `check` / `doctor` commands,
 *     which add cross-task scope conflicts and drift against the real Git state.
 *
 * Findings carry a level:
 *
 *   - `error`   — a contradiction or a malformed value: the entry cannot be interpreted as
 *                 written, so every consumer would misread it. The guard fails on these.
 *   - `warn`    — enumeration drift, an unresolved cross-module reference, or a per-machine
 *                 portability issue. Actionable, but fixing it is its owner's call, so the
 *                 guard reports it without failing unrelated `check` runs. `cli.mjs check`
 *                 escalates warnings to failures once a coordinator asks for a gate.
 *
 * Cross-task scope overlap is a static contract when both active tasks declare parallel
 * Worktrees: the quality guard fails on unrecorded overlaps, and `conflicts_with` acknowledges
 * the scheduling relationship. Whether the declared worktrees exist on this machine remains
 * separate Git state owned by the coordinator CLI.
 *
 * Everything here is pure: callers inject `knownIds`, `primaryRoot` and the task list, so
 * tests never depend on the ambient repository or on Git being present.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { asList, asText, firstToken, parseFrontmatter } from "./frontmatter.mjs";

/** Statuses whose scope claims are still live. */
export const ACTIVE_STATUSES = new Set(["draft", "ready", "in_progress", "blocked", "verifying"]);
export const ALL_STATUSES = new Set([...ACTIVE_STATUSES, "done", "archived"]);
export const EXECUTIONS = new Set(["parallel", "serial", "coordination-only"]);
export const INTEGRATION_STATUSES = new Set(["pending", "reviewing", "integrated", "rejected"]);
export const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);

/** A `depends_on` entry may name this task tree or another `project/` module. */
export const CROSS_MODULE_ID_PATTERN = /^(?:TASK|ISSUE|BUG|REQ|PLAN|VERIFY|RESEARCH)-\d{4}$/;

/**
 * Values that mean "this task has no separate worktree". `execution: parallel` records
 * that a task *may* be split off, which is why most tasks carry a placeholder here.
 */
const WORKTREE_PLACEHOLDER = /^(?:unassigned|main-workspace|none|n\/a|-)$/i;

/** A branch field naming an integration branch means "no task branch". */
const INTEGRATION_BRANCH = /^(?:unassigned|none|n\/a|-|forge\/dev|dev|main|master)$/i;

export const TASK_ID_PATTERN = /^TASK-\d{4}$/;
export const TASK_BRANCH_PATTERN = /^task\/TASK-\d{4}-[a-z0-9][a-z0-9-]*$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TASK_FILE_PATTERN = /^(TASK-\d{4})-[a-z0-9][a-z0-9-]*\.md$/;

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const UNC_ABSOLUTE = /^\\\\/;
const GLOB_CHARS = /[*?[\]]/;

const error = (message) => ({ level: "error", message });
const warn = (message) => ({ level: "warn", message });

/** Separator-flipped, trailing-slash-free form used for every path comparison. */
function toComparable(value) {
	return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function isAbsoluteContractPath(raw) {
	return WINDOWS_ABSOLUTE.test(raw) || UNC_ABSOLUTE.test(raw) || raw.startsWith("/");
}

/**
 * The static leading segments of a scope claim, up to the first glob segment.
 * `packages/ai/src` → `packages/ai/src`; `packages/**\/package.json` → `packages`;
 * `**\/package.json` → `` (matches anywhere).
 */
export function scopePrefix(path) {
	const segments = toComparable(path).split("/");
	const staticSegments = [];
	for (const segment of segments) {
		if (segment === ".") continue;
		if (GLOB_CHARS.test(segment)) break;
		staticSegments.push(segment);
	}
	return staticSegments.join("/");
}

/**
 * Validate one repository path from `read_paths` / `write_paths` / `exclusive_paths`.
 * Globs are allowed — a task that touches every package manifest legitimately writes
 * `packages/**\/package.json` — and are compared conservatively by `pathsOverlap`.
 * Returns `{ path }` or `{ problem }`; never throws, so one bad entry cannot hide the rest.
 */
export function normalizeContractPath(raw) {
	const value = (raw ?? "").trim();
	if (value === "") return { problem: "path entry is empty" };
	if (isAbsoluteContractPath(value)) return { problem: `path must be repository-relative, got absolute "${value}"` };
	const normalized = toComparable(value);
	if (normalized === "" || normalized === ".") return { problem: `path "${value}" resolves to the repository root` };
	const segments = normalized.split("/");
	if (segments.some((segment) => segment === "..")) {
		return { problem: `path "${value}" escapes the repository with ".."` };
	}
	if (segments.some((segment) => segment === "")) {
		return { problem: `path "${value}" contains an empty segment` };
	}
	const canonicalSegments = segments.filter((segment) => segment !== ".");
	if (canonicalSegments.length === 0) {
		return { problem: `path "${value}" resolves to the repository root` };
	}
	return { path: canonicalSegments.join("/") };
}

/**
 * Two scope claims overlap when their static prefixes nest at a path boundary.
 * `packages/ai/src` and `packages/ai/test` do not overlap; `packages/ai` and
 * `packages/ai/src` do; anything under a leading-glob pattern overlaps everything.
 */
export function pathsOverlap(left, right) {
	const a = scopePrefix(left);
	const b = scopePrefix(right);
	if (a === "" || b === "") return true;
	if (a === b) return true;
	return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * The path part of a `worktree:` value. The field is prose-tolerant — entries read
 * `unassigned（原 worktree 已淘汰）` or `..\open-forge-wt\x（已淘汰）` — so a trailing
 * parenthetical is an annotation, not part of the path.
 */
export function worktreeValue(raw) {
	return (raw ?? "")
		.trim()
		.replace(/[（(][^（()）]*[)）]\s*$/, "")
		.trim();
}

/**
 * Whether the task claims a worktree of its own, as opposed to a placeholder.
 *
 * The test is "does the first token look like a path", not "is it in a list of known
 * placeholders": the field has held `unassigned`, `main-workspace`, `shared-workspace` and
 * similar, and a list would go stale. A worktree claim always names a location, so it
 * contains a separator; prose about *where* the work happened does not.
 */
export function hasDeclaredWorktree(raw) {
	const token = firstToken(worktreeValue(raw));
	if (token === "" || WORKTREE_PLACEHOLDER.test(token)) return false;
	return token.includes("/") || token.includes("\\");
}

/** The path a claim resolves to: the whole value, or its first token when annotated. */
function worktreePathPart(value) {
	return /\s/.test(value) ? firstToken(value) : value;
}

/** Resolve a declared worktree path and classify whether it is machine-independent. */
export function resolveWorktreePath(raw, primaryRoot) {
	const value = worktreeValue(raw);
	if (!hasDeclaredWorktree(value)) return { kind: "none" };
	const candidate = worktreePathPart(value);
	if (isAbsoluteContractPath(candidate)) {
		return { kind: "path", absolute: toComparable(candidate), portable: false, raw: candidate };
	}
	return { kind: "path", absolute: toComparable(resolve(primaryRoot, candidate)), portable: true, raw: candidate };
}

/** `target` equals or sits under `root`, comparing separators and Windows case-folding. */
export function isInside(root, target) {
	const rootPath = toComparable(root);
	const targetPath = toComparable(target);
	if (rootPath === "" || targetPath === "") return false;
	const fold = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
	const a = fold(rootPath);
	const b = fold(targetPath);
	return a === b || b.startsWith(`${a}/`);
}

/**
 * Parse one Task document into the shape the checks operate on. Field parsing and
 * contract validation are separate so a caller can report raw values alongside findings.
 */
export function parseTaskDocument({ file, text }) {
	const { present, fields, problems } = parseFrontmatter(text);
	const fileName = file.slice(file.lastIndexOf("/") + 1);
	const findings = problems.map(error);

	const pathFields = {};
	for (const key of ["read_paths", "write_paths", "exclusive_paths"]) {
		const entries = [];
		for (const raw of asList(fields, key)) {
			const result = normalizeContractPath(raw);
			if (result.problem) findings.push(error(`${key}: ${result.problem}`));
			else entries.push(result.path);
		}
		pathFields[key] = entries;
	}

	const status = firstToken(asText(fields, "status"));
	const execution = firstToken(asText(fields, "execution"));
	const branch = asText(fields, "branch");
	const branchToken = firstToken(branch);

	return {
		id: asText(fields, "id"),
		file,
		fileName,
		present,
		status,
		execution,
		integrationStatus: firstToken(asText(fields, "integration_status")),
		owner: asText(fields, "owner"),
		priority: firstToken(asText(fields, "priority")),
		created: asText(fields, "created"),
		updated: asText(fields, "updated"),
		branch,
		branchToken,
		hasTaskBranch: branchToken !== "" && !INTEGRATION_BRANCH.test(branchToken),
		worktreeRaw: asText(fields, "worktree"),
		worktreeDeclared: hasDeclaredWorktree(asText(fields, "worktree")),
		baseCommit: asText(fields, "base_commit"),
		readPaths: pathFields.read_paths,
		writePaths: pathFields.write_paths,
		exclusivePaths: pathFields.exclusive_paths,
		dependsOn: asList(fields, "depends_on"),
		conflictsWith: asList(fields, "conflicts_with"),
		fields,
		findings,
	};
}

function checkEnumeration(push, label, value, allowed) {
	if (value !== "" && !allowed.has(value)) {
		push(warn(`${label} "${value}" is outside ${[...allowed].join("/")}; confirm or normalize it`));
	}
}

/**
 * Findings for one task. `strict` adds the field-completeness rules the template
 * guarantees and escalates enumeration drift to an error — the CLI gate uses it; the
 * hermetic guard runs non-strict so pre-existing entries do not fail unrelated checks.
 */
export function findTaskProblems(task, { knownIds, strict = false } = {}) {
	const findings = [...task.findings];
	const escalation = (finding) => (strict ? error(finding.message) : finding);
	const push = (finding) => findings.push(strict ? escalation(finding) : finding);

	if (!TASK_ID_PATTERN.test(task.id)) findings.push(error(`id "${task.id}" must match TASK-<4 digits>`));
	const fromFile = task.fileName.match(TASK_FILE_PATTERN);
	if (!fromFile) findings.push(error(`filename "${task.fileName}" must be TASK-<4 digits>-<kebab-slug>.md`));
	else if (task.id && fromFile[1] !== task.id) {
		findings.push(error(`id "${task.id}" does not match filename prefix "${fromFile[1]}"`));
	}

	checkEnumeration(push, "status", task.status, ALL_STATUSES);
	checkEnumeration(push, "execution", task.execution, EXECUTIONS);
	checkEnumeration(push, "integration_status", task.integrationStatus, INTEGRATION_STATUSES);
	if (task.priority !== "") checkEnumeration(push, "priority", task.priority, PRIORITIES);

	if (ACTIVE_STATUSES.has(task.status) && task.worktreeDeclared && task.execution !== "parallel") {
		findings.push(
			error(
				`active ${task.execution || "(unset)"} task must not declare an independent worktree; only execution: parallel may do so`,
			),
		);
	}

	if (task.hasTaskBranch && !TASK_BRANCH_PATTERN.test(task.branchToken)) {
		findings.push(error(`branch "${task.branchToken}" must match task/TASK-<4 digits>-<kebab-slug>`));
	}

	for (const [key, ids] of [
		["depends_on", task.dependsOn],
		["conflicts_with", task.conflictsWith],
	]) {
		for (const id of ids) {
			if (!CROSS_MODULE_ID_PATTERN.test(id)) {
				findings.push(error(`${key} entry "${id}" is not a <MODULE>-<4 digits> id`));
				continue;
			}
			if (id === task.id) {
				findings.push(error(`${key} references the task itself`));
				continue;
			}
			// Only TASK references resolve inside this tree; ISSUE/BUG/REQ/PLAN references
			// name blockers owned by another module and are recorded, not resolved here.
			if (id.startsWith("TASK-") && knownIds && !knownIds.has(id)) {
				findings.push(error(`${key} references unknown task "${id}"`));
			}
		}
	}

	if (strict) {
		if (task.status === "") findings.push(error("status is required"));
		if (task.execution === "") findings.push(error("execution is required"));
		if (!PRIORITIES.has(task.priority)) findings.push(error("priority must be P0/P1/P2/P3"));
		if (task.owner === "") findings.push(error("owner is required"));
		if (!ISO_DATE_PATTERN.test(task.created)) findings.push(error("created must be YYYY-MM-DD"));
		if (!ISO_DATE_PATTERN.test(task.updated)) findings.push(error("updated must be YYYY-MM-DD"));

		if (task.worktreeDeclared) {
			if (!task.hasTaskBranch) findings.push(error("worktree is declared but branch is not a task branch"));
			if (task.baseCommit === "") findings.push(error("worktree is declared but base_commit is empty"));
			if (task.writePaths.length === 0) findings.push(error("worktree is declared but write_paths is empty"));
		}
	}

	return findings;
}

/**
 * Why a task may not get a worktree. `execution: parallel` records that a task *can* be
 * split off; a serial or coordination-only task is defined by sharing the integration
 * checkout, and giving it a worktree would contradict its own contract.
 */
export function findWorktreeCreateBlockers(task) {
	const blockers = [];
	if (task.execution !== "parallel") {
		blockers.push(
			`execution is "${task.execution || "(unset)"}"; only execution: parallel tasks get a worktree. ` +
				"Work in the integration checkout, or change the task's execution once its scope supports it.",
		);
	}
	if (!ACTIVE_STATUSES.has(task.status)) {
		blockers.push(`status is "${task.status}"; finished or archived tasks do not get new worktrees`);
	}
	return blockers;
}

/**
 * Why a worktree must not be removed. Every entry is a way the checkout could be the only
 * copy of someone's work, so `remove` keeps the worktree unless the caller passes
 * `--force`. "Git could not tell" counts as a blocker: unknown is not the same as clean.
 */
export function findRemovalBlockers({ locked, statusUnknown, dirtyEntries = 0, unpushedCommits = null }) {
	const blockers = [];
	if (locked) blockers.push(`worktree is locked (${locked})`);
	if (statusUnknown) blockers.push("git could not report the worktree status");
	else if (dirtyEntries > 0) blockers.push(`${dirtyEntries} uncommitted or untracked file(s)`);
	if (unpushedCommits === null) blockers.push("could not determine whether commits are pushed");
	else if (unpushedCommits > 0) blockers.push(`${unpushedCommits} commit(s) not on any remote`);
	return blockers;
}

function scoped(task, findings) {
	return findings.map((finding) => ({ ...finding, scope: task.file }));
}

/**
 * Tree-level findings: `depends_on` cycles. A cycle is a property of the graph rather than
 * of one entry — it means no valid integration order exists anywhere — so it is reported
 * regardless of the scope a caller asked for. Everything else is per-task and is therefore
 * scoped, so `check --task X` stays about X.
 */
export function findTreeProblems(tasks) {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const findings = [];

	const visiting = new Set();
	const visited = new Set();
	const walk = (id, trail) => {
		if (visited.has(id)) return;
		if (visiting.has(id)) {
			findings.push({
				level: "error",
				scope: "project/tasks",
				message: `depends_on cycle: ${[...trail.slice(trail.indexOf(id)), id].join(" → ")}`,
			});
			return;
		}
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) {
			if (byId.has(dependency)) walk(dependency, [...trail, id]);
		}
		visiting.delete(id);
		visited.add(id);
	};
	for (const task of tasks) walk(task.id, []);

	return findings;
}

/**
 * Every finding for the tree, or for `only` (a Set of task ids) when a caller wants a
 * scoped report. Tree-level findings are always included, and every task's document
 * findings are computed with the full id set so reference checks stay accurate.
 */
export function findIndexProblems(tasks, { strict = false, only = null } = {}) {
	const knownIds = new Set(tasks.map((task) => task.id));
	const findings = [];

	for (const task of tasks) {
		if (only && !only.has(task.id)) continue;
		findings.push(...scoped(task, findTaskProblems(task, { knownIds, strict })));
	}

	findings.push(...findTreeProblems(tasks));
	return findings;
}

export function partitionFindings(findings) {
	return {
		errors: findings.filter((finding) => finding.level === "error"),
		warnings: findings.filter((finding) => finding.level === "warn"),
	};
}

/**
 * Active parallel Worktree claims per task, for the static quality guard and coordinator CLI.
 * A task executed in the integration checkout or marked serial does not claim concurrent scope.
 * Keeping this comparison pure lets both gates share identical conservative path matching.
 */
export function findScopeConflicts(tasks) {
	const active = tasks.filter(
		(task) => ACTIVE_STATUSES.has(task.status) && task.execution === "parallel" && task.worktreeDeclared,
	);
	const conflicts = [];

	for (let left = 0; left < active.length; left += 1) {
		for (let right = left + 1; right < active.length; right += 1) {
			const a = active[left];
			const b = active[right];
			if (a.conflictsWith.includes(b.id) || b.conflictsWith.includes(a.id)) continue;

			const overlaps = [];
			for (const [leftKey, leftPaths] of [
				["write_paths", a.writePaths],
				["exclusive_paths", a.exclusivePaths],
			]) {
				for (const [rightKey, rightPaths] of [
					["write_paths", b.writePaths],
					["exclusive_paths", b.exclusivePaths],
				]) {
					for (const leftPath of leftPaths) {
						for (const rightPath of rightPaths) {
							if (pathsOverlap(leftPath, rightPath)) {
								overlaps.push(`${leftPath} (${leftKey}) ∩ ${rightPath} (${rightKey})`);
							}
						}
					}
				}
			}

			if (overlaps.length > 0) {
				conflicts.push({ left: a.id, right: b.id, detail: [...new Set(overlaps)].sort() });
			}
		}
	}

	return conflicts;
}

/** Read every `project/tasks/TASK-*.md` under the given checkout. */
export function loadTasks(primaryRoot) {
	const directory = join(primaryRoot, "project", "tasks");
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return { tasks: [], problems: [`cannot read project/tasks under ${toComparable(primaryRoot)}`] };
	}

	const tasks = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.isFile() || !/^TASK-\d{4}-.*\.md$/.test(entry.name)) continue;
		const text = readFileSync(join(directory, entry.name), "utf8");
		tasks.push(parseTaskDocument({ file: `project/tasks/${entry.name}`, text }));
	}
	return { tasks, problems: [] };
}

/** Forward-slash path relative to the primary root, for messages. */
export function toDisplayPath(absolute, primaryRoot) {
	const base = toComparable(primaryRoot);
	const target = toComparable(absolute);
	if (target === base) return ".";
	if (target.startsWith(`${base}/`)) return target.slice(base.length + 1);
	return target;
}
