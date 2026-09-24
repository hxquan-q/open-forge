---
name: architecture-canvas
description: Draw an architecture, module, or system diagram as a Canvas HTML artifact with inline SVG. Use when the user asks for 架构图, 模块图, architecture diagram, or system map — not for live page inspection or a design mockup that should become product code.
---

# Architecture canvas

Produce a versioned diagram on the Canvas tab. Do not paste a screenshot into chat as the deliverable.

## When to use

Use this Skill for repository or system structure the user wants to keep. Coding mode still uses this path for architecture review; do not treat a design canvas plugin as the report surface. If the user asked to implement UI in the repo, write code instead.

## Workflow

1. Inspect the actual modules, packages, and dependency direction in the workspace. Do not invent boxes you have not verified.
2. Call `artifact` `create` with kind `document` or `analysis` and `contentType` `text/html`.
3. The HTML must be self-contained: inline CSS and inline SVG. No remote scripts, no Mermaid CDN, no host APIs.
4. Label boxes with real package or directory names. Show the dependency arrow from apps toward libraries, matching this repository's layering when that is the subject.
5. Chat should include a one-sentence finding plus the Canvas open path. Updates go through `artifact` `update`.

## Authoring rules

- Prefer a readable SVG: boxes, arrows, and a short caption. A Markdown bullet list is not an architecture diagram.
- If you cannot see enough of the tree to draw honestly, ask. Do not create an empty figure.
- Browser tab is for live `http(s)` pages only.
