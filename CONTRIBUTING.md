<!-- Modified by The Open Forge contributors. -->
# Contributing to Open Forge

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-CN.md)

Contributions belong to the client stack maintained in this repository: desktop and companion apps, Agent runtime, models, extensions, and documentation. Business backend changes are maintained separately.

## Choose the right location

| Change | Location |
| --- | --- |
| Desktop UI or host behavior | `apps/desktop/` |
| CLI, mobile, or transport application | The owning directory in `apps/` |
| Reusable Agent, model, runtime, or capability behavior | The owning package in `packages/` |
| Plugin or theme | `packages/plugins/` or `packages/themes/` |
| User-facing instructions | `apps/docs-site/content/docs/` and its `en/` mirror |
| Engineering manual | The relevant section of `docs/` |
| Requirements, tasks, bugs, and verification | `project/` |

Use the [documentation map](docs/README.md) to locate the owner. Applications depend on packages; packages must not import application internals. Cross-package imports use public `package.json#exports`.

## Prepare the change

1. Read [AGENTS.md](AGENTS.md) and the nearest rules and README for the affected directory.
2. Follow [Quickstart](QUICKSTART.md) to install dependencies with Bun.
3. Find or create the relevant [Project task](project/tasks/README.md). Record scope, expected behavior, and validation before implementation.
4. Keep one concern per change. Add a regression test for a bug or behavior change; pure documentation needs checks of facts, commands, and links.

Desktop user-visible strings, including accessibility text, use i18n. Shortcuts belong in configurable keybindings. Update generators or source inputs for generated files.

## Validate and submit

Use the [quality gates](docs/dev/quality-gates.md) and the [testing policy](docs/dev/agent-rules/testing.md) to choose the affected tests. Run the required full `bun run check` for a completed code change; it does not run tests. Desktop UI verification runs only when explicitly requested for the task.

Update the current development version's [release notes](.github/release-notes/README.md). Keep Chinese and English public documentation in sync, and check new or changed links.

Submit development PRs to **`dev`**. Complete the repository PR template with the problem, resulting behavior, and actual validation. Link the relevant task or issue. Use Chinese multiline commit messages and preserve other contributors' changes. See the [development workflow](project/collaboration/development-workflow.md) for branches and integration.

Do not include secrets, user sessions, production configuration, unsolicited telemetry destinations, or unapproved dependency migrations. Plugin permissions must stay explicit and limited to the capability being implemented.

## Support and security

Use this repository's [GitHub page](https://github.com/hxquan-q/open-forge) for the collaboration channels enabled by its maintainers. Describe reproducible problems with the version, platform, steps, expected result, and actual result. Sanitized evidence can be recorded in the relevant Project task.

Security vulnerabilities follow [SECURITY.md](SECURITY.md); sensitive details must stay out of public issues and PRs.

## License

Contributions are licensed under [Apache-2.0](LICENSE). Preserve existing copyright and third-party notices; see [NOTICE](NOTICE).
