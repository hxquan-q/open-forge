/**
 * Guard the Task ↔ Worktree development contract (`project/collaboration/README.md`).
 *
 * The checks below are contradictions in active Task contracts and need no Git.
 * Cross-task write-scope overlaps fail unless a relationship is recorded in `conflicts_with`;
 * the coordinator CLI separately inspects actual Worktree registration and branch drift.
 *
 * Warnings (enumeration drift such as an `integration_status` outside the documented
 * set) are printed but do not fail the build: fixing them is the owning task's call.
 * `bun scripts/worktree/cli.mjs check` escalates warnings when a coordinator asks for a gate.
 *
 * Whether a declared Worktree exists in this checkout remains a local Git-state question
 * and is deliberately left to `cli.mjs check` / `doctor`.
 *
 * Usage:
 *   bun run scripts/quality/check-task-worktrees.mjs
 */

import { findIndexProblems, findScopeConflicts, loadTasks, partitionFindings } from "../worktree/contract.mjs";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

export function findTaskTreeProblemsFromTasks(tasks) {
	const { errors, warnings } = partitionFindings(findIndexProblems(tasks));
	const scopeErrors = findScopeConflicts(tasks).map((conflict) => ({
		level: "error",
		scope: `${conflict.left} ∩ ${conflict.right}`,
		message: `active parallel write scopes overlap without conflicts_with: ${conflict.detail.join("; ")}`,
	}));
	return { errors: [...errors, ...scopeErrors], warnings, count: tasks.length };
}

export function findTaskTreeProblems(root = repoRoot) {
	const { tasks, problems } = loadTasks(root);
	if (problems.length > 0) {
		return { errors: problems, warnings: [], count: tasks.length };
	}
	return findTaskTreeProblemsFromTasks(tasks);
}

if (isDirectRun(import.meta.url)) {
	const { errors, warnings, count } = findTaskTreeProblems();
	for (const warning of warnings) {
		console.log(`[task-worktrees] warn — ${warning.scope ?? "contract"}: ${warning.message}`);
	}
	if (errors.length === 0) {
		ok(`[task-worktrees] contract passed (${count} task(s), ${warnings.length} warning(s))`);
	} else {
		for (const problem of errors) fail(`[task-worktrees] ${problem.scope ?? "contract"}: ${problem.message}`);
		fail(`[task-worktrees] ${errors.length} problem(s)`);
		process.exit(1);
	}
}
