<!-- Modified by The Open Forge contributors. -->
<p align="center">
  <img src="docs/assets/open-forge-banner.svg" alt="Open Forge">
</p>

<h1 align="center">Open Forge</h1>

<p align="center">
  An independently maintained desktop Agent project for reviewable engineering workflows.
</p>

<p align="center">
  <a href="https://github.com/hxquan-q/open-forge/releases"><img src="https://img.shields.io/badge/download-GitHub%20Releases-2da44e" alt="Download from GitHub Releases"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="macOS, Windows, and Linux build targets">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Discord-join%20the%20community-5865F2?logo=discord&logoColor=white" alt="Join the Open Forge Discord"></a>
</p>

<p align="center">
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

---

**Open Forge is an independently maintained project built from the Open Vetta client stack.** This repository contains the desktop app, Agent runtime, CLI, extension tooling, and companion application source. Development here focuses on engineering workflows, agent teams, remote projects, model integration, and recovery from interrupted work.

The desktop workspace retains project sessions, file tools, previews, knowledge bases, batch tasks, and automation. Changes to that foundation are maintained and validated in this repository. The business backend is maintained separately in a private repository.

## What this project develops

| Area | Work maintained in this repository |
| --- | --- |
| **Engineering workflows** | The bundled [allstar-coding plugin](packages/plugins/presets/allstar-coding/README.md) organizes requirements, prototypes, architecture, development, review, and verification into stages, with saved workflow state and tool-scope checks. |
| **Agent teams and sessions** | Team coordination, member messages, session interaction, interrupted-turn recovery, and execution replay. See the [team guide](apps/docs-site/content/docs/en/product/agent-teams.mdx). |
| **Remote projects** | SSH project access and file operations, including local/remote uploads and downloads with progress, cancellation, and conflict handling. See [application environments](apps/docs-site/content/docs/en/product/application-environment.mdx). |
| **Model connections** | BYOK providers and custom endpoints, Responses/Codex transport selection, and fixes to streaming, retries, and interrupted responses. See [model configuration](apps/docs-site/content/docs/en/product/models.mdx). |
| **Daily desktop work** | File previews, fonts, session organization, and native integrations are maintained alongside the runtime. The [user guide](apps/docs-site/content/docs/en/product/overview.mdx) explains the available entry points. |

