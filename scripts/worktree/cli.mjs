#!/usr/bin/env node
// Copyright The Open Forge contributors.

/**
 * Worktree lifecycle for Task-parallel development.
 *
 *   bun scripts/worktree/cli.mjs create --task TASK-0096
 *   bun scripts/worktree/cli.mjs status [--task TASK-0096] [--json]
 *   bun scripts/worktree/cli.mjs check  [--task TASK-0096 | --all] [--json]
 *   bun scripts/worktree/cli.mjs remove --task TASK-0096 [--force] [--keep-branch]
 *   bun scripts/worktree/cli.mjs doctor [--json]
 *
 * Relationship to `scripts/quality/check-task-worktrees.mjs`: that guard enforces the
 * structural contract hermetically on every `check`. This CLI adds the parts that depend
 * on real Git state and on human scheduling decisions — cross-task scope conflicts, drift
 * between declared and actual worktrees, initialization and removal. `create` and `remove`
 * are the only mutating commands, and `remove` refuses anything it cannot prove is safe.
 *
 * Not a product-runtime concern: the Desktop Agent Team has its own isolation and does not
 * use this module.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	chooseBaseRef,
	loadWorktreeConfig,
	readWorktreeInclude,
	selectIncludeFiles,
	selectSetupCommands,
	WORKTREE_CONFIG_FILE,
} from "./config.mjs";
import {
	findIndexProblems,
	findRemovalBlockers,
	findScopeConflicts,
	findTaskProblems,
	findWorktreeCreateBlockers,
	isInside,
	loadTasks,
	resolveWorktreePath,
	toDisplayPath,
} from "./contract.mjs";
import { extractFrontmatterBlock } from "./frontmatter.mjs";
import { createGitAdapter, runSetupCommand } from "./git.mjs";

const USAGE = `Usage: bun scripts/worktree/cli.mjs <command> [options]

Commands:
  create --task <ID> [--base <ref>|--base head] [--no-setup] [--no-write] [--dry-run]
  status [--task <ID>] [--json]
  check  [--task <ID> | --all] [--json]
  remove --task <ID> [--force] [--keep-branch] [--dry-run]
  doctor [--json]

Contract: project/collaboration/README.md · Config: ${WORKTREE_CONFIG_FILE}`;

/** True only when this file is the process entry point, so importing it has no effects. */
function isDirectRun() {
	if (!process.argv[1]) return false;
	return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

function parseArgv(argv) {
	const flags = new Set();
	const options = new Map();
	const withValue = new Set(["--task", "--base"]);
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) {
			if (!options.has("_command")) options.set("_command", arg);
			continue;
		}
		if (withValue.has(arg)) {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
			options.set(arg, value);
			index += 1;
			continue;
		}
		flags.add(arg);
	}
	return { command: options.get("_command") ?? "help", flags, options };
}

function normalizeTaskId(raw) {
	if (!raw) return null;
	const match = raw
		.trim()
		.toUpperCase()
		.match(/^(?:TASK-)?(\d{1,4})$/);
	return match ? `TASK-${match[1].padStart(4, "0")}` : null;
}

/** `TASK-0096-add-thing.md` → `add-thing`, the worktree/branch slug. */
function slugFromFileName(fileName) {
	const match = fileName.match(/^TASK-\d{4}-(.+)\.md$/);
	return match ? match[1] : null;
}

function fail(message) {
	console.error(`[worktree] ${message}`);
	process.exitCode = 1;
}

function info(message) {
	console.log(`[worktree] ${message}`);
}

function context() {
	const adapter = createGitAdapter({ cwd: process.cwd() });
	const primaryRoot = adapter.primaryRoot();
	return { adapter, primaryRoot };
}

function taskContext(primaryRoot) {
	const { tasks } = loadTasks(primaryRoot);
	const loaded = loadWorktreeConfig(primaryRoot);
	return {
		tasks,
		config: loaded.config,
		configProblems: loaded.problems,
		configPresent: loaded.present,
	};
}

/** One-line rendering of a contract finding, so both `check` and `doctor` read the same. */
function formatFinding(finding) {
	return `${finding.scope ?? "contract"}: ${finding.message}`;
}

/** Keep a conflict readable: the first few overlapping paths are enough to act on. */
function formatConflict(conflict, limit = 6) {
	const shown = conflict.detail.slice(0, limit).join("; ");
	const rest = conflict.detail.length > limit ? ` (+${conflict.detail.length - limit} more)` : "";
	return `${conflict.left} and ${conflict.right} claim overlapping scope: ${shown}${rest}`;
}

