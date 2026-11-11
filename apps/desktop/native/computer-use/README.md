<!-- Copyright The Open Forge contributors. -->
# Computer Use private worker

The Windows package includes this structured worker and a private, hash-pinned CPython runtime.
It is not the upstream arbitrary-Python WinHands server. Its private MCP methods are not exposed
as a global user-configured connector; Desktop owns authorization, session identity and cancellation.

## Upstream derivation

`vendor/winhands/{uia.py,inputs.py}` are restricted primitives derived from WinHands **0.4.1**,
commit `4fa71b1be751de997aae63d64fe5f5d787d6615b`, MIT, Copyright (c) 2026 Rodolfo Obreque.
The full MIT notice is retained at `vendor/winhands/LICENSE` and copied into the bundle.
Original-file SHA256 values are in `dependencies.json`.

`extract-primitives.py <reviewed-upstream-package> <destination>` regenerates these files by AST
selection without importing the source. It checks the original hashes and omits shell/program
launch, arbitrary code, focus/physical fallback helpers, memory, skill loading and template APIs.
Update the reviewed snapshot and lock deliberately before regenerating; do not hand-edit generated
primitive files. Product behavior belongs in `executor.py`, `windows.py`, `input_guard.py` and `server.py`.

Runtime mutable COM-generated code goes only into the host-provided application cache, not the
installed resources, system Python or a WinHands user directory. The backend starts with `-I -B`,
uses an isolated `_pth`, and never loads user site packages or upstream `server.py` / `memory.py`.

## Test boundaries

- `test_executor.py` uses fake UIA/input/window adapters and exercises the real structured executor.
- `test_windows.py` uses fake Win32 calls and exercises instance identity, owned dialogs and restore rules.
- `scripts/verify-computer-use-backend.mjs` in the desktop app verifies the bundled interpreter and
  private MCP protocol without accessing a window, screenshot or input device.

Real desktop compatibility is a separate authorized acceptance step. See the app's
[Computer Use guide](../../docs/computer-use.md) and [ADR-0154](../../../../docs/adr/0154-windows-computer-use-bundled-backend.md).
