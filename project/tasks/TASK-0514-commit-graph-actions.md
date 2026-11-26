---
id: TASK-0514
type: task
status: verifying
priority: P2
owner: packages/plugins/presets/git
requirement: REQ-0008
plan: PLAN-0032
source: upstream（2dd10fc5b 提交图操作与详情浏览）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0512]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 8d79b7c3d
read_paths:
  - packages/plugins/presets/git/src/
  - packages/plugins/presets/git/test/
  - packages/plugins/presets/git/locales/
write_paths:
  - packages/plugins/presets/git/src/git/commitActions.ts
  - packages/plugins/presets/git/src/components/graph/CommitActions.tsx
  - packages/plugins/presets/git/src/components/graph/GraphView.tsx
  - packages/plugins/presets/git/src/components/graph/GitGraphCanvas.tsx
  - packages/plugins/presets/git/src/components/graph/CommitRow.tsx
  - packages/plugins/presets/git/src/components/graph/CommitDetailPane.tsx
  - packages/plugins/presets/git/src/components/ConfirmDialog.tsx
  - packages/plugins/presets/git/locales/zh.json
  - packages/plugins/presets/git/locales/en.json
  - packages/plugins/presets/git/test/
  - scripts/quality/baselines/test-assertion-baseline.json
  - project/tasks/TASK-0514-commit-graph-actions.md
  - .github/release-notes/fragments/v0.1.5/git-commit-graph-actions.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0514 提交图操作（PLAN-0032 P8②）

## 合同

- 来源与目标：PLAN-0032 P8 第二项。上游 `2dd10fc5b`「扩展提交图操作与详情浏览」手工合并进本地 fork 的 git 插件：右键提交节点出操作菜单（复制 SHA / 新建分支 / 分离检出 / Reset soft-mixed-hard），写操作经确认对话框执行，完成后发刷新信号重载提交图。
- 输入 → 输出：`packages/plugins/presets/git/src/`（graph 组件、git/commitActions、locales）→ 新增提交级写操作入口；GraphView 订阅刷新信号、loadId 竞态防护覆盖翻页加载。
- 做 / 不做：做操作菜单、commitActions 写封装、GraphView 刷新与竞态接线、ConfirmDialog `confirmDisabled`、详情面板文件计数头与空文件提示、测试移植。不做：上游同批的 `PatchContent` 抽取与 DiffPane 换用（本地 DiffPane 已内联 `@pierre/diffs` fork，分叉属视觉升级范畴，另行切片）；CommitDetailPane 的 tree/flat 偏好键与 `bg-muted` 外观等本地 fork 演进全部保留；CommitRow 保持本地 div 行形态（上游是 button，本地刻意演进，不回归）。
- Given / When / Then：右键提交节点 → 菜单展开 → 选「新建分支」输名确认 → `git branch -- <name> <hash>` 执行且提交图重载；Reset 确认时重读 HEAD，HEAD 已变则拒绝执行；操作失败时对话框保留并显示错误。
- 保留：本地 fork 的详情面板外观与 DiffView 渲染、翻页自动加载、窄面板门控、面板宽度拖拽语义全部不动。
- 验证：`run-vitest.mjs`（git 插件 test 目录，含新增隔离仓库测试与 GraphView UI 集成测试）+ `bun run check:quick -- <改动文件>` + `bun run check`。
- 人工验收：Git 面板提交图右键菜单可用；新建分支/分离检出/Reset 均先确认再执行；操作后分支列表与提交图刷新；需用户实机确认。

## 交付

- 实际修改与验证：新增 `src/git/commitActions.ts`（与上游 `2dd10fc5b` 原文逐字一致：validateHash、check-ref-format、reset 前重读 HEAD、enqueueWrite 串行）与 `src/components/graph/CommitActions.tsx`（菜单与确认分离、busy/running 双防护、分支名空禁用、失败保留对话框 role=alert、成功后 emitRefreshSignal）。GraphView 接 refresh 订阅、load effect cleanup 递增 loadId、loadMore 三处 stale-id 守卫、reload 清空菜单、CommitDetailPane 按 `root:hash` 重挂载；CommitRow/GitGraphCanvas 透传 onContextMenu（保留本地 div 行形态）；ConfirmDialog 加 confirmDisabled；CommitDetailPane 加文件计数头与空文件提示；zh/en locales 各补 15 键。git 插件 `run-vitest.mjs` 全量 13 文件 74/74 绿（新增隔离仓库测试 6 用例 + GraphView UI 集成测试 6 用例）；`check:quick` missing=0（四个接线文件补 `// Modified by The Open Forge contributors.`）；`bun run check` 完整门禁 exit 0。
- 评审与集成：verifier_0514 独立复查 `complete/pass`——校验链、串行写队列、竞态守卫、locales 对齐、stale page 测试有效性均逐点确认；无阻断/高/中风险发现。两条低风险观察（复制 SHA 失败仅 toast 不进对话框——该步骤不写仓库，与上游一致；reset 用例 dialog 断言有 alert 与参数断言兜底）均不阻塞。
- 未运行与风险：未做实机 UI 走查（`verify:ui:*` 未授权）；右键菜单视觉位置、Reset 三档实际效果需用户会话实测。
- 发布：碎片 `.github/release-notes/fragments/v0.1.5/git-commit-graph-actions.md`（`## 新增`）已汇编进正文；推送 origin xquan 按既有授权执行。
