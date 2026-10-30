---
id: TASK-0441
type: task
status: verifying
priority: P2
owner: runtime-node
requirement:
plan:
source: BUG-0111
related_requirement: []
related_plan: []
related_tasks: [TASK-0249]
related_issues: []
related_bugs: [BUG-0111]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 1da0cb64a
read_paths:
  - packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts
  - packages/runtime-node/test/coding-suite/vetta-desktop-command-port.test.ts
  - apps/desktop/src/shared/desktop-brand.json
  - apps/desktop/src/shared/desktop-brand.distribution.json
  - apps/desktop/scripts/linux-packaging-contract.mjs
  - apps/desktop/build/installer.iss
write_paths:
  - packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts
  - packages/runtime-node/test/coding-suite/vetta-desktop-command-port.test.ts
  - project/bugs/BUG-0111-desktop-executable-fallback-paths-stale.md
  - project/bugs/README.md
  - project/tasks/TASK-0441-desktop-executable-fallback-paths.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/bug-0111-desktop-executable-fallback-paths.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Desktop fallback executable paths match packaged identity (BUG-0111)

## Goal and scope

Replace the obsolete Vetta executable fallback candidates with paths used by current Open Forge / Allstr ai installers. Keep explicit `VETTA_DESKTOP_EXE` and persisted `vettaAppPath` precedence, stale-config diagnostics, and platform-neutral failure wording unchanged.

## Given / When / Then

- Given the environment override and saved path are absent or stale, When the runtime locates Desktop, Then it checks the current Windows install path and the branded macOS/Linux app paths.
- Given a configured or environment path exists, When locating, Then that path continues to take precedence over fallback candidates.

## Must preserve

- Do not inspect machine-specific registries or introduce platform dependencies.
- Cover both supported display-name profiles while keeping the frozen `OpenForge` executable name.
- Keep fallback candidates in runtime-node; do not add a dependency from runtime-node to the Desktop application package.
- Preserve current explicit configuration precedence and user-facing diagnostics.

## Tests and verification

- Add a contract test that captures all default candidate paths for Windows, macOS, and Linux against the installer identity.
- Run the focused runtime-node command-port suite, relevant `test:impact`, and `bun run check`.
- Do not launch Desktop or run PDF/OCR against user files; packaged app availability remains an acceptance check.

## Delivery record

- Implementation: replaced legacy Vetta fallback paths with the current Windows `Programs/OpenForge/OpenForge.exe` identity and the two supported branded macOS/Linux locations. Explicit environment and saved paths retain precedence.
- Regression: candidate contract was red (4 failing cases) before the implementation; the focused command-port suite is now 9/9 green.
- `test:impact`: direct 9/9 passed; related 246 passed and 10 failed due to missing `rg` and POSIX `/tmp` fixtures on Windows, unrelated to executable lookup.
- `bun run check`: passed.
- Not performed: no packaged Desktop was launched; artifact reachability still needs manual acceptance.
