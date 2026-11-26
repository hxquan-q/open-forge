---
id: TASK-0511
type: task
status: verifying
priority: P2
owner: packages/theme-ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream（29ba5969b 代码块统一外框 + 4866771a5 浅色表格分层）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e324583a1
read_paths:
  - packages/theme-ui/src/markdown/
  - packages/theme-ui/src/shared/
  - packages/theme-ui/src/app/
write_paths:
  - packages/theme-ui/src/markdown/CodeBlock.tsx
  - packages/theme-ui/src/markdown/RichCodeBlock.tsx
  - packages/theme-ui/src/markdown/MermaidBlock.tsx
  - packages/theme-ui/src/markdown/builtin-renderers.tsx
  - packages/theme-ui/src/shared/CodeBlockCopyButton.tsx
  - packages/theme-ui/src/shared/SyntaxHighlightedCode.tsx
  - packages/theme-ui/src/shared/MarkdownTable.tsx
  - packages/theme-ui/src/app/AppBootLoadingView.tsx
  - apps/desktop/DESIGN.md
  - scripts/quality/baselines/design-exceptions.json
  - project/tasks/TASK-0511-markdown-unified-frame.md
  - .github/release-notes/fragments/v0.1.5/markdown-unified-frame.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0511 代码块与表格统一外框（PLAN-0032 P8①）

## 合同

- 来源与目标：PLAN-0032 P8 第一项。上游 `29ba5969b`（代码块改用与表格一致的「外框 + 内面板」设计）+ `4866771a5`（浅色模式表格表头与表体底色拉开层次），手工合并进本地 fork 的 markdown 流式渲染，不覆盖本地隔离渲染与计算预算。
- 输入 → 输出：`packages/theme-ui/src/markdown/`（CodeBlock/RichCodeBlock/MermaidBlock/builtin-renderers）与 `packages/theme-ui/src/shared/`（CodeBlockCopyButton/SyntaxHighlightedCode/MarkdownTable）→ 外框 `rounded-xl border-border/60 p-[3px]` + 内面板 `rounded-[9px] bg-background`；语言标记去分割线；浅色表格外框/表头底色改前景色混合。纯 CSS 类改造，行为合同不变。
- 做 / 不做：只做视觉类与 `CodeBlock.Body` 结构；不改流式分块、渲染预算、隔离 iframe sandbox、复制逻辑。串行主工作区，无拆分收益。
- Given / When / Then：上游 diff 手工合入后，theme-ui markdown 测试与桌面邻近回归全绿；`check:quick` 通过（`rounded-[9px]` 属同心圆角几何需要，按 D05 例外登记，DESIGN.md 同步口径说明）。
- 保留：`withinHighlightBudget` 高亮预算、`live` 纯文本降级、iframe sandbox 属性、`useRichVisibility` 视口门控、复制按钮 stopMessageDrag 语义全部不动。
- 验证：`run-vitest.mjs --run src/markdown`（theme-ui）+ 桌面 markdown 邻近测试 + `bun run check:quick -- <改动文件>`；视觉差异属 UI 验收，需用户实机确认。
- 人工验收：会话中发送含代码块/表格/公式的回复，明暗两主题下确认代码块与表格外框观感一致、复制按钮悬停可读；工程完成以门禁+回归为准。

## 交付

- 实际修改与验证：上游 `29ba5969b` 全量 hunk（Frame/Body/语言标记/Rich 三分支/Mermaid 两分支/公式块/复制按钮配色/内边距）+ `4866771a5` 浅色表格分层手工合入；本地 fork 的渲染预算、`live` 降级、iframe sandbox、`useRichVisibility` 视口门控、复制按钮 stopMessageDrag 逐一核对未动。theme-ui `run-vitest.mjs --run src/markdown` 8 文件 78/78 绿；桌面邻近回归 5 文件 21/21 绿；`check:quick` 全绿（`rounded-[9px]` 按 D05 例外登记，DESIGN.md 同步口径）。
- 评审与集成：verifier 独立复查 `complete/pass`——上游 diff 逐字对齐、fork 合同保留证据齐全、Body 覆盖无遗漏、例外计数吻合；两项非阻断修正（本台账路径覆盖、误落盘 `$null` 文件）已处理。
- 未运行与风险：纯视觉 CSS 改造未做实机 UI 走查（`verify:ui:*` 未授权）；视觉差异（外框圆角、浅色表头分层）需用户会话实测确认。
- 发布：碎片 `.github/release-notes/fragments/v0.1.5/markdown-unified-frame.md`（`## 改进`）已汇编进正文；推送 origin xquan 按既有授权执行。
