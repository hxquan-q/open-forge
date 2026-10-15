<!-- Modified by The Open Forge contributors. -->
# Quickstart

<p align="center"><b>English</b> · <a href="QUICKSTART.zh-CN.md">简体中文</a></p>

This guide runs the independently maintained Open Forge desktop client. Use a released build or this repository's source; the current development version may be newer than the latest installer.

## Use the app

Available installers and their supported platforms:

**→ [GitHub Releases](https://github.com/hxquan-q/open-forge/releases)**

Choose a release and an asset for your OS and architecture. Packaging support in the source does not guarantee an asset exists in every release. After installation, configure a BYOK model and the permissions needed for your task. Product guides live in [`apps/docs-site/content/docs/`](apps/docs-site/content/docs/).

Without cloud configuration, development uses the **lite** build: no Open Forge login or subscription is needed. A **full** build requires an explicitly configured compatible backend maintained outside this repository; follow its distributor's setup only when using that build. See [Build Modes](docs/desktop/build-modes.en.md).

The repository and docs use **Open Forge**. Desktop defaults to the `distribution` profile: **Allstr ai** with a localized Chinese display name. To use the Open Forge display name, set `VETTA_BRAND_PROFILE=self` in `apps/desktop/.env.development` and restart development processes; use the relevant `.env.<mode>` when packaging. This setting does not change lite/full or switch data directories.

## Develop from source

Requires **Bun 1.3+** and **Node 20+**. macOS, Windows, and Linux are supported.

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
```

### Desktop app

```bash
cd apps/desktop
bun run dev
```

That starts the Vite renderer, the theme dev server, and Electron together. The process uses `~/.openforge-dev`, so your installed-app data in `~/.openforge` is left alone.

| Command | Data root | When to use it |
|---|---|---|
| `bun run dev` | `~/.openforge-dev` | Default sandbox |
| `bun run dev:home` | `~/.openforge` | You want the dev build to read and write real user data |

`bun run dev` **at the repository root** only watches core libraries. It does not launch the app.

### Documentation site

```bash
bun run --cwd apps/docs-site dev
```

Opens on `http://127.0.0.1:4321`. Public docs live in `apps/docs-site/content/docs/`.

### Checks you will actually run

```bash
bun run check:quick        # Biome + architecture guards on changed files
bun run check              # lint + types + guards, before a PR
bun run test:pkg ai        # one package; `bun run test:pkg --list` shows names
```

Do not run bare `bun test`. On Windows it is the wrong runner; use `bun scripts/quality/run-vitest.mjs --run <file>` or `bun run test:pkg`.

Packaging, environment variables, and the lite/full flag: [Build Modes](docs/desktop/build-modes.en.md). Contribution map and PR bar: [CONTRIBUTING.md](CONTRIBUTING.md).
