---
id: TASK-0445
type: task
status: verifying
priority: P2
owner: packages/plugins/plugin-vite
requirement:
plan:
source: BUG-0180
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0180]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 08c28f41b
read_paths:
  - packages/plugins/plugin-vite/test/build-shared-react.test.ts
  - packages/plugins/plugin-vite/src/index.ts
write_paths:
  - packages/plugins/plugin-vite/test/build-shared-react.test.ts
  - project/bugs/BUG-0180-plugin-vite-test-selects-bootstrap-chunk.md
  - project/bugs/README.md
  - project/tasks/TASK-0445-plugin-vite-test-selects-bootstrap-chunk.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Select the exposed chunk in the plugin-vite shared React test (BUG-0180)

## Goal and scope

Make the shared-React production-build test import the fixture's actual exposed entry chunk rather than whichever `index-*.js` happens to appear first in directory enumeration. Preserve the assertion that transitive CommonJS imports use the host-provided React singleton.

## Given / When / Then

- Given the federation build emits a bootstrap plus a separate exposed chunk, When the test locates its import target, Then it selects the chunk exporting the fixture's captured React bindings.
- Given the actual exposed chunk inlines a second React binding, When evaluated against the host share cache, Then the contract assertion still fails.

## Must preserve

- Do not weaken or remove the shared React identity assertion.
- Do not rely on filesystem enumeration order or generated hash names.
- Keep temporary build output isolated and cleaned by the existing fixture lifecycle.

## Tests and verification

- Confirm the old selector fails because it imports the small bootstrap chunk.
- Change selection to identify the fixture entry by its exposed exports, run the focused test and full plugin-vite suite.
- Run selected `test:impact` and `bun run check`.

## Delivery record

- Changed test artifact selection to locate the emitted chunk containing the fixture's `capturedUseState` export; the React singleton identity assertion remains intact.
- The focused test passes; full plugin-vite package suite passes 46/46.
- `test:impact`: focused test 2/2 passed; full plugin-vite package suite passed 46/46.
- `bun run check`: passed.
