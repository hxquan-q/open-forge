<!-- Modified by The Open Forge contributors. -->
# Open Forge Quickstart

[English](QUICKSTART.md) · [简体中文](QUICKSTART.zh-CN.md)

## Use an installer

Choose an asset for your operating system and architecture from [GitHub Releases](https://github.com/hxquan-q/open-forge/releases). The source version may be newer than the latest downloadable release.

After installation, configure a model provider, open a project directory, and create a conversation. Follow [your first task](apps/docs-site/content/docs/en/getting-started/first-task.mdx) to inspect execution and verify the result.

## Run the desktop app from source

Install **Bun 1.3.14**, **Node.js 20+**, and Git. Run:

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
bun run --cwd apps/desktop dev
```

The desktop command starts the renderer, theme development server, and Electron. Keep its terminal open while using the app. The repository root's `bun run dev` only watches core libraries.

Default development uses lite mode. Configure your own model endpoint and credentials; no Open Forge account is required. Full mode needs a compatible backend configured separately.

The default brand profile displays **Allstr ai / 小爱ai**. For the Open Forge display name, set `VETTA_BRAND_PROFILE=self` in `apps/desktop/.env.development`, then restart development. Packaging uses the corresponding `.env.<mode>`. Brand selection does not change lite/full or the data directory. See [build configuration](docs/desktop/build-modes.en.md).

## Data directories

| Instance | Default data root |
| --- | --- |
| Installed desktop app | `~/.openforge` |
| Ordinary desktop development | `~/.openforge-dev` |

See [configuration paths](apps/docs-site/content/docs/en/reference/configuration-paths.mdx) for overrides and migration. `dev:home` explicitly uses installed-app data; use ordinary `dev` for development isolation.

## Work on documentation

From the repository root:

```bash
bun run --cwd apps/docs-site dev
```

The site uses port 4321 by default. Public content lives in `apps/docs-site/content/docs/`, with English pages under `en/`. The [site README](apps/docs-site/README.md) describes content structure and checks.

## Validate a change

```bash
bun run check:quick
bun run test:pkg ai
bun run test:impact -- <file...>
bun run check
```

Choose tests for the affected behavior; `ai` is an example package. List supported packages with `bun run test:pkg --list`. Use repository runners instead of invoking `bun test` directly. Full `check` covers lint, types, and guards; it does not run tests.

Continue with [Contributing](CONTRIBUTING.md), the [documentation map](docs/README.md), or [troubleshooting](apps/docs-site/content/docs/en/troubleshooting.mdx).