function findTask(tasks, id) {
	return tasks.find((task) => task.id === id) ?? null;
}

function declaredWorktree(task, primaryRoot) {
	return resolveWorktreePath(task.worktreeRaw, primaryRoot);
}

/** Replace existing top-level frontmatter values, leaving the rest of the file untouched. */
export function rewriteFrontmatterFields(text, updates) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	if (lines[0] !== "---") return { text, missing: Object.keys(updates) };
	let end = -1;
	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index] === "---") {
			end = index;
			break;
		}
	}
	if (end === -1) return { text, missing: Object.keys(updates) };

	const missing = [];
	for (const [key, value] of Object.entries(updates)) {
		let found = false;
		for (let index = 1; index < end; index += 1) {
			if (lines[index].startsWith(`${key}:`)) {
				lines[index] = `${key}: ${value}`;
				found = true;
				break;
			}
		}
		if (!found) missing.push(key);
	}
	return { text: lines.join("\n"), missing };
}

function worktreeRootPath(primaryRoot, config) {
	return resolve(primaryRoot, config.worktreeRoot);
}

function commandCreate({ adapter, primaryRoot }, { flags, options }) {
	const dryRun = flags.has("--dry-run");
	const { tasks, config, configProblems } = taskContext(primaryRoot);
	if (configProblems.length > 0) {
		for (const problem of configProblems) fail(`${WORKTREE_CONFIG_FILE}: ${problem}`);
		return;
	}

	const taskId = normalizeTaskId(options.get("--task"));
	if (!taskId) {
		fail("create requires --task <TASK-xxxx>");
		return;
	}
	const task = findTask(tasks, taskId);
	if (!task) {
		fail(`no task file for ${taskId} under project/tasks`);
		return;
	}

	const findings = findTaskProblems(task, { knownIds: new Set(tasks.map((entry) => entry.id)), strict: true });
	if (findings.length > 0) {
		for (const finding of findings) fail(`${task.file}: ${finding.message}`);
		fail("fix the task contract before creating its worktree");
		return;
	}
	const blockers = findWorktreeCreateBlockers(task);
	if (blockers.length > 0) {
		for (const blocker of blockers) fail(`${taskId}: ${blocker}`);
		return;
	}

	const slug = slugFromFileName(task.fileName);
	const directoryName = `${taskId.toLowerCase()}-${slug}`;
	const worktreeRoot = worktreeRootPath(primaryRoot, config);
	const target = resolve(worktreeRoot, directoryName);
	const branch = `task/${taskId}-${slug}`;

	if (isInside(primaryRoot, target)) {
		fail(`target ${toDisplayPath(target, primaryRoot)} is inside the primary checkout`);
		return;
	}
	if (!isInside(worktreeRoot, target)) {
		fail(`target ${toDisplayPath(target, primaryRoot)} is outside the configured worktree root`);
		return;
	}
	if (existsSync(target)) {
		fail(`target already exists: ${toDisplayPath(target, primaryRoot)}`);
		return;
	}
	const registered = adapter.listWorktrees().some((entry) => resolve(entry.path) === target);
	if (registered) {
		fail(`git already registers a worktree at ${toDisplayPath(target, primaryRoot)}`);
		return;
	}
	if (adapter.branchExists(branch)) {
		fail(`branch ${branch} already exists; delete it or reuse its worktree instead of creating a second one`);
		return;
	}

	const base = chooseBaseRef({
		requested: options.get("--base") === "head" ? "HEAD" : options.get("--base"),
		config,
		exists: (ref) => adapter.refExists(ref),
	});
	if (!base) {
		fail(`no usable base ref; pass --base <ref> or set baseRef in ${WORKTREE_CONFIG_FILE}`);
		return;
	}
	const baseCommit = adapter.resolveRef(base);

	const worktreeField = `../${relative(dirname(primaryRoot), target).replaceAll("\\", "/")}`;
	const missingFields = ["branch", "worktree", "base_commit"].filter(
		(key) =>
			!extractFrontmatterBlock(readFileSync(join(primaryRoot, task.file), "utf8"))?.match(
				new RegExp(`^${key}:`, "m"),
			),
	);
	if (!flags.has("--no-write") && missingFields.length > 0) {
		fail(`${task.file} is missing frontmatter ${missingFields.join(", ")}; add them before creating the worktree`);
		return;
	}

	if (dryRun) {
		info(`would create ${toDisplayPath(target, primaryRoot)} on ${branch} from ${base} (${baseCommit.slice(0, 9)})`);
		for (const command of selectSetupCommands(config)) info(`would run setup: ${command}`);
		return;
	}

	if (!existsSync(worktreeRoot)) mkdirSync(worktreeRoot, { recursive: true });
	const created = adapter.addWorktree({ path: target, branch, base: baseCommit });
	if (!created.ok) {
		fail(`git worktree add failed: ${(created.stderr || created.stdout).trim()}`);
		return;
	}
	info(`created ${toDisplayPath(target, primaryRoot)} on ${branch} from ${base} (${baseCommit.slice(0, 9)})`);

	if (!flags.has("--no-write")) {
		const taskFile = join(primaryRoot, task.file);
		const { text, missing } = rewriteFrontmatterFields(readFileSync(taskFile, "utf8"), {
			branch,
			worktree: worktreeField,
			base_commit: baseCommit,
		});
		if (missing.length > 0) {
			fail(`could not record ${missing.join(", ")} in ${task.file}; update it by hand`);
		} else {
			writeFileSync(taskFile, text, "utf8");
			info(`recorded branch/worktree/base_commit in ${task.file}`);
		}
	}

	if (config.copyIgnored) copyIncludedFiles({ adapter, primaryRoot, worktreeRoot: target });

	if (!flags.has("--no-setup")) {
		const commands = selectSetupCommands(config);
		for (const command of commands) {
			info(`setup: ${command}`);
			const code = runSetupCommand(command, { cwd: target, primaryRoot, taskId });
			if (code !== 0) {
				fail(`setup command failed (exit ${code}): ${command}`);
				fail(`the worktree is intact at ${target}; fix the cause and re-run, or pass --no-setup`);
				return;
			}
		}
		if (commands.length === 0) info("no setup commands configured; run your install step by hand if needed");
	}

	info(`next: cd "${target}" && bun run check:quick`);
}

