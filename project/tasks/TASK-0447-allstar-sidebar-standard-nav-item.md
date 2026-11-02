---
id: TASK-0447
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0027
source: user-request
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0422]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: main checkout（不拆 Worktree）
base_commit: bdbf017e9d76e9449c55511bd19ceb4b8824a3aa
read_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/sidebar-nav-layout.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.workspace-view.test.tsx
  - packages/theme-sdk/src/sidebar/types.ts
  - packages/theme-ui/src/sidebar/DefaultSidebar.tsx
  - packages/theme-ui/src/sidebar/SidebarNavigation.tsx
  - packages/theme-ui/src/sidebar/SidebarNavigation.test.tsx
write_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/sidebar-nav-layout.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/sidebar-nav-layout.test.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.workspace-view.test.tsx
  - packages/theme-sdk/src/sidebar/types.ts
  - packages/theme-ui/src/sidebar/DefaultSidebar.tsx
  - packages/theme-ui/src/sidebar/SidebarNavigation.tsx
  - packages/theme-ui/src/sidebar/SidebarNavigation.test.tsx
  - project/requirements/REQ-0030-allstar-dev-section.md
  - project/tasks/TASK-0447-allstar-sidebar-standard-nav-item.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/allstar-dev-section-home.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: done
created: 2026-11-02
updated: 2026-11-02
---
<!-- Copyright The Open Forge contributors. -->

# Make Allstar 自主开发 a standard sidebar navigation item

## Goal and scope

Make “Allstar 自主开发” a normal sidebar navigation item instead of a fixed row after “更多”. Its default position follows the “原型设计” workspace view; it uses the same persisted pinned / more layout, pinning, unpinning, and drag-reordering behavior as other entries. Increase the pinned limit to six items including “新会话”, so all current default entries fit without displacing one another.

### Concurrency assessment

- Conclusion: not supported; this changes one shared navigation contract across Desktop, theme-sdk, and theme-ui.
- Execution: serial in the existing main checkout.
- Parallel tasks: none.
- Dependencies: REQ-0030 / TASK-0422.
- Conflicting files / exclusive paths: sidebar model and theme sidebar contract are edited as one atomic slice.
- Branch: main.
- Worktree: none; shared main checkout.
- Integration owner: coordinator.
- Integration order: update contract and layout model, then Desktop navigation model and tests, then release notes and verification.

### In scope

- Add the Allstar entry to the regular sidebar navigation catalog immediately after the Prototype Design workspace-view entry.
- Preserve the existing `/allstar` route, label, icon, and active conditions for the Allstar page, coding new-session context, and active coding session.
- Make the entry participate in the normal pinned / more layout persistence and navigation customization interactions.
- Raise `MAX_PINNED_NAV_ITEMS` from five to six (the count includes “新会话”).
- Remove the obsolete fixed-section-entry fields and rendering path from theme-sdk and theme-ui.
- Preserve existing user ordering; the new entry follows its catalog default only when the user has not placed it in a stored layout.

### Out of scope

- Changing Allstar route behavior, workspace-mode semantics, label/icon, or the contents of the Allstar page.
- Reordering or changing the default status of other navigation items.
- Running `verify:ui:*` or launching the Desktop app; the user has not requested real-app UI verification.

## Given / When / Then

- Given the default sidebar layout and the Prototype Design view is registered, When the sidebar is shown, Then Allstar 自主开发 appears immediately after Prototype Design in the pinned navigation, and six total pinned positions including “新会话” are available.
- Given Allstar 自主开发 is in the pinned navigation, When the user moves it to “更多” or reorders it using the existing navigation customization, Then the layout is persisted and subsequent renders honor the user's choice.
- Given Allstar 自主开发 is visible in either navigation region, When the user selects it, Then the app navigates to `/allstar`; `/allstar`, a coding new-session context, and an active coding session expose the same active state as before, while a work session does not.

## Must preserve

- “Allstar 自主开发” remains the sole entry that enters coding mode; ordinary new-session routes retain their existing behavior.
- User-customized pinned / more membership and ordering for existing items are not reset.
- The “新会话” item remains locked at the first position; “更多选项” remains locked at the end of the more list.
- Sidebar labels remain i18n-backed and use the existing nav item visual/accessibility behavior.

## Tests and verification

- Focused behavior tests: sidebar layout capacity and standard persistence; Desktop sidebar model ordering, click routing, and active conditions; theme-ui standard-item rendering/click/drag affordance.
- Representative flow: default navigation renders Allstar after Prototype Design → select Allstar → `/allstar` becomes active; user can move it to “更多” and the active more trigger reflects the current route.
- Targeted impact: `bun run test:impact -- <changed source and test files>`.
- Quality: `bun run check:quick -- <changed files>` if not superseded by final full check, followed by `bun run check`.
- UI verification: not run unless separately requested.

## Acceptance layers

- Engineering validation: targeted tests and impacted package suites passed; full `bun run check` remains blocked by pre-existing expired WAIVER-0006 and WAIVER-0007.
- Technical review: self-review completed; standard nav contract replaces the obsolete fixed-row path.
- Integration: done; code, tests, fragment, and ledger committed locally on `chenxvhua` (base `bdbf017e9`); not pushed — push is user-managed.
- Manual feature acceptance: pending user acceptance; `verify:ui:*` was not run.
- Release: tag `v0.1.4` already exists and its published notes are immutable; the section entry never shipped in a tagged release, so the pending `fragments/v0.1.5/allstar-dev-section-home.md` was updated in place to describe the final standard-nav placement instead of adding a second fragment.

## Delivery record

- Actual changes: Allstar is a regular sidebar catalog item following the Prototype Design view by default; it retains its route and active rules, participates in pinned/more layout persistence and reordering, and the pinned limit is six. Removed the obsolete theme-sdk/theme-ui fixed section-entry contract.
- Actual verification: Desktop focused sidebar tests 40/40; theme-ui focused navigation test 1/1; `bun run test:impact -- <8 changed source/test paths>` passed (externals/kanban 102, theme-ui 237, xianxia 1, Desktop 6,310; 4 skipped files / 19 skipped tests). `bun run check` lint, type checks, mobile lint, and other guards passed; overall exit 1 only because existing WAIVER-0006 and WAIVER-0007 expired. `bun run check:quick` likewise reached all guards and was blocked only by those waivers; Biome passed for all 11 explicit files. Relay re-verification (2026-11-02, post-interruption): Desktop sidebar suites re-run 40/40, theme-ui navigation 1/1, unchanged tree.
- Not run and reasons: real Desktop / `verify:ui:*` was not authorized. Release note: `v0.1.4` is tagged and immutable, and the section entry never shipped in a tagged release, so the pending v0.1.5 fragment was updated in place rather than adding a v0.1.4/v0.1.5-duplicate fragment; `release:desktop:patch` was not run because it requires a clean worktree and the current quality guard is blocked.
- Git: integrated as a single local commit on `chenxvhua` (code + tests + REQ-0030 + ledger + README + v0.1.5 fragment); no tag, no push, no remote operation — push is user-managed.
- Worktree: no separate Worktree; serial main checkout.
- Remaining risks: visual/manual acceptance remains pending; full repository check remains red until the two expired waivers (WAIVER-0006, WAIVER-0007) are resolved or renewed by their owners; v0.1.5 release preparation (notes assembly, version bump) is a separate task (TASK-0423 scope).
