---
name: report-canvas
description: Produce a standalone report, audit board, or long-form analysis as a Canvas artifact. Use when the user asks for a report, 报告, 审计看板, or a deliverable that should live beside chat — not when they only want a short chat answer or to inspect a live web page.
---

# Canvas report

Write one conversation-owned artifact. Do not finish with chat-only Markdown.

## When to use

Use this Skill when the user wants a standalone analysis they can reopen, version, and iterate. Do not use it for "open this URL and click the button" — that is the in-app Browser / `browser_tab`. Do not create an empty canvas if required facts are missing; ask first.

## Workflow

1. Gather enough source material. If the repository, numbers, or files are insufficient, ask. Stop rather than inventing a hollow template.
2. Call `artifact` `create` with kind `document` or `analysis`. Prefer Markdown for prose, tables, and conclusions. Use self-contained HTML only when the report needs a figure or light interaction.
3. Put the title, date, scope, findings, and next actions in the artifact body. The chat reply should point at the Canvas tab, not duplicate the whole report.
4. After create, tell the user the artifact title and that it is on the Canvas tab. Later edits use `artifact` `update` with `artifactId` and `baseVersion`.
5. If the user selected canvas text (`vetta.canvas.artifact-selection`), treat that excerpt as the revision target.

## Authoring rules

- One write path: `artifact`. File preview of the same `uri` is a source view.
- Never inject anonymous HTML into the in-app Browser WebView to "show a report".
- No remote scripts or CDNs in HTML artifacts. Inline SVG if a diagram is required.
- Do not upgrade the conversation to a Task unless the user already opened a document Task entry.
