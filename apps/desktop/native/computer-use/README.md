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
primitive files. Product behavior belongs in `executor.py`, `windows.py` and `server.py`. The worker
captures the virtual desktop and sends global keyboard/mouse input; it does not select or bind a target window.

Runtime mutable COM-generated code goes only into the host-provided application cache, not the
installed resources, system Python or a WinHands user directory. The backend starts with `-I -B`,
uses an isolated `_pth`, and never loads user site packages or upstream `server.py` / `memory.py`.

## Foreground and IME feedback

Every successful observe/click/press/type/scroll result includes a read-only snapshot in its existing
`text` field, for example:

```text
Foreground now: hwnd=123 title="Document" exe="C:/editor.exe"; IME=open (foreground default IME).
```

The foreground is sampled after the input or screenshot, before Desktop restores Vetta's display;
it is current context, not proof of which window received earlier keystrokes, a bound target, or
control-level focus. OS-owned title/path strings are JSON-quoted. No window is activated or marked,
and no input language or IME state is changed.

`IME=open` / `closed` comes from `ImmGetDefaultIMEWnd(foreground)` and a read-only
`WM_IME_CONTROL / IMC_GETOPENSTATUS` query with a 100 ms message timeout. This is the foreground
thread's default IME open status, not its input language, conversion mode, or composition text.
An absent default IME, timeout, access restriction or OS query failure reports `unknown`, never a
fabricated `closed`. Missing process access preserves the title/IME and marks only `exe=unknown`.
No foreground or a foreground switch during sampling discards the snapshot (`hwnd=none`, fields
unknown). Diagnostic unavailability does not turn a completed input into an action error; cancellation
and held-input release still take precedence.

## Test boundaries

- `test_executor.py` uses fake virtual-screen and input adapters and exercises global observe/click/press/type/scroll, fresh feedback, input release and pause/stop cancellation.
- `test_windows.py` uses fake Win32/imm32 calls for read-only foreground/IME feedback (including pointer-sized handles, timeouts and unavailable state), legacy hidden-window recovery and virtual-screen capture geometry.
- `test_server.py` exercises the real private protocol, Executor and Windows adapter with fake OS/input boundaries, including observe→press→type→observe feedback and stop/release acknowledgements.
- `scripts/verify-computer-use-backend.mjs` in the desktop app verifies the bundled interpreter, dependency imports and private MCP protocol without capturing a real screen or injecting input.

Real desktop compatibility is a separate authorized acceptance step. See the app's
[Computer Use guide](../../docs/computer-use.md) and [ADR-0154](../../../../docs/adr/0154-windows-computer-use-bundled-backend.md).
