---
id: BUG-0181
type: bug
status: verifying
priority: P2
owner: packages/runtime-node tests
requirement:
plan:
source: 2026-10-30 Windows `test:changed` failure in `tool-path-host.test.ts`
related_requirement: []
related_plan: []
related_tasks: [TASK-0446]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Remote POSIX path tests hard-code an unavailable `/tmp` directory on Windows

## User-visible impact

No production behavior defect is established. Three runtime-node tests fail on Windows before reaching assertions because their fixtures call `mkdtempSync("/tmp/vetta-path-")`; the Windows host has no `/tmp` directory. This makes the affected package test suite and `test:changed` red on supported Windows development machines.

## Failure evidence

- Windows 11: `tool-path-host.test.ts` fails three cases with `ENOENT: mkdtemp '/tmp/vetta-path-XXXXXX'`.
- The tests intentionally need POSIX path semantics for `remotePosixToolPathHost`, while file fixtures are created on the local filesystem. The fixture can use OS temp storage and pass a slash-normalized cwd string to the POSIX path host.

## Expected behavior

Remote POSIX path contracts run on Windows without relying on a POSIX root directory, while still proving that a local file with a curly-quote name does not influence remote path correction or diagnostics.

## Regression test

Run `test/coding-suite/shared/tool-path-host.test.ts` on Windows; all seven tests should reach their assertions and pass. Keep the test fixtures cleaned after each run.

## Repair status

- Fix: fixtures now create files under Node's OS temp root, pass a slash-normalized cwd to the simulated POSIX host, and remove all temporary directories after each test.
- Verification: the original Windows failures were red 3; the focused test and impact run pass 7/7.
- `bun run check`: passes.
- Product impact remains unconfirmed; this repairs Windows test portability only.
