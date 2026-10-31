---
id: TASK-0443
type: task
status: verifying
priority: P2
owner: scripts/agents
requirement:
plan:
source: BUG-0179
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0179]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 3862e20ac
read_paths:
  - scripts/agents/git.mjs
  - scripts/agents/git.test.mjs
  - scripts/agents/integrate.test.mjs
write_paths:
  - scripts/agents/git.mjs
  - scripts/agents/git.test.mjs
  - scripts/agents/integrate.test.mjs
  - project/bugs/BUG-0179-windows-temp-short-path-git-root-check.md
  - project/bugs/README.md
  - project/tasks/TASK-0443-windows-temp-short-path-git-root-check.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/bug-0179-windows-temp-short-path-git-root-check.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Normalize Windows TEMP aliases for agent Git snapshots (BUG-0179)

## Goal and scope

Allow a valid repository root in default Windows TEMP when Node returns the short 8.3 user path while Git returns the long path. Preserve rejection of child directories and unrelated repositories; do not relax root validation.

## Given / When / Then

- Given a Git root whose input path uses a Windows short alias, When `snapshot()` reads Git metadata, Then the canonical paths compare equal and the snapshot succeeds.
- Given a non-root or non-repository path, When `snapshot()` validates it, Then it still rejects the input.

## Must preserve

- Keep the exact repository-root boundary check and clean-worktree contract.
- Avoid string-only lowercasing or broader prefix checks as a substitute for canonicalization.
- Keep current behavior on POSIX and when TEMP points outside another repository.

## Tests and verification

- Add a focused fixture test using the normal OS temp directory; verify it fails before the canonicalization fix and passes after.
- Run the `scripts/agents` Git and integration suites in default TEMP, selected `test:impact`, and `bun run check`.

## Delivery record

- Implementation: use `realpathSync.native()` for both the requested path and Git's `--show-toplevel` before the strict identity comparison.
- Regression: red before the fix; default-TEMP `git.test.mjs` + `integrate.test.mjs` passed 28/28 after the fix.
- Broader `scripts/agents` run: the first parallel run had 2 tests hit their default 5-second timeout (140 passed); a later rerun passed 142/142. The integration file alone also passes 6/6.
- `test:impact`: quality suite passed 727/727.
- `bun run check`: passed.
