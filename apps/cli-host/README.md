<!-- Modified by The Open Forge contributors. -->
# @vetta/cli-host

CLI and process composition roots around `@vetta/coding-agent`.

## What It Owns

- process entrypoint for the CLI app
- the `openforge`, `openforge-agent`, and `openforge-agent-rpc` executable entrypoints
- host-profile selection for Print, RPC, and IM RPC execution
- dedicated JSONL RPC sidecar entrypoint
- Node RPC Client and child-process lifecycle
- argument handoff into `coding-agent`

## Runtime Entry

All Agent commands use the single production runtime. IM capabilities are enabled by the host profile rather than a runtime selector:

```text
openforge-agent-rpc --mode rpc \
  --enable-host-bridge \
  --scenario im-claw \
  --session-dir <conversation-directory>
```

The dedicated RPC entry keeps stdout reserved for JSONL protocol frames; startup diagnostics use stderr. Historical
session files remain readable through the explicit pre-open import boundary, but they do not select a different runtime.

## What It Does Not Own

- agent behavior
- model/provider logic
- terminal UI primitives
- RPC wire semantics, validation, and command dispatch

## Who Depends On It

- shell users and packaging targets that want a dedicated CLI package


## Context Boundary

```yaml
purpose: CLI host application: headless agent session entry point and RPC surface
provides:  []
consumes:  []
internal_dependencies:
  - "@vetta/action-rpc"
  - "@vetta/agent-core"
  - "@vetta/ai"
  - "@vetta/coding-agent"
  - "@vetta/ecosystem-adapter"
  - "@vetta/runtime-core"
  - "@vetta/runtime-mcp"
  - "@vetta/runtime-node"
  - "@vetta/runtime-storage"
```

## Process test isolation

Run `bun run test` in this package (or `bun run test:pkg cli-host` from the repository root). The standard entry uses the shared Node runner with one worker because these suites start real CLI processes and installed artifacts. This serializes independent test files, not the concurrent processes exercised inside ownership and cancellation tests. All existing assertions, test selection and deadlines remain unchanged. Other packages keep their own worker policy.
