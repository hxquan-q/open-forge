---
id: TASK-0446
type: task
status: verifying
priority: P2
owner: packages/runtime-node
requirement:
plan:
source: BUG-0181
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0181]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 26e42ef8c
read_paths:
  - packages/runtime-node/test/coding-suite/shared/tool-path-host.test.ts
  - packages/runtime-node/src/coding/shared/path-resolution.ts
write_paths:
  - packages/runtime-node/test/coding-suite/shared/tool-path-host.test.ts
  - project/bugs/BUG-0181-runtime-node-remote-path-tests-use-posix-tmp.md
  - project/bugs/README.md
  - project/tasks/TASK-0446-runtime-node-remote-path-tests-use-posix-tmp.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Use portable local temp fixtures for remote POSIX path tests (BUG-0181)

## Goal and scope

Remove the tests' dependency on a literal `/tmp` directory while preserving their POSIX remote-path semantics and proving that local filesystem names do not affect remote path resolution. Clean all temporary fixture directories after each test.

## Given / When / Then

- Given a Windows or POSIX test host, When the remote POSIX path-host tests create local fixture files, Then they use the operating system's temp directory successfully.
- Given a local curly-quote filename exists, When resolving a remote POSIX path, Then local filesystem correction does not rewrite the remote target.

## Must preserve

- Keep `remotePosixToolPathHost` POSIX path operations and `exists/listDirectory` behavior unchanged.
- Do not skip the remote-host contract on Windows.
- Ensure temporary files are cleaned on success and failure.

## Tests and verification

- Reproduce the current three Windows fixture failures before the change.
- Run `tool-path-host.test.ts`, runtime-node impact tests, and `bun run check`.

## Delivery record

- Replaced hard-coded `/tmp` fixture roots with OS-temp directories, while passing slash-normalized cwd strings through the simulated POSIX host. Added `afterEach` cleanup for all temp fixtures.
- The three Windows baseline failures no longer occur; focused `tool-path-host.test.ts` and impact-selected test both pass 7/7.
- `bun run check`: passed.
- No production path-host behavior changed; this is a test portability repair.
