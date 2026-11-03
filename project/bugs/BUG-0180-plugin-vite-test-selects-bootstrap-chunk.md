---
id: BUG-0180
type: bug
status: verifying
priority: P2
owner: packages/plugins/plugin-vite
requirement:
plan:
source: 2026-10-30 `test:changed` isolated reproduction
related_requirement: []
related_plan: []
related_tasks: [TASK-0445]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# plugin-vite React sharing test selects the federation bootstrap chunk

## User-visible impact

No production failure is established yet. The `plugin-vite` test can fail deterministically before checking the React singleton contract because it imports a federation bootstrap/runtime chunk instead of the fixture's exposed entry chunk. This causes a false-red package suite and obscures the actual production contract.

## Failure evidence

- `test/build-shared-react.test.ts` selects the first `index-*.js` from `readdir()` and imports it expecting `capturedUseState` / `capturedSelector` exports.
- Isolated test run fails at `capturedUseState === useState`.
- Temporary diagnostic showed selected `index-*.js` was 583 bytes, only a federation bootstrap that imports another `index-*.js` chunk and exports its initializer; it does not contain the fixture exports.
- The actual exposed entry chunk must be identified by its exports/content rather than directory enumeration order.

## Expected behavior

The test should import the exact generated chunk that exposes the fixture exports, then assert its CommonJS-transitive React reference resolves to the host shared React instance. It must fail if the real exposed chunk violates that contract.

## Regression test

Select an output chunk that actually contains the fixture's exposed `capturedUseState` / `capturedSelector` exports, and assert such a chunk exists before import.

## Repair status

- Fix: the test now searches built `index-*.js` chunks for the fixture's `capturedUseState` export instead of importing the first directory entry.
- Verification: focused test and `test:impact` pass; full `plugin-vite` package suite passes 46/46; `bun run check` passes.
- Product impact remains unconfirmed; this failure was in test artifact selection, not evidence of a shipped React runtime defect.
