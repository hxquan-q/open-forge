<!-- Modified by The Open Forge contributors. -->
# Build Modes and Environment Variables

*[中文](./build-modes.md)*

This repository supports lite/serv-less and full builds of Open Forge Desktop through `VETTA_CLOUD_ENABLED`. The script labels "open-source" and "commercial" below refer to those client build modes. Full requires a compatible backend maintained in a separate private repository and configuration from the distributor; it does not establish an available account, subscription, or hosted service. Unconfigured development remains serv-less; **packaging requires an explicit `true` or `false`**.

| | **lite (serv-less)** | **full (cloud-service client)** |
| --- | --- | --- |
| Flag | `VETTA_CLOUD_ENABLED=false` | `VETTA_CLOUD_ENABLED=true` |
| Account login / OAuth | ❌ not in the bundle | Client integration; requires a compatible backend |
| Hosted model channel (name follows brand profile) | ❌ | Client integration; requires server configuration |
| Subscription / credits / quota | ❌ | Client integration; entitlements are determined by the backend |
| Ability marketplace source | Built-in GitHub source and user-added sources | Cloud marketplace (Open Forge Serv) and independent GitHub sources |
| Remote model catalog | ❌ | Client integration; requires server configuration |
| Built-in skills | those without `requiresCloud` | all |

**Available in both modes**: local sessions, the coding agent, the plugin system, themes, bring-your-own-key models, the IM gateway, and the knowledge base.

Cloud and GitHub sources are independent: `VETTA_CLOUD_ENABLED` controls cloud services only.
Both editions register a built-in GitHub source. When `VETTA_OPEN_MARKETPLACE_REPOSITORY` is unset,
empty, or whitespace-only, it defaults to `https://github.com/hxquan-q/open-forge-marketplace`
on `gh-pages`. A custom repository defaults to `main` when no ref is set. These are code defaults,
not proof that distribution content has been published or is available; check the source sync result.

Distributors may replace that source through the environment variable. The built-in source cannot be removed,
disabled, or repointed in the UI; automatic updates and manual refresh remain available. Users can add and
manage custom GitHub sources under Abilities → Marketplace sources. One failing source does not block others.
Same-name abilities retain their source identities; installation conflicts require explicit resolution.

Removing the repository setting restores the code default rather than disabling the GitHub marketplace.
It does not uninstall abilities or remove user-added sources. Normally omit `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL`
so it follows the repository and ref. Restart development processes or rebuild after editing environment files;
subsequent content changes only require Refresh. GitHub commits do not publish to the Open Forge Serv cloud
marketplace. See [GitHub marketplace format](../open-marketplace.md) for source and upgrade semantics.

> `VETTA_CLOUD_ENABLED` is a **build-time** flag, inlined as a constant and folded away: in an open-source build the cloud module and its chunks are never bundled. **It cannot be re-enabled at runtime after shipping** — switching editions requires a rebuild.

---

## Brand profiles (independent of cloud-service mode)

The repository, documentation, and open-source project use **Open Forge**. Without `VETTA_BRAND_PROFILE`,
Desktop uses `distribution`: **Allstr ai** with a localized Chinese display name. Set `self` explicitly for
the **Open Forge** display name and self-profile assets. This is separate from lite/full; packaging still requires
an explicit `VETTA_CLOUD_ENABLED` value for either brand.

For development, set `VETTA_BRAND_PROFILE=self` in `apps/desktop/.env.development`.
For packaging, use the relevant `.env.<mode>` such as `.env.opensource` or `.env.production`, then restart
processes or rebuild. Alternatively, set it in your shell from `apps/desktop`:

```bash
# Bash / zsh
VETTA_BRAND_PROFILE=self bun run dev
```

```powershell
# PowerShell (also affects subsequent commands in this terminal)
$env:VETTA_BRAND_PROFILE = "self"
bun run dev
```

