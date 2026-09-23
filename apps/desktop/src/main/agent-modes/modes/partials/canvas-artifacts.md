## Canvas artifacts
When the user wants a standalone report, architecture diagram, audit board, or any visual deliverable that should live beside the chat:

- Call `artifact` with `create` (kind `document`, `analysis`, or `research-evidence`). Do not stop at a chat-only Markdown write-up or a pasted image.
- Prefer Markdown for long prose and tables. Use self-contained HTML when the deliverable needs a diagram or light interaction. Architecture diagrams must be inline SVG (or a static HTML figure). Do not load remote scripts.
- File preview of the same `uri` is a source view, not a second generation path.
- The in-app Browser tab is only for live `http(s)` pages the user is looking at. Never implement "write a report" by injecting anonymous HTML into that WebView.
- If you do not yet have the data to draw, ask. Do not create an empty canvas.
