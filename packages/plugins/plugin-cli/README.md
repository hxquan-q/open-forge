<!-- Modified by The Open Forge contributors. -->
# Open Forge Plugin CLI

Create, document, and install plugins for Open Forge. The package name `@vetta-org/plugin-cli` and binary `vetta-plugin-cli` are compatibility identifiers.

## Match the target build

Use the CLI and SDK from this checkout or a release verified against your target Open Forge build. A registry package with the same name does not establish compatibility with this repository.

From the repository root, build the local tooling and inspect its help:

```bash
bun run --cwd packages/plugins/plugin-cli build
node packages/plugins/plugin-cli/dist/cli.js --help
```

The `npx` examples below assume you have verified the published version. For local tooling, replace `npx @vetta-org/plugin-cli` with `node <checkout>/packages/plugins/plugin-cli/dist/cli.js`.

## Start a plugin

```bash
npx @vetta-org/plugin-cli init --id my-plugin --name "My Plugin"
cd my-plugin
bun install
bun run install:vetta      # build → pack → install into the running Desktop
```

The scaffold includes an `AGENTS.md` brief so a coding agent can pick the project up without any
host-side setup. Inside a marketplace hub (a repository with `.vetta/marketplace.json`) the new
plugin is also listed in that manifest.

## Update an existing project

```bash
bun add -D @vetta-org/plugin-sdk@<verified-version>  # select a compatible SDK
npx @vetta-org/plugin-cli init --refresh-guide   # refresh AGENTS.md
npx @vetta-org/plugin-cli docs --check-latest    # confirm
```

`init` refuses to overwrite an existing project, so a directory scaffolded months ago still carries
that day's `AGENTS.md`. `--refresh-guide` rewrites only that file — the one scaffolded artifact that
is purely derived and holds no user content — leaving source, manifest and config untouched. It reads
the id and display name from the `plugin.json` already on disk. At a marketplace root it rewrites the
hub brief instead.

It refuses to overwrite a brief that carries no `vetta-guide-revision` marker — that file is
indistinguishable from a hand-written one, and a marketplace root often holds a hand-written spec.
Use `--dry-run` to print the current template for manual merging, or `--force` to replace the file
outright.

You will rarely have to remember this: the brief carries a revision stamp, and `docs` compares it on
every run and says outright when it is behind. The brief itself holds no rules — those live in the
manual, which travels with the SDK — so it changes seldom, and a project that refreshes once keeps
itself current from then on.

## Remove a plugin

```bash
npx @vetta-org/plugin-cli uninstall            # the plugin in this directory
npx @vetta-org/plugin-cli uninstall some-id    # by id, from anywhere
```

## Start a marketplace

```bash
npx @vetta-org/plugin-cli init hub \
  --name my-market \
  --repository https://github.com/me/my-market \
  --min-app-version 0.1.3
```

Creates the index skeleton, the `abilities/` layout, a repository-level `AGENTS.md`, and a CI
workflow running `sync --check`. Add abilities with `init` inside `abilities/plugins/<slug>`.

## Keep a marketplace repository honest

```bash
npx @vetta-org/plugin-cli sync           # reconcile .vetta/marketplace.json with the ability directories
npx @vetta-org/plugin-cli sync --check   # report only, non-zero exit — for CI
```

The index carries data that is derived from each ability package, under constraints that bite
remotely: the host refuses to sync an entry whose version differs from the package, it will not
install a plugin whose built entry is missing from the published directory, and clients silently
skip an update when `marketplaceVersion` did not change. `sync` reconciles all three.

For marketplace schema v3, a plugin may instead list immutable `releases[]` with HTTPS `.vettapkg` URLs
and SHA-256 digests. Its `source.path` then contains presentation files only. `sync --check`
checks release metadata and reconciles the catalog version with the highest release; the
Desktop installation verifies the downloaded package. Before advancing a stable marketplace ref,
run the publication check from a fixed Open Forge checkout as described in
[`docs/open-marketplace.md`](../../../docs/open-marketplace.md).

## Find the manual

```bash
npx @vetta-org/plugin-cli docs
npx @vetta-org/plugin-cli docs --check-latest
```

Prints where the manual bundled with the installed `@vetta-org/plugin-sdk` lives, which SDK version
it documents, and which plugin (and hub) the current directory belongs to. The manual is always the
one this project compiles against, so it never describes contracts the user's host lacks.

That pinning is also why the manual goes stale: a project created months ago still carries the manual
from that day, and so does its `AGENTS.md`. Every run therefore prints how to refresh it, and
`--check-latest` compares the installed SDK against the registry and says so outright when it is
behind. Registry freshness and host compatibility are separate questions: compare the SDK's public contract with the target build before upgrading. Use the installed SDK manual for the version your plugin compiles against.

## Install a plugin

Install an npm-distributed plugin into the running Open Forge desktop app:

```bash
npx @vetta-org/plugin-cli add @example/vetta-plugin-demo
```

The npm package is fetched with lifecycle scripts disabled. The CLI extracts only the archive declared by
`package.json#vetta`, then asks the running Desktop host to validate, approve, and install it. It never writes
the user plugin directory directly. See the [configuration paths](../../../apps/docs-site/content/docs/en/reference/configuration-paths.mdx) for installed and development instances.

Local archives and HTTP(S) archives use the same command:

```bash
npx @vetta-org/plugin-cli add ./release/demo-1.0.0.vettapkg
npx @vetta-org/plugin-cli add https://example.com/demo-1.0.0.vettapkg
```

When an update is installed as a pending version, apply it through the running Desktop host instead of
restarting or editing the plugin store directly:

```bash
npx @vetta-org/plugin-cli reload demo
```

Reload follows the same Desktop approval flow as the UI and reports the active version after approval.

Use `--json` for machine-readable output. Set `VETTA_CONFIG_DIR` or `VETTA_HOME` when targeting an isolated
Desktop environment.

## Publisher contract

The published plugin package must include a standard Desktop plugin archive and declare it in `package.json`:

```json
{
  "name": "@example/vetta-plugin-demo",
  "version": "1.0.0",
  "files": ["release/vetta-plugin.vettapkg"],
  "vetta": {
    "schemaVersion": 1,
    "type": "desktop-plugin",
    "pluginId": "demo",
    "archive": "release/vetta-plugin.vettapkg"
  }
}
```

`@vetta-org/plugin-vite` can create both the versioned archive and this stable npm archive with
`package: { npmArchive: true }`.


## Context Boundary

```yaml
purpose: Install npm-distributed plugins into Open Forge Desktop
provides:  
  - "@vetta-org/plugin-cli"
consumes:  []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta/action-rpc"
```