Both profiles share the `OpenForge` executable name, appId/bundleId, protocols, and data roots:
`~/.openforge` for installed builds and `~/.openforge-dev` for normal development. Switching brands does not
isolate data. Package and macOS application names may follow the profile; use the actual downloaded filename.
Package scopes `@vetta/*`, variables `VETTA_*`, project-local `.vetta/`, and `.vettapkg` remain compatible.

## Building the open-source edition

Windows, macOS, and Linux use the same entry point. It selects the host platform, disables cloud, and uses updates from the `hxquan-q/open-forge` GitHub Releases page. The built-in GitHub ability source follows the defaults or distributor overrides described above.

```bash
cd apps/desktop
bun run dist:opensource
```

To create an unpacked directory for verification:

```bash
bun run dist:opensource -- --target dir
```

Forks can override GitHub and marketplace coordinates in `apps/desktop/.env.opensource`:

```bash
VETTA_UPDATE_GITHUB_OWNER=your-org
VETTA_UPDATE_GITHUB_REPO=your-fork
VETTA_OPEN_MARKETPLACE_REPOSITORY=your-org/your-marketplace
```

Open-source builds reject `VETTA_SERVER_URL` and `VETTA_SITE_URL`: login, the official marketplace, and the remote model catalog are absent from the bundle.

## Building the commercial edition

Provide a compatible running backend, website, and update service. The business backend is maintained in a separate private repository; the domains below are configuration examples:

```bash
# apps/desktop/.env.production (local file, not committed)
VETTA_CLOUD_ENABLED=true
VETTA_SERVER_URL=https://api.example.com/api/v1
VETTA_SITE_URL=https://www.example.com
```

Then run `bun run dist:desktop` (or `dist:win`, `dist:mac`, or `dist:linux`) from `apps/desktop`. Commercial builds default to the `generic` provider, and `VETTA_UPDATE_URL` must be provided explicitly — there is no built-in default feed URL, and packaging fails without it.

On Linux, `bun run package:linux` builds AppImage, DEB, and RPM together. Use `package:linux:appimage`, `package:linux:deb`, `package:linux:rpm`, or `package:linux:tar.gz` to build one format; append `:test` to the same command to use the test build environment.

On Windows, `bun run package:win` builds Inno, MSI, and ZIP together. Use `package:win:inno`, `package:win:msi`, `package:win:zip`, or `package:win:portable` to build one format; each command also has a `:test` variant. The updater manifest continues to reference only Inno; MSI and ZIP are supplemental downloads.

`VETTA_SERVER_URL` is required for commercial builds, and production builds require HTTPS. Missing or invalid settings fail before old output is cleaned, dependencies are downloaded, or compilation begins.

`VETTA_SITE_URL` is optional; it is derived from `VETTA_SERVER_URL` by stripping the `api.` prefix and mapping port `8080` to `3000`.

---

## Environment files

Local `.env` and private `.env.<mode>` files are not tracked; example files are the exception. `apps/desktop/.env.example` is the variable index — copy it to `.env.development` and edit.

When packaging, `VETTA_BUILD_ENV=<mode>` selects which `.env.<mode>` to load:

```bash
VETTA_BUILD_ENV=production bun run pack     # reads .env.production
bun run pack:test                           # same as VETTA_BUILD_ENV=test
```

Precedence: **inline on the command line > process environment > `.env.<mode>` > `.env` > code defaults**.

### Reference: a typical `.env.production`

This illustrates the configuration shape, not deployed endpoints, buckets, or commercial services. Replace the examples with your actual environment:

```bash
VETTA_CLOUD_ENABLED=true
VETTA_SERVER_URL=https://api.example.com/api/v1
VETTA_SITE_URL=https://www.example.com
VETTA_UPDATE_PROVIDER=generic
VETTA_UPDATE_URL=https://releases.example.com/desktop/stable
VETTA_R2_BUCKET=your-release-bucket
VETTA_R2_PREFIX=desktop/stable
VETTA_TENANT=common
VETTA_SPEECH_INPUT_ENABLED=false
```

