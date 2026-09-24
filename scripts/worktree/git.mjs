// Copyright The Open Forge contributors.

/**
 * Git adapter for the Worktree tooling.
 *
 * Every Git invocation goes through `spawnSync` with an explicit argument array and
 * `shell: false`, so no path, branch name or task title can be reinterpreted by a shell.
 * The only place a shell is used at all is `runSetupCommand`, and only for commands that
 * a reviewable, versioned `.worktreeconfig.json` declares.
 *
 * All methods return plain data and never throw on a missing ref or a dirty tree — the
 * commands need to distinguish "absent", "dirty" and "unknown", and a thrown error
 * collapses those into one. Failures that indicate a broken environment (not a repository,
 * git missing) surface as `null` so callers can report `unknown` instead of guessing.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export function createGitAdapter({ cwd }) {
	const run = (args, { cwd: at = cwd, allowFail = true } = {}) => {
		const result = spawnSync("git", args, { cwd: at, encoding: "utf8", shell: false });
		if (result.error) return { ok: false, status: null, stdout: "", stderr: result.error.message };
		const status = result.status ?? 1;
		const stdout = result.stdout ?? "";
		const stderr = result.stderr ?? "";
		if (status !== 0 && !allowFail) {
			throw new Error(`git ${args.join(" ")} failed: ${(stderr || stdout).trim() || `exit ${status}`}`);
		}
		return { ok: status === 0, status, stdout, stderr };
	};

	const output = (args, options) => {
		const result = run(args, options);
		return result.ok ? result.stdout.trim() : null;
	};

	/** The primary checkout, even when invoked from inside a linked worktree. */
	const primaryRoot = () => {
		const commonDir =
			output(["rev-parse", "--path-format=absolute", "--git-common-dir"]) ??
			output(["rev-parse", "--git-common-dir"]);
		if (commonDir === null) return null;
		return dirname(resolve(cwd, commonDir));
	};

	const toplevel = () => output(["rev-parse", "--show-toplevel"]);

	const refExists = (ref) => output(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;

	const resolveRef = (ref) => output(["rev-parse", `${ref}^{commit}`]);

	const branchExists = (name) => refExists(`refs/heads/${name}`);

	/** The checked-out branch name in a worktree, or null when detached or unreadable. */
	const currentBranch = (at = cwd) => output(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: at }) ?? null;

	const listWorktrees = () => parseWorktreeList(output(["worktree", "list", "--porcelain"]) ?? "");

	/**
	 * Working-tree state of one checkout. `unknown: true` means Git could not report —
	 * callers must treat that as "keep", never as "clean".
	 */
	const status = (at) => {
		const result = run(["status", "--porcelain", "--untracked-files=normal"], { cwd: at });
		if (!result.ok) return { unknown: true, clean: false, entries: [] };
		const entries = result.stdout
			.split("\n")
			.map((line) => line.trimEnd())
			.filter((line) => line !== "");
		return { unknown: false, clean: entries.length === 0, entries };
	};

	/** Commits reachable from HEAD but not from `base`. `null` when the base is unresolvable. */
	const commitsAhead = (at, base) => {
		if (!refExists(base)) return null;
		const value = output(["rev-list", "--count", `${base}..HEAD`], { cwd: at });
		if (value === null) return null;
		const count = Number.parseInt(value, 10);
		return Number.isFinite(count) ? count : null;
	};

	/** Commits in the worktree that no remote branch contains. `null` when it cannot be told. */
	const unpushedCommits = (at) => {
		const branch = currentBranch(at);
		if (!branch) return null;
		const value = output(["rev-list", "--count", `--not`, "--remotes", "HEAD"], { cwd: at });
		if (value === null) return null;
		const count = Number.parseInt(value, 10);
		return Number.isFinite(count) ? count : null;
	};

	const addWorktree = ({ path, branch, base }) =>
		run(["worktree", "add", "-b", branch, path, base], { allowFail: false });

	const removeWorktree = ({ path, force = false }) => {
		const args = ["worktree", "remove"];
		if (force) args.push("--force");
		args.push(path);
		return run(args);
	};

	const pruneWorktrees = () => run(["worktree", "prune"]);

	const deleteBranch = (name, { force = false } = {}) => run(["branch", force ? "-D" : "-d", name]);

	/** Ignored, untracked files — the candidates `.worktreeinclude` can carry over. */
	const ignoredFiles = () =>
		(run(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).stdout ?? "")
			.split("\0")
			.filter(Boolean)
			.map((file) => file.replaceAll("\\", "/"));

	return {
		run,
		output,
		primaryRoot,
		toplevel,
		refExists,
		resolveRef,
		branchExists,
		currentBranch,
		listWorktrees,
		status,
		commitsAhead,
		unpushedCommits,
		addWorktree,
		removeWorktree,
		pruneWorktrees,
		deleteBranch,
		ignoredFiles,
	};
}

/** Parse `git worktree list --porcelain` into one record per worktree. */
export function parseWorktreeList(text) {
	const worktrees = [];
	let current = null;

	for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
		const line = rawLine.trimEnd();
		if (line === "") {
			if (current) worktrees.push(current);
			current = null;
			continue;
		}
		if (line.startsWith("worktree ")) {
			if (current) worktrees.push(current);
			current = {
				path: line.slice("worktree ".length),
				head: null,
				branch: null,
				detached: false,
				bare: false,
				locked: null,
				prunable: null,
			};
			continue;
		}
		if (!current) continue;
		if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
		else if (line.startsWith("branch ")) current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
		else if (line === "detached") current.detached = true;
		else if (line === "bare") current.bare = true;
		else if (line.startsWith("locked")) current.locked = line.slice("locked".length).trim() || "locked";
		else if (line.startsWith("prunable")) current.prunable = line.slice("prunable".length).trim() || "prunable";
	}

	if (current) worktrees.push(current);
	return worktrees;
}

/**
 * Run one setup command declared by `.worktreeconfig.json`, inside the new worktree.
 * `WORKTREE_ROOT_PATH` exposes the primary checkout the way Cursor's `$ROOT_WORKTREE_PATH`
 * does, so a setup script can copy configuration from it without guessing relative paths.
 */
export function runSetupCommand(command, { cwd, primaryRoot, taskId }) {
	const result = spawnSync(command, {
		cwd,
		shell: true,
		stdio: "inherit",
		env: {
			...process.env,
			WORKTREE_ROOT_PATH: primaryRoot,
			WORKTREE_TASK_ID: taskId,
		},
	});
	return result.status ?? 1;
}
