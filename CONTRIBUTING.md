<!-- Modified by The Open Forge contributors. -->
# Contributing to Open Forge

<p align="center"><b>English</b> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a></p>

Thanks for considering a contribution. This repository is the open-source client: desktop app, CLI, docs site, plugin SDK, themes, and the agent core. The commercial server lives elsewhere and is out of scope here.

The highest-leverage contributions are usually one folder — a plugin, a skill, a theme, a marketplace entry, or a docs page — not a framework rewrite. This guide tells you where each kind of change goes and what a PR has to clear.

Questions, half-formed ideas, and “is this still maintained?” belong in the community [Discord](https://discord.gg/qGqkk22Vg9), not Issues. (Placeholder: GitHub Discussions is not yet enabled on this repository.)

---

## One afternoon, one PR

| If you want to… | You are adding | Where it lives | Size |
|---|---|---|---|
| Add a desktop plugin | a plugin package | [`packages/plugins/`](packages/plugins/) · handbook in [`docs/plugin/`](docs/plugin/) · public guide at [the docs site](apps/docs-site/content/docs/plugins/getting-started.mdx) | one package + `plugin.json` |
| Add a reusable way of working | a skill | [`packages/skill-presets/`](packages/skill-presets/) or a GitHub marketplace source — see [`docs/open-marketplace.md`](docs/open-marketplace.md) | one folder with `SKILL.md` |
| Change how the app looks | a theme | [`packages/themes/`](packages/themes/) · [`docs/theme/`](docs/theme/) · [theme guide](docs/theme/README.md) | one theme package |
| Publish an installable ability | a marketplace entry | the official marketplace repository (placeholder — a fork-operated marketplace is not published yet), using [the marketplace format](docs/open-marketplace.md) | one directory + manifest row |
| Improve product or developer docs | a docs page | [`apps/docs-site/content/docs/`](apps/docs-site/content/docs/) | one MDX file |
| Translate UI copy | i18n strings | desktop locale catalogs; never hardcode user-visible text | one PR |
| Fix a bug or add a product feature | code | `apps/` or `packages/` that already own the behavior | normal PR |

If you are not sure which row you are in, ask in the [Discord](https://discord.gg/qGqkk22Vg9) first.

---

## Local setup

The short path is in [`QUICKSTART.md`](QUICKSTART.md). TL;DR:

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install                 # Bun 1.3+
cd apps/desktop
bun run dev                 # Vite renderer + Electron, isolated in ~/.openforge-dev
```

Do **not** run `bun run dev` or `bun run build` at the repository root — those compile libraries, they do not launch the app. Do **not** run bare `bun test`; use `bun run test:pkg <name>` or `bun scripts/quality/run-vitest.mjs --run <file>`.

---

## Pull requests

Open PRs against **`dev`**, not `main`. `dev` is the integration branch; `main` tracks a slower snapshot.

- **One concern per PR.** A skill + a refactor + a dependency bump is three PRs.
- **Fill the PR template.** Empty “Why” / “Validation” sections come back for revision.
- **Reference the work item** when there is one (`Fixes #N`, or the `TASK-xxxx` ledger entry in `project/tasks/`). Non-trivial features should have a task record or Discord thread first.
- **User-visible copy goes through i18n**, including labels, placeholders, menus, and aria text.
- **Shortcuts** belong in the existing keybinding object, not hardcoded in business logic.
- **Commit messages are written in Chinese.** Reference issues with `fixes #N` / `closes #N`.
- Push fixups during review; do not force-push a shared branch unless a reviewer asked.

We do not require a CLA. Contributions are licensed under [Apache-2.0](LICENSE), same as the repository.

### Validation bar

| Kind of change | Minimum before you open the PR |
|---|---|
| Docs, copy, templates, comments | Check links, commands, and paths in the files you touched |
| Bug fix or behavior change | A test that would have failed on the old code, plus `bun run check:quick` and the relevant `bun run test:pkg <name>` |
| Public contract (IPC, schema, export, persistence) | Producers, consumers, and a contract test |
| UI interaction | Component/interaction tests at the affected layer; `verify:ui:*` is not a default PR requirement and is used only when an issue or reviewer explicitly requests it |

Do not claim a check you did not run. `bun run check` is lint + types + architecture guards; it does not replace tests.

Agent-facing engineering rules (package boundaries, coding-agent layering, Desktop i18n, quality gates) live in [`AGENTS.md`](AGENTS.md) and [`docs/dev/quality-gates.md`](docs/dev/quality-gates.md). Follow those when you change code; this file is the external contribution map.

---

## What we do not accept

Please do not open PRs that:

- **Add a new telemetry or analytics destination** that is on by default in a source build. Telemetry is opt-in at build time; see [Data and build modes](README.md#data-and-build-modes).
- **Commit secrets**, tokens, cookies, user sessions, or production config. Same rule for logs and fixtures.
- **Depend the other way** — `packages/*` must not import `apps/*`. Use each package’s public `package.json#exports`.
- **Rewrite the stack** (new package manager, new renderer framework, new agent loop) without a prior discussion (task record or Discord thread).
- **Silently widen plugin permissions** or host capabilities. Plugins are an untrusted boundary; declare the minimum set.
- **Hand-edit generated files.** Change the generator or the source of truth.

If you are unsure, ask before writing the code (Discord or a task record).

---

## Security

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md). (Placeholder: the private reporting channel is not yet enabled on this repository; do not file public issues.)

---

## License

By contributing, you agree your contribution is licensed under the [Apache-2.0 License](LICENSE) of this repository.