### Reference: a typical `.env.test`

```bash
VETTA_CLOUD_ENABLED=true
VETTA_SERVER_URL=http://127.0.0.1:8080/api/v1
# Packaging fails when VETTA_UPDATE_URL is unset; provide a dedicated test feed explicitly.
VETTA_UPDATE_PROVIDER=generic
VETTA_UPDATE_URL=https://releases.example.com/desktop/test
```

---

## Variable reference

### Mode and service endpoints

| Variable | Description |
| --- | --- |
| `VETTA_BRAND_PROFILE` | Defaults to `distribution` (Allstr ai); explicit `self` selects Open Forge, independently of cloud-service mode |
| `VETTA_CLOUD_ENABLED` | `false` produces open-source; `true` produces commercial; packaging requires an explicit value |
| `VETTA_SERVER_URL` | Server API endpoint. Required for commercial and forbidden in open-source builds |
| `VETTA_SITE_URL` | Site URL used for the OAuth login redirect. Derived from `VETTA_SERVER_URL` when unset |
| `VETTA_OPEN_MARKETPLACE_REPOSITORY` | Overrides the built-in GitHub source; empty uses `hxquan-q/open-forge-marketplace` |
| `VETTA_OPEN_MARKETPLACE_REF` | Branch or ref; `gh-pages` for the default repository, `main` for a custom repository |
| `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL` | Explicit archive URL; derived from repository and ref when omitted |

### Build-time trimming

| Variable | Description |
| --- | --- |
| `VETTA_SPEECH_INPUT_ENABLED` | `false` excludes the speech models, the Sherpa native runtime and the speech entry point. Enabled by default |
| `VETTA_TENANT` | System-plugin tenant, decides which presets get packaged. See `packages/plugins/tenants.json` |
| `VETTA_BUILD_ENV` | Selects which `.env.<mode>` to load |

### Development toggles

| Variable | Description |
| --- | --- |
| `VETTA_SHOW_UI_THEME` | `true` reveals the "UI theme" section in appearance settings |

### Auto-update

| Variable | Description |
| --- | --- |
| `VETTA_UPDATE_PROVIDER` | Commercial requires `generic` (the default); open-source requires `github` |
| `VETTA_UPDATE_URL` | For `generic`: R2, self-hosted object storage, or any static HTTP/CDN root |
| `VETTA_UPDATE_GITHUB_OWNER` · `VETTA_UPDATE_GITHUB_REPO` | For `github` |
| `VETTA_R2_BUCKET` · `VETTA_R2_PREFIX` | R2 upload target, used only by `publish:updates:r2` |

The update source is build configuration and is independent of the operating system; switching providers requires no client code changes. Platform details: [macOS](./macos-auto-update.md), [Windows](./windows-auto-update.md).

### Observability

| Variable | Description |
| --- | --- |
| `VETTA_SENTRY_DSN` | Sentry is a no-op when unset. The DSN ends up in the bundle |
| `VETTA_SENTRY_RELEASE` | Immutable release; must match exactly between runtime and source-map upload. Suggested: `vetta-desktop@<version>+<build-id>` |
| `VETTA_TELEMETRY_ENVIRONMENT` | `development` / `staging` / `production` |
| `VETTA_SENTRY_TRACES_SAMPLE_RATE` | 0–1, defaults to 0 |
| `VETTA_SENTRY_ORG` · `VETTA_SENTRY_PROJECT` · `VETTA_SENTRY_URL` | Source-map upload (CI only); `URL` is for self-hosted Sentry only |
| `VETTA_MAIN_SOURCEMAP` | Emit a main-process source map for local stack debugging without uploading |
| `VETTA_POSTHOG_KEY` | Project API Key (starts with `phc_`), **not** a Personal API Key. Ends up in the renderer bundle |
| `VETTA_POSTHOG_HOST` | Defaults to PostHog Cloud US |
| `VETTA_POSTHOG_REPLAY_ENABLED` · `VETTA_POSTHOG_REPLAY_SAMPLE_RATE` | Replay is off by default |
| `VETTA_TRACING` | Set to `langfuse` to trace agent / LLM / tool calls end to end |
| `VETTA_TRACING_TRACE_NAME` · `LANGFUSE_PUBLIC_KEY` · `LANGFUSE_BASE_URL` | Langfuse configuration |
| `LANGFUSE_TRACING_ENVIRONMENT` · `LANGFUSE_RELEASE` · `OTEL_SERVICE_NAME` | Optional metadata |

