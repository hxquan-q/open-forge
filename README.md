<!-- Modified by The Open Forge contributors. -->
<p align="center">
  <img src="docs/assets/open-forge-banner.svg" alt="Open Forge">
</p>

<h1 align="center">Open Forge</h1>

<p align="center">
  An open-source desktop AI agent for real work — local-first, extensible, and under your control.
</p>

<p align="center">
  <a href="https://github.com/hxquan-q/open-forge/releases"><img src="https://img.shields.io/badge/download-GitHub%20Releases-2da44e" alt="Download from GitHub Releases"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="macOS, Windows, and Linux">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Discord-join%20the%20community-5865F2?logo=discord&logoColor=white" alt="Join the Open Forge Discord"></a>
</p>

<p align="center">
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

---

Open Forge brings models, project files, local tools, and reusable capabilities into one desktop workspace. Use it for coding, documents, data, research, creative work, and repeatable workflows without giving up control of the environment where the work happens.

It is more than a chat interface: Open Forge can inspect a workspace, use tools with visible permission boundaries, produce real files, and keep the execution trail available for review.

The repository and documentation use **Open Forge**. Desktop defaults to the `distribution` brand profile, displayed as **Allstr ai** with a localized Chinese name. Set `VETTA_BRAND_PROFILE=self` explicitly for the Open Forge display name. Brand profiles are independent of the lite/full cloud-service flag and share compatibility identities and data directories. See [build modes](docs/desktop/build-modes.en.md) for the self profile.

## Why Open Forge

| | What it means |
|---|---|
| **Local-first workspace** | Projects, sessions, files, and execution live in the environment you choose. |
| **Bring your own models** | Connect supported providers, OpenAI-compatible endpoints, or local inference through BYOK. |
| **Real tools and artifacts** | Work with code, documents, spreadsheets, media, commands, and generated files in one task flow. |
| **Reviewable execution** | Tool calls, plans, permissions, progress, results, and recovery paths remain visible. |
| **Reusable workflows** | Extend the agent with skills, MCP servers, plugins, themes, knowledge, batch tasks, and automation. |
| **Open client stack** | The desktop app, CLI, SDK, plugin system, themes, mobile client, and IM gateway are developed in this repository. |

## Get Open Forge