function copyIncludedFiles({ adapter, primaryRoot, worktreeRoot }) {
	const { patterns, problems, present } = readWorktreeInclude(primaryRoot);
	if (!present) return;
	for (const problem of problems) fail(`${".worktreeinclude"}: ${problem}`);
	if (problems.length > 0) return;

	const { selected, skipped } = selectIncludeFiles({ patterns, ignoredFiles: adapter.ignoredFiles() });
	for (const file of selected) {
		const source = join(primaryRoot, file);
		const destination = join(worktreeRoot, file);
		try {
			mkdirSync(dirname(destination), { recursive: true });
			copyFileSync(source, destination);
		} catch (error) {
			fail(`could not copy ${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (selected.length > 0) info(`copied ${selected.length} ignored file(s) into the worktree`);
	for (const file of skipped) info(`skipped sensitive file: ${file}`);
}

function describeWorktrees({ adapter, primaryRoot }) {
	const { tasks } = taskContext(primaryRoot);
	const registered = adapter.listWorktrees();
	const byPath = new Map(registered.map((entry) => [resolve(entry.path), entry]));
	const claims = new Map();

	for (const task of tasks) {
		const declared = declaredWorktree(task, primaryRoot);
		if (declared.kind !== "path") continue;
		claims.set(task.id, { task, declared, registered: byPath.get(resolve(declared.absolute)) ?? null });
	}

	const records = [];
	const primary = resolve(primaryRoot);
	for (const entry of registered) {
		const path = resolve(entry.path);
		if (path === primary) {
			records.push({ path, kind: "primary", entry });
			continue;
		}
		const owner = [...claims.entries()].find(([, claim]) => resolve(claim.declared.absolute) === path);
		const status = adapter.status(path);
		const branch = entry.branch ?? null;
		const byBranch = owner ? null : (tasks.find((task) => task.hasTaskBranch && task.branchToken === branch) ?? null);
		records.push({
			path,
			kind: owner ? "task" : byBranch ? "task" : "orphan",
			entry,
			task: owner ? owner[1].task : byBranch,
			status,
			dirty: status.unknown ? null : !status.clean,
			unpushed: adapter.unpushedCommits(path),
		});
	}

	const missing = [];
	for (const [id, claim] of claims) {
		if (byPath.has(resolve(claim.declared.absolute))) continue;
		missing.push({ id, path: claim.declared.absolute, task: claim.task });
	}

	return { records, missing, tasks, registered };
}

function commandStatus({ adapter, primaryRoot }, { flags, options }) {
	const { records, missing } = describeWorktrees({ adapter, primaryRoot });
	const wanted = normalizeTaskId(options.get("--task"));
	const filtered = wanted ? records.filter((record) => record.task?.id === wanted) : records;
	const wantedMissing = wanted ? missing.filter((entry) => entry.id === wanted) : missing;

	if (flags.has("--json")) {
		console.log(
			JSON.stringify(
				{
					primary: primaryRoot,
					worktrees: filtered.map((record) => ({
						path: toDisplayPath(record.path, primaryRoot),
						kind: record.kind,
						branch: record.entry?.branch ?? null,
						head: record.entry?.head ?? null,
						taskId: record.task?.id ?? null,
						taskStatus: record.task?.status ?? null,
						integrationStatus: record.task?.integrationStatus ?? null,
						dirty: record.dirty,
						modified: record.status?.entries?.length ?? null,
						unpushedCommits: record.unpushed ?? null,
					})),
					missing: wantedMissing,
				},
				null,
				2,
			),
		);
		return;
	}

	for (const record of filtered) {
		const where = toDisplayPath(record.path, primaryRoot);
		const branch = record.entry?.branch ?? (record.entry?.detached ? "(detached)" : "(unknown)");
		const state =
			record.kind === "primary"
				? "primary checkout"
				: record.dirty === null
					? "unknown (git could not report)"
					: record.dirty
						? `dirty (${record.status.entries.length} entry/entries)`
						: "clean";
		const taskLabel = record.task
			? `${record.task.id} [${record.task.status}/${record.task.integrationStatus}]`
			: record.kind === "primary"
				? "-"
				: "no task file";
		info(`${where} · ${branch} · ${state} · ${taskLabel}`);
	}
	for (const entry of wantedMissing) {
		info(`${toDisplayPath(entry.path, primaryRoot)} · declared by ${entry.id} but not registered with git · missing`);
	}
	if (filtered.length === 0 && wantedMissing.length === 0) info("no worktrees found");
}

function collectFindings({ adapter, primaryRoot }) {
	const findings = [];
	const { tasks, config, configProblems, configPresent } = taskContext(primaryRoot);

	for (const problem of configProblems)
		findings.push({ level: "error", scope: WORKTREE_CONFIG_FILE, message: problem });
	const include = readWorktreeInclude(primaryRoot);
	for (const problem of include.problems) {
		findings.push({ level: "error", scope: ".worktreeinclude", message: problem });
	}

	findings.push(...findIndexProblems(tasks));

	for (const conflict of findScopeConflicts(tasks)) {
		findings.push({
			level: "warn",
			scope: `${conflict.left} ∩ ${conflict.right}`,
			message: `overlapping write scope: ${conflict.detail.join("; ")}`,
		});
	}

	const { records, missing } = describeWorktrees({ adapter, primaryRoot });
	for (const entry of missing) {
		// A removed worktree is the normal end of a task's lifecycle, so this is drift to
		// report rather than a defect. `check --task <ID>` escalates it for the named task.
		findings.push({
			level: "warn",
			scope: entry.id,
			message: `frontmatter declares ${toDisplayPath(entry.path, primaryRoot)} but git has no such worktree`,
		});
	}
	for (const record of records) {
		const where = toDisplayPath(record.path, primaryRoot);
		if (record.kind === "orphan") {
			findings.push({ level: "warn", scope: where, message: "worktree has no matching task file" });
		}
		if (record.entry?.locked) {
			findings.push({ level: "warn", scope: where, message: `locked (${record.entry.locked})` });
		}
		if (record.entry?.prunable) {
			findings.push({ level: "warn", scope: where, message: `prunable (${record.entry.prunable})` });
		}
		if (record.task && record.dirty === true) {
			findings.push({
				level: "warn",
				scope: where,
				message: `uncommitted changes: ${record.status.entries.length}`,
			});
		}
		if (record.task?.integrationStatus === "integrated" && record.kind === "task") {
			findings.push({ level: "warn", scope: where, message: "task is integrated; worktree can be removed" });
		}
	}

	for (const task of tasks) {
		const declared = declaredWorktree(task, primaryRoot);
		if (declared.kind === "path" && declared.portable === false) {
			findings.push({
				level: "warn",
				scope: task.id,
				message: `worktree path "${declared.raw}" is absolute; use the relative ${config.worktreeRoot} form so it works on other machines`,
			});
		}
	}

	return { findings, tasks, configPresent };
}

function commandCheck({ adapter, primaryRoot }, { flags, options }) {
	const wanted = normalizeTaskId(options.get("--task"));
	const { tasks, config, configProblems } = taskContext(primaryRoot);
	const problems = [];

	for (const problem of configProblems) problems.push(`${WORKTREE_CONFIG_FILE}: ${problem}`);

	const scope = wanted ? tasks.filter((task) => task.id === wanted) : tasks;
	if (wanted && scope.length === 0) problems.push(`no task file for ${wanted}`);

	// The CLI is the strict gate: enumeration drift that the hermetic guard only warns
	// about becomes a failure here, because a coordinator asked for a decision.
	for (const finding of findIndexProblems(tasks, { strict: true, only: wanted ? new Set([wanted]) : null })) {
		problems.push(`${finding.level === "warn" ? "warn — " : ""}${formatFinding(finding)}`);
	}

	// Overlap is a scheduling fact about the whole tree, so it is only meaningful when the
	// caller looks at more than one task.
	if (!wanted || flags.has("--all")) {
		for (const conflict of findScopeConflicts(tasks)) {
			problems.push(
				`${formatConflict(conflict)}. Serialize them, narrow write_paths, or record the relationship in conflicts_with.`,
			);
		}
	}

	const registered = adapter.listWorktrees();
	const byPath = new Map(registered.map((entry) => [resolve(entry.path), entry]));
	const drift = [];
	for (const task of scope) {
		const declared = declaredWorktree(task, primaryRoot);
		if (declared.kind !== "path") continue;
		const entry = byPath.get(resolve(declared.absolute));
		if (!entry) {
			// Which worktree a named task lives in is part of the contract when you ask
			// about that task; across the whole tree a removed worktree is just history.
			const message = `${task.id}: declared worktree ${toDisplayPath(declared.absolute, primaryRoot)} is not registered`;
			if (wanted) problems.push(message);
			else drift.push(message);
			continue;
		}
		if (task.hasTaskBranch && entry.branch !== task.branchToken) {
			problems.push(
				`${task.id}: checked out ${entry.branch ?? "(detached)"} but frontmatter says ${task.branchToken}`,
			);
		}
		if (declared.portable === false) {
			problems.push(`${task.id}: worktree path must be relative (${config.worktreeRoot}/…), got "${declared.raw}"`);
		}
	}

	if (flags.has("--json")) {
		console.log(JSON.stringify({ ok: problems.length === 0, problems, drift }, null, 2));
	} else {
		for (const entry of drift) console.log(`[worktree] warn — ${entry}`);
		if (problems.length === 0) info(`contract check passed (${scope.length} task(s))`);
		else for (const problem of problems) fail(problem);
	}
	if (problems.length > 0) process.exitCode = 1;
}

function commandRemove({ adapter, primaryRoot }, { flags, options }) {
	const dryRun = flags.has("--dry-run");
	const force = flags.has("--force");
	const keepBranch = flags.has("--keep-branch");
	const { tasks, config, configProblems } = taskContext(primaryRoot);
	if (configProblems.length > 0) {
		for (const problem of configProblems) fail(`${WORKTREE_CONFIG_FILE}: ${problem}`);
		return;
	}

	const taskId = normalizeTaskId(options.get("--task"));
	if (!taskId) {
		fail("remove requires --task <TASK-xxxx>");
		return;
	}
	const task = findTask(tasks, taskId);
	if (!task) {
		fail(`no task file for ${taskId}; refusing to remove a worktree with no contract to check`);
		return;
	}

	const declared = declaredWorktree(task, primaryRoot);
	const registered = adapter.listWorktrees();
	const entry =
		(declared.kind === "path"
			? registered.find((item) => resolve(item.path) === resolve(declared.absolute))
			: null) ??
		registered.find((item) => item.branch && item.branch === task.branchToken) ??
		null;

	if (!entry) {
		fail(`${taskId} has no registered worktree; nothing to remove`);
		return;
	}

	const target = resolve(entry.path);
	const worktreeRoot = worktreeRootPath(primaryRoot, config);
	const blockers = [];

	if (target === resolve(primaryRoot)) {
		fail("refusing to remove the primary checkout");
		return;
	}
	if (!isInside(worktreeRoot, target)) {
		fail(
			`refusing to remove ${toDisplayPath(target, primaryRoot)}: outside the configured worktree root ${worktreeRoot}`,
		);
		return;
	}

	const status = adapter.status(target);
	blockers.push(
		...findRemovalBlockers({
			locked: entry.locked,
			statusUnknown: status.unknown,
			dirtyEntries: status.entries?.length ?? 0,
			unpushedCommits: adapter.unpushedCommits(target),
		}),
	);

	if (blockers.length > 0 && !force) {
		fail(`${taskId}: keeping ${toDisplayPath(target, primaryRoot)} — ${blockers.join("; ")}`);
		fail("inspect it, or pass --force once you are sure the work is preserved elsewhere");
		return;
	}
	if (force && blockers.length > 0) {
		for (const blocker of blockers) info(`--force overriding: ${blocker}`);
	}

	if (dryRun) {
		info(`would remove ${toDisplayPath(target, primaryRoot)}${keepBranch ? "" : ` and branch ${entry.branch}`}`);
		return;
	}

	const removed = adapter.removeWorktree({ path: target, force: true });
	if (!removed.ok) {
		fail(`git worktree remove failed: ${(removed.stderr || removed.stdout).trim()}`);
		return;
	}
	adapter.pruneWorktrees();
	info(`removed ${toDisplayPath(target, primaryRoot)}`);

	if (!keepBranch && entry.branch) {
		const deleted = adapter.deleteBranch(entry.branch, { force });
		if (deleted.ok) info(`deleted branch ${entry.branch}`);
		else info(`kept branch ${entry.branch} (${(deleted.stderr || deleted.stdout).trim()})`);
	}
}

/**
 * The diagnostic chain: environment → configuration → contract → real Git state.
 * Warnings never fail the command; errors do. Report the environment first because every
 * later finding depends on it — a wrong primary checkout makes all of them meaningless.
 */
function commandDoctor({ adapter, primaryRoot }, { flags }) {
	const findings = [];
	const current = adapter.toplevel();

	if (!current) findings.push({ level: "error", scope: "git", message: "not inside a git checkout" });
	else if (resolve(current) !== resolve(primaryRoot)) {
		info(`running from a linked worktree (${current}); reporting on the primary checkout ${primaryRoot}`);
	}

	const { findings: collected, configPresent } = collectFindings({ adapter, primaryRoot });
	findings.push(...collected);
	if (!configPresent) {
		findings.push({ level: "warn", scope: WORKTREE_CONFIG_FILE, message: "absent; using built-in defaults" });
	}

	const errors = findings.filter((finding) => finding.level === "error");
	if (flags.has("--json")) {
		console.log(JSON.stringify({ ok: errors.length === 0, findings }, null, 2));
	} else {
		info(`primary checkout: ${primaryRoot}`);
		if (findings.length === 0) info("no findings");
		for (const finding of findings) {
			if (finding.level === "error") fail(formatFinding(finding));
			else console.log(`[worktree] warn — ${formatFinding(finding)}`);
		}
		info(`${errors.length} error(s), ${findings.length - errors.length} warning(s)`);
	}
	if (errors.length > 0) process.exitCode = 1;
}

function main(argv) {
	const parsed = parseArgv(argv);
	if (parsed.flags.has("--help") || parsed.command === "help") {
		console.log(USAGE);
		return;
	}

	const { adapter, primaryRoot } = context();
	if (!primaryRoot) {
		fail("not inside a git checkout; run this from the repository");
		process.exitCode = 1;
		return;
	}
	const ctx = { adapter, primaryRoot };

	switch (parsed.command) {
		case "create":
			commandCreate(ctx, parsed);
			return;
		case "status":
		case "list":
			commandStatus(ctx, parsed);
			return;
		case "check":
			commandCheck(ctx, parsed);
			return;
		case "remove":
			commandRemove(ctx, parsed);
			return;
		case "doctor":
			commandDoctor(ctx, parsed);
			return;
		default:
			fail(`unknown command "${parsed.command}"`);
			console.log(USAGE);
			process.exitCode = 1;
	}
}

if (isDirectRun()) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
