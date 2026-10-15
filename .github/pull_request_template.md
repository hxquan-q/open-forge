<!--
  Target branch: `dev` (not `main`).
  Use Fixes / Closes / Resolves so the linked issue closes on merge.
  Delete the Fixes line only if this PR genuinely does not close an issue.
-->

Fixes #

## Why

<!-- Why this change exists: the use case and the pain it addresses.
     For non-trivial features, open a Discussion or Issue first. -->

## What users will see

<!-- User-facing description, not code terms. Skip only if you check "None". -->

## Surface area

- [ ] **UI** — new or changed page / dialog / panel / menu / setting / empty state
- [ ] **Keyboard shortcut** — new or changed (must go through the existing keybinding object)
- [ ] **i18n** — new user-visible copy (must go through i18n)
- [ ] **Plugin / skill / theme / marketplace**
- [ ] **Public contract** — IPC, RPC, schema, package export, or persistence format
- [ ] **Default behavior change** — existing users notice without opting in
- [ ] **None** — internal refactor, docs, tests, or translation only

## Structural changes

<!-- Required when "Public contract" is checked; otherwise write "n/a".
     The pr-title workflow also requires the title to match
     `<type>(<scope>): <description>` with a workspace package or domain scope. -->

- Public contract changed? (yes/no):
- Affected consumers / implementations:
- Compatibility impact (additive / breaking / migration needed):
- Migration plan or follow-up:
- Waiver / ADR / OWNERS reference (if the change relies on an exception):

## Validation

<!-- What you actually ran. Default minimum: `bun run check:quick`.
     Behavior changes also need the relevant `bun run test:pkg <name>` or
     `bun run test:changed`. Do not claim checks you did not run. -->

-

## Screenshots

<!-- Required if you checked UI. Show the entry point, not only the feature in isolation. -->