These are development areas, with implementation and acceptance tracked in [Project](project/README.md). The [0.1.3 release notes](.github/release-notes/v0.1.3.md) describe the current development line; downloadable builds and their supported platforms are listed in [GitHub Releases](https://github.com/hxquan-q/open-forge/releases).

## Names and builds

The repository and documentation use **Open Forge**. Desktop defaults to the `distribution` profile: **Allstr ai** in English and **小爱ai** in Chinese. Set `VETTA_BRAND_PROFILE=self` explicitly for the Open Forge display name. Both profiles share data and installation compatibility identities.

Branding is independent of **lite/full** cloud-service mode. Development defaults to lite when cloud services are not enabled. See [build modes](docs/desktop/build-modes.en.md) for the exact configuration.

## Get and run the project

For an installer, choose an asset from a release in [this repository](https://github.com/hxquan-q/open-forge/releases). Packaging code targets Windows, macOS, and Linux; each release's assets determine which builds are actually available. The development version in source may be newer than the latest downloadable release.

To run the desktop app from source, install **Bun 1.3+** and **Node.js 20+**:

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
cd apps/desktop
bun run dev
```

The default lite development flow uses a model endpoint and credentials you configure, without an Open Forge account or subscription. Development data goes to `~/.openforge-dev`; installed builds normally use `~/.openforge`. Root-level `bun run dev` only watches core libraries. See [Quickstart](QUICKSTART.md) for setup and validation.

Start with a [project and a first task](apps/docs-site/content/docs/en/getting-started/first-task.mdx). Add a team, SSH environment, knowledge base, batch task, or automation when the work calls for it. The guides describe feature conditions and preview limits; screenshots illustrate workflows and may differ from the selected build and brand profile.

## Develop and extend Open Forge

Use this repository's source, exported types, and documentation for the Open Forge version you are targeting.

| Entry | Purpose | Guide |
| --- | --- | --- |
| **Skill** | A reusable method or task workflow | [Abilities](apps/docs-site/content/docs/en/product/abilities.mdx) |
| **MCP** | External tools and data over STDIO or HTTP | [MCP connectors](apps/docs-site/content/docs/en/product/mcp.mdx) |
| **Plugin** | Desktop UI, files, messages, tools, and host actions | [Plugin development](apps/docs-site/content/docs/en/plugins/overview.mdx) |
| **Theme** | Desktop appearance and theme pages | [Theme development](docs/theme/README.md) |
| **SDK / RPC / CLI** | Embed or drive the Agent from another host | [Developer paths](apps/docs-site/content/docs/en/developers/overview.mdx) |

Package names such as `@vetta/*` and `@vetta-org/*`, commands such as `vetta-plugin-cli`, `VETTA_*` configuration, and `.vetta/` / `.vettapkg` formats remain compatibility identifiers. Match the SDK and tooling to this checkout or to a version explicitly verified for the target build. A package with the same name on npm is not by itself evidence that it contains this fork's changes.

Plugins declare permissions in `plugin.json`; the host authorizes privileged actions and checks them at runtime. They execute as curated code inside the desktop renderer. Read the [trust and permission model](apps/docs-site/content/docs/en/plugins/manifest-and-permissions.mdx) before loading or distributing a plugin.

## Data and build modes

The default lite build provides local sessions, BYOK, and supported local extensions without an account, subscription, or hosted marketplace. Model providers, MCP services, plugins, IM bridges, and other integrations still have their own network and data boundaries.

The optional full build includes client integration for accounts and other cloud features. It requires an explicitly configured compatible backend and update service. That backend, its website, billing, and operations are outside this repository; their availability must be confirmed for the selected distribution.

- [Security and data boundaries](apps/docs-site/content/docs/en/reference/security-and-data.mdx)
- [Configuration paths](apps/docs-site/content/docs/en/reference/configuration-paths.mdx)
- [Build modes and environment variables](docs/desktop/build-modes.en.md)
- [Security policy](SECURITY.md)

## Repository map

This Bun/TypeScript monorepo also contains Go, Kotlin, and Cloudflare Worker applications. Desktop is the main entry described above; companion source directories have their own platform, build, and release conditions.

| Area | Responsibility |
| --- | --- |
| [`apps/desktop`](apps/desktop) | Electron desktop host and renderer |
| [`apps/cli-host`](apps/cli-host) | CLI host for the coding Agent |
| [`apps/docs-site`](apps/docs-site) | Public documentation source and Next.js site |
| [`apps/mobile`](apps/mobile) · [`apps/kotlin`](apps/kotlin) | Expo and Kotlin mobile clients |
| [`apps/im-gateway`](apps/im-gateway) | Go IM sidecar gateway |
| [`apps/remote-relay`](apps/remote-relay) · [`apps/ssh-helper`](apps/ssh-helper) | Remote-control relay and SSH helper |
| [`packages/ai`](packages/ai) · [`packages/agent`](packages/agent) | Provider integration and the Agent loop |
| [`packages/coding-agent`](packages/coding-agent) · `packages/runtime-*` | Product composition, runtime, tools, storage, and host adapters |
| [`packages/plugins`](packages/plugins) · [`packages/themes`](packages/themes) | Extension SDKs, presets, and themes |

Applications depend on reusable packages; `packages/*` do not depend on `apps/*`. Use public package exports for cross-package integration. See the [architecture guide](apps/docs-site/content/docs/en/developers/architecture.mdx).

## Development and documentation

```bash
bun run check:quick              # changed-file lint and architecture guards
bun run check                    # full lint, types, and architecture guards
bun run test:pkg <package-name>  # focused package tests
bun run test:changed             # tests affected by the current diff
```

Use Bun and repository scripts. Pull requests for development target **`dev`**; see [Contributing](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

- [Documentation map and historical scope](docs/README.md)
- [First-run setup](apps/docs-site/content/docs/en/getting-started/index.mdx) · [User guide](apps/docs-site/content/docs/en/product/overview.mdx)
- [Plugin SDK internals](docs/plugin/README.md) · [Architecture decisions](docs/adr/)
- [Documentation site development](apps/docs-site/README.md)

The public documentation site can be built from this repository. Its source and a successful local build do not establish a deployed public URL.

## Community

The retained community entry is [Discord](https://discord.gg/qGqkk22Vg9). For vulnerability reporting, use [SECURITY.md](SECURITY.md).

## Credits and license

Open Forge builds on Open Vetta and the wider open-source ecosystem, including pi, Codex CLI, MCP, Electron, React, Bun, models.dev, and the projects listed in [NOTICE](NOTICE). Original attribution and third-party notices are preserved there.

Licensed under [Apache-2.0](LICENSE).

- **Friends & Links:** [LINUX DO](https://linux.do/) - A Chinese community for technology enthusiasts. This project is linked with and endorsed by LINUX DO.