---

## Secrets

**Never put these in any `.env` file.** Inject them through the shell environment or CI secrets:

- **Cloudflare R2 upload credentials**: `VETTA_R2_ACCOUNT_ID`, `VETTA_R2_ACCESS_KEY_ID`, `VETTA_R2_SECRET_ACCESS_KEY`
- **macOS signing and notarization**: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_API_*`
  CI variants: `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  Set none of them and you get an unsigned package; to sign, all of them are required. See [apple-code-signing.md](../deploy/apple-code-signing.md)
- **Sentry source-map upload**: `VETTA_SENTRY_AUTH_TOKEN`
- **Langfuse**: `LANGFUSE_SECRET_KEY`

`VETTA_REQUIRE_MAC_SIGNATURE=1` is only used by the macOS CI artifact verification step; it is not client configuration.

---

## CI

`.github/workflows/desktop-release.yml` resolves build configuration in the `prepare` job, which uses the `desktop-production` Environment. Precedence:

1. **Actions → desktop-release → Run workflow form** (`workflow_dispatch` only; `default` / empty means no override)
2. **Environment / repository Variables** (when the job sets `environment: desktop-production`, Environment values overlay same-named repository variables)
3. Built-in defaults: `VETTA_RELEASE_TARGET=github` selects open-source; `r2` selects commercial

Both editions read the `VETTA_OPEN_MARKETPLACE_REPOSITORY` Variable, optionally overridden by the
`marketplace_repository` input on manual runs. When neither is configured, the client still uses this project's
default repository and `gh-pages`; it does not disable the source. Configure a real repository and ref for a
custom distribution. That setting alone does not establish that marketplace content has been published.

**This repository defaults to a lite build when no Variables are set.** To distribute a full build, put the actual environment configuration on Settings → Environments → `desktop-production` → Environment variables (credentials stay in Environment secrets):

```
VETTA_CLOUD_ENABLED = true
VETTA_SERVER_URL    = https://api.example.com/api/v1
VETTA_SITE_URL      = https://www.example.com
VETTA_RELEASE_TARGET = r2
VETTA_UPDATE_URL     = https://releases.example.com/desktop/stable
VETTA_R2_BUCKET      = your-release-bucket
VETTA_R2_PREFIX      = desktop/stable
```

Optional: `VETTA_UPDATE_URL_TEST` / `VETTA_R2_PREFIX_TEST` (and `_STABLE`). Choosing channel `test` on a manual run prefers those; otherwise a trailing `stable` / `test` / `beta` / `prod` / `production` segment is rewritten.

The form can override the edition, server URLs, tenant, speech input, publish target, and channel. GitHub + open-source and R2 + commercial must stay paired. **Do not type R2 keys, certificates, or DSNs into the form** — those stay in Secrets.

The release matrix waits for a dedicated quality job first: the root `bun run check`, quality-script tests, and Desktop packaging contract tests must pass before any platform build starts. Each platform then verifies updater metadata, hashes, blockmaps, and installable contents.

Tags matching the Desktop version and manual `workflow_dispatch` runs resolved to the `stable` or `test` channel enter the publish flow; other manual builds retain Actions artifacts only. After publishing, the workflow checks `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and every referenced artifact through the public URL. The form is visible only after this workflow exists on the repository default branch.
