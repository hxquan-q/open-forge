/**
 * Guard the Task ↔ Worktree development contract (`project/collaboration/README.md`).
 *
 * Why a guard and not just care: the contract lives in hand-written frontmatter, and a
 * typo there is invisible — an `id` that disagrees with its filename breaks every
 * `depends_on` pointing at it, a `depends_on` cycle means no valid integration order
 * exists, and a `..` in `write_paths` makes the scope claims meaningless. The checks
 * below are contradictions, they hold for the whole repository, and they need no Git.
 *
 * Warnings (enumeration drift such as an `integration_status` outside the documented
 * set) are printed but do not fail the build: fixing them is the owning task's call.
 * `bun scripts/worktree/cli.mjs check` escalates them when a coordinator wants a gate.
 *
 * Deliberately NOT checked here — both need real Git state or a human scheduling decision:
 *
 *   - Cross-task scope overlaps (`cli.mjs check`; `conflicts_with` is how they are recorded)
 *   - Whether a declared worktree exists in this checkout (`cli.mjs doctor`)
 *
 * Usage:
 *   bun run scripts/quality/check-task-worktrees.mjs
 */

import { findIndexProblems, loadTasks, partitionFindings } from "../worktree/contract.mjs";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

export function findTaskTreeProblems(root = repoRoot) {
	const { tasks, problems } = loadTasks(root);
	if (problems.length > 0) {
		return { errors: problems, warnings: [], count: tasks.length };
	}
	const { errors, warnings } = partitionFindings(findIndexProblems(tasks));
	return { errors, warnings, count: tasks.length };
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
