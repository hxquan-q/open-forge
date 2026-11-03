---
id: TASK-0442
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0178
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0435]
related_issues: []
related_bugs: [BUG-0178]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 3862e20ac
read_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.test.ts
  - apps/desktop/src/renderer/shared/store/atoms.ts
write_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.test.ts
  - project/bugs/BUG-0178-stale-edit-target-replayed-on-panel-mount.md
  - project/bugs/README.md
  - project/tasks/TASK-0435-edit-target-cross-workspace.md
  - project/tasks/TASK-0442-stale-edit-target-replayed-on-panel-mount.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/bug-0178-stale-edit-target-replayed-on-panel-mount.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Ignore stale AI edit targets on file-panel mount (BUG-0178)

## Goal and scope

Do not treat the global `aiEditTargetAtom` value that predates a file-panel hook instance as new activity. Continue following target updates observed after mount, preserve same-cwd tracking, and leave the cross-cwd guard from BUG-0173 unchanged.

## Given / When / Then

- Given a same-cwd AI target exists before hook mount, When the panel mounts, Then the stale target does not change the current inline preview.
- Given the panel is mounted, When the AI target changes, Then the new target is followed as before.

## Must preserve

- Keep cross-cwd target filtering and `hotTracking=false` behavior.
- Preserve manual browsing until a genuinely new target arrives.
- Do not clear the global target atom as an unmount side effect; other mounted activity consumers may rely on it.

## Tests and verification

- Add a regression case that seeds a same-cwd target before rendering the hook and proves mount does not consume it; then update the target and prove new activity is followed.
- Run the focused hook suite, selected `test:impact`, and `bun run check`.
- No real Desktop launch or real project file reads are needed.

## Delivery record

- Implementation: initialize the hook's previous-target ref from the atom value observed on mount. The mount-time stale target is ignored; future target changes remain eligible for normal follow behavior.
- Regression: failed before the fix (old target replaced manual preview), then the focused hook suite passed 7/7.
- `test:impact`: direct 7/7 and related 118/118 passed.
- `bun run check`: passed.
- No real Desktop run was needed for this hook lifecycle contract.
