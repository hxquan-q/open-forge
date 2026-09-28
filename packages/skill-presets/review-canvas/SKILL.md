---
name: review-canvas
description: Present a multi-file code review as a Canvas diff artifact. Use when the user asks for a review, 代码评审, 变更审查, or a cross-file summary of changes — not for a single edit (the chat diff card already shows it) or a prose report (report-canvas).
---

# Canvas code review

Write one conversation-owned artifact whose content is a Unified Diff, so the Canvas tab renders it
file by file with per-file stats and folding.

## When to use

Use this Skill when the change spans several files and the user needs to review it as a whole:
完成一个任务后的验收、一段重构后的对照、准备提交前的自查。Single-file edits already render as a diff
card in chat — do not duplicate them here.

## Contract

- `contentType: "text/x-diff"`，`content` 就是标准 Unified Diff 文本（可以含多个 `diff --git` 段）。
- 或者用 `kind: "code-change"`，渲染层按同一分支处理。
- 每个文件分段以 `diff --git a/<path> b/<path>` 开头，后面跟 `---` / `+++` / `@@` 头与增删行。
- 不要用 Markdown 表格或自定义 JSON 描述差异；解析与染色走与聊天里同一套 diff 渲染。

## Workflow

1. 先把真实差异取出来（`git diff`、工具结果里的 diff，或 `edit_file` / `write_to_file` 的 `details.diff`），
   不要凭记忆重写差异文本 —— 行级内容对不上就失去了审查价值。
2. `artifact` `create`，`kind: "code-change"`，`contentType: "text/x-diff"`，`title` 写清审查对象
   （例如「PR #12 变更」），`content` 放完整 Unified Diff。
3. 用户要求追加新变更时走 `artifact` `update` + `baseVersion`，保持同一份 artifact 的版本历史。
4. 聊天里给出结论（风险点、需要重点看的文件），不要重贴整份 diff。

## Failure modes

- diff 被截断或缺少 `diff --git` 头时，画布会按单个文件渲染或降级为代码视图；这时补全 diff 再 `update`。
- 只改了文件的一部分时，明确写出范围（哪个文件、哪些 hunk），不要让读者以为这是全量变更。