Prebuilt builds for tagged releases are published on [GitHub Releases](https://github.com/hxquan-q/open-forge/releases) for macOS, Windows, and Linux.

### Run from source

Requires **Bun 1.3+** and **Node.js 20+**.

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
cd apps/desktop
bun run dev
```

A source checkout produces the **lite** build by default: no account, no subscription, no hosted services. Model requests go to the endpoint you configure, and credentials remain in local credential storage. Build modes and environment variables are documented in [`docs/desktop/build-modes.en.md`](docs/desktop/build-modes.en.md).

The development app uses `~/.openforge-dev`, keeping installed-app data in `~/.openforge` untouched. Root-level `bun run dev` watches core libraries; it does not launch Electron. See [`QUICKSTART.md`](QUICKSTART.md) for the complete setup and validation commands.

## What you can do

- **Work in projects and sessions.** Keep task history, files, context, artifacts, and execution details together.
- **Use local and external tools.** Run commands, inspect files, connect MCP services, and approve sensitive operations explicitly.
- **Handle professional artifacts.** Preview and work with source code, PDF, Office files, spreadsheets, images, audio, video, SVG, and generated UI.
- **Scale a proven task.** Run the same workflow across directories with batch tasks, or schedule it as an automation.
- **Reuse organizational knowledge.** Build local knowledge bases and install reusable skills or scenarios.
- **Keep working away from the desk.** Use supported IM bridges, webhooks, notifications, quick entry, and native desktop integrations.

The [product guide](apps/docs-site/content/docs/product/overview.mdx) covers the capability areas. Its screenshots illustrate workflows; display names and appearance depend on the selected brand profile and build.

## Extension model

Open Forge exposes several extension levels so a simple workflow does not need to become a full plugin:

| Extension | Use it for | Guide |
|---|---|---|
| **Skill** | Teach the agent a repeatable method or domain workflow. | [Abilities](apps/docs-site/content/docs/product/abilities.mdx) |
| **MCP** | Connect external tools and data over a standard protocol. | [MCP connectors](apps/docs-site/content/docs/product/mcp.mdx) |
| **Plugin** | Extend the desktop UI, files, messages, tools, and host actions. | [Plugin development](apps/docs-site/content/docs/plugins/overview.mdx) |
| **Theme** | Replace the visual system and provide theme-specific pages. | [Theme development](docs/theme/README.md) |
| **SDK / RPC / CLI** | Embed or drive the agent from another application or process. | [Developer paths](apps/docs-site/content/docs/developers/overview.mdx) |

### Build a plugin from any directory

You do not need this repository, or an Open Forge source checkout, to build a plugin. Nor does an agent:

```bash
npx @vetta-org/plugin-cli init --id my-plugin --name "My Plugin"
cd my-plugin && npm install
npx vetta-plugin-cli docs        # where the manual is, and which SDK version it documents
npm run install:vetta            # build, package, install into the running desktop app
npx vetta-plugin-cli watch       # hot reload: the host loads the plugin from this directory
```

`init` also writes an `AGENTS.md`, so **any** coding agent — Claude Code, Cursor, or Open Forge's own — picks the project up without host-side setup. The plugin manual ships inside `@vetta-org/plugin-sdk`, so the contract an agent reads is the contract the project compiles against; `docs` locates it rather than anyone hard-coding a `node_modules` path.

To publish several abilities from one repository, scaffold a marketplace:

```bash
npx @vetta-org/plugin-cli init hub --name my-market \
  --repository https://github.com/me/my-market --min-app-version 0.1.3
```

`0.1.3` is the current Desktop version used as an example. Set the oldest Open Forge version you have verified; do not reuse the upstream `0.55.x` version line.

That lays down the index, the `abilities/` layout, a repository-level `AGENTS.md`, and CI running `vetta-plugin-cli sync --check`, which keeps `.vetta/marketplace.json` reconciled with each ability package. Development commands always act on the nearest ability directory, so working inside a marketplace is identical to working on a standalone plugin.

Plugins declare capabilities in `plugin.json`; privileged operations are authorized by the host and checked again at runtime. Plugins run inside the desktop renderer and should be treated as curated code, not as an arbitrary-code sandbox. Read the [plugin trust and permission model](apps/docs-site/content/docs/plugins/manifest-and-permissions.mdx) before distributing one.

## Data and build modes

A source checkout produces the **lite** build by default. It has no dependency on an Open Forge-operated backend: no account, subscription, remote administration, or hosted marketplace is required. Published installers may enable the optional Open Forge Serv integration for accounts, subscriptions, and a hosted marketplace; that integration is selected at build time and never silently enabled in a lite build.

Local-first does not mean zero network traffic. Model providers, MCP servers, plugins, webhooks, IM integrations, update sources, and optional telemetry can each create their own data boundary. Review:

- [Security and data boundaries](apps/docs-site/content/docs/reference/security-and-data.mdx)
- [Configuration paths](apps/docs-site/content/docs/reference/configuration-paths.mdx)
- [Build modes and environment variables](docs/desktop/build-modes.en.md)
- [Security policy](SECURITY.md)

## Repository map

This is a Bun/TypeScript monorepo with additional Kotlin, Go, and Cloudflare Worker applications. Dependencies point from applications toward reusable packages; `packages/*` never depend on `apps/*`.

| Area | Responsibility |
|---|---|
| [`apps/desktop`](apps/desktop) | Electron desktop host and renderer |
| [`apps/cli-host`](apps/cli-host) | CLI host for the coding agent |
| [`apps/docs-site`](apps/docs-site) | Next.js documentation site |
| [`apps/mobile`](apps/mobile) | Expo/React Native mobile client |
| [`apps/kotlin`](apps/kotlin) | Kotlin Multiplatform Android client |
| [`apps/im-gateway`](apps/im-gateway) | Go IM sidecar gateway |
| [`apps/remote-relay`](apps/remote-relay) | Cloudflare Worker relay for the mobile-to-desktop remote-control protocol |
| [`apps/ssh-helper`](apps/ssh-helper) | Static helper binary uploaded over SSH for remote projects |
| [`packages/ai`](packages/ai) · [`packages/agent`](packages/agent) | Provider abstraction and the agent loop |
| [`packages/coding-agent`](packages/coding-agent) · `packages/runtime-*` | Product composition, runtime contracts, tools, storage, MCP, and host adapters |
| [`packages/plugins`](packages/plugins) · [`packages/themes`](packages/themes) | Extension SDKs, presets, and themes |

Architecture details and public integration contracts live in the [developer documentation](apps/docs-site/content/docs/developers/architecture.mdx) and [`docs/adr/`](docs/adr/).

## Develop and contribute

Use Bun and the repository scripts; do not run bare `bun test` in this monorepo.

```bash
bun run check:quick              # changed-file lint and architecture guards
bun run check                    # full lint, types, and architecture guards
bun run test:pkg <package-name>  # focused package tests
bun run test:changed             # tests affected by the current diff
```

Pull requests target the **`dev`** branch. The contribution map, test expectations, and review bar are in [`CONTRIBUTING.md`](CONTRIBUTING.md). Architecture and Agent collaboration rules are in [`AGENTS.md`](AGENTS.md).

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md) for the reporting channel, scope, and what to include.

## Documentation

- [Documentation map and historical scope](docs/README.md)
- [Product guide and capability reference](apps/docs-site/content/docs/product/overview.mdx)
- [First-task walkthrough](apps/docs-site/content/docs/getting-started/first-task.mdx)
- [Plugin development](apps/docs-site/content/docs/plugins/overview.mdx) · [plugin SDK internals in `docs/plugin/`](docs/plugin/README.md)
- [Theme development](docs/theme/README.md)
- [SDK, RPC, CLI, and architecture](apps/docs-site/content/docs/developers/overview.mdx)
- [`QUICKSTART.md`](QUICKSTART.md) for repository setup · [`CONTRIBUTING.md`](CONTRIBUTING.md) for contributions
- [`docs/adr/`](docs/adr/) for architecture decisions

The documentation site lives in [`apps/docs-site`](apps/docs-site); run it locally with `bun run --cwd apps/docs-site dev`.

## Community

Join the Open Forge Discord to ask questions, share workflows, skills, plugins and themes, follow release news, and talk to the maintainers.

<p align="center">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Open%20Forge-Discord-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Open Forge Discord"></a>
</p>

**https://discord.gg/qGqkk22Vg9**

## Credits and license

Open Forge is an independently maintained derivative of Open Vetta. It builds on work from the wider open-source ecosystem, including pi, Codex CLI, MCP, Electron, React, Bun, models.dev, and the projects listed in [`NOTICE`](NOTICE). The complete third-party inventory and original notices live there.

Licensed under [Apache-2.0](LICENSE).

- **Friends & Links:** [LINUX DO](https://linux.do/) - A Chinese community for technology enthusiasts. This project is linked with and endorsed by LINUX DO.
