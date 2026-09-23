---
id: TASK-0070
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008 差距表「聚合视图成员归属」（ADR-0111 后果「暂不携带成员身份标注」的补齐）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/shared/workspace, docs/adr/0111]
write_paths: [apps/desktop/src/renderer/shared/workspace/activity-workspace.ts, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts, apps/desktop/src/shared/i18n/locales]
exclusive_paths: []
depends_on: [TASK-0069]
conflicts_with: []
integration_status: integrated（forge/dev 主工作区，随本任务提交）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Team 聚合视图的成员归属标注

## 目标

ADR-0111 让 Team 全景活动面板聚合协调与全部成员 Runtime，但后果明确「暂不携带成员身份标注」：Todo 与 Task 页签把多成员产出混排成一锅，用户分不清哪条待办属于哪个成员（对齐 Cursor Agents Window 的成员可辨识视图）。本任务把「runtimeId → 成员显示名」的映射送进 `ActivityWorkspace`，并在聚合 >1 个有数据 Runtime 时为 Todo 分节、为 Task 卡片加成员 chip。

## 范围

### 并发评估

- 结论：不支持（与并行会话共占 activity-panel/canvas 相关目录，仅交错编辑互不触碰的文件；`canvas-tab.tsx`、`TaskArtifactPreview.tsx`、`useCanvasTabModel.ts` 归并行会话，本任务不改）
- 集成顺序：PLAN-0008 Phase B，依赖 TASK-0069 已合入

### 做

1. `ActivityWorkspace` 合同增加可选 `runtimeLabels?: Readonly<Record<string, string>>`（runtimeId → 展示名），`createActivityWorkspace` 增加可选第 4 参；既有调用点零改动。
2. `registry/context` 增加 `useActivityRuntimeLabels()`；`useTeamChatModel` 构建 runtimeLabels（协调 Runtime → 队长显示名；成员 Runtime → 成员显示名）并传入工作空间。
3. Todo 链路：`useTodoTabPanelModel` 改用 `collectRuntimeScoped` 保留归属，模型输出按成员分组；`TodoTabPanel` 在 >1 个有数据且有标签的 Runtime 时按成员分节（成员名小节头 + 既有 `TodoTimeline`），单 Runtime 维持 `TodoTabPanelView` 现状。
4. Task 链路：`TaskCard` 头部在聚合多 Runtime 且该行 Runtime 有标签时显示成员 chip（模型层 `useTaskPanelModel` 已保留 runtimeId，只补展示）。
5. i18n：chip/分节所需新文案走 `chat.json` zh/en；成员名本身来自数据不属硬编码文案。
6. 组件测试：Todo 多成员分节与单成员退回扁平视图；TaskCard 多 Runtime 显示 chip、单 Runtime 不显示。

### 不做

- background-tasks / workflow / ports 页签的归属展示（模型层维持现状，后续按需追加）；
- theme-ui 包改动（`TodoTimeline` 已公开导出，desktop 组合即可）；
- 成员视图（`memberViewId`）行为不变——收窄单 Runtime 自然退回现状渲染；
- 不改 `runtime-scope.ts` 的既有函数签名（`collectRuntimeItems` 仍有其他消费方）。

## Given / When / Then

- Given Team 全景会话（协调 + ≥2 成员 Runtime）且多个成员各有待办，
  When 用户打开活动面板 Todo 页签，
  Then 待办按成员分节，每节标题为该成员显示名，全队概览仍可见；进入某成员视图后回到单成员扁平视图、不显示归属标注。
- Given 同一 Team 全景且某成员 Runtime 产出 Task，
  When 用户打开 Task 页签，
  Then 该任务卡片标题旁显示所属成员 chip；普通对话（单 Runtime）中 Task 卡片与现状一致、无 chip。
- Given 普通对话/项目页（单 Runtime 工作空间），
  When 渲染 Todo/Task 页签，
  Then 与现状完全一致（可选字段缺省走原路径）。

## 必须保持

- `ActivityWorkspace` 是 additive 可选字段：所有既有调用点与面板偏好键不受影响；
- 停止/中断/审查等行级动作仍按行 runtimeId 路由（ADR-0111 决策 2）；
- 面签徽标（未完成计数、运行中任务数）仍统计聚合全集。

## 测试与验证

- 层级：组件测试（渲染接线）+ 单元测试（workspace 合同）。
- 命令：`bun scripts/quality/run-vitest.mjs --run <新增/变更测试文件>`；涉及文件 `bun run check:quick -- <files>`；desktop 类型 `bun x tsc --noEmit -p apps/desktop/tsconfig.json`（check 静默跳过 desktop tsc）。

## 交付记录

- 实际修改：
  - `apps/desktop/src/renderer/shared/workspace/activity-workspace.ts`：`ActivityWorkspace` 新增可选 `runtimeLabels`（runtimeId → 展示名），`createActivityWorkspace` 增加可选第 4 参，既有调用点零改动；
  - `apps/desktop/src/renderer/domains/activity-panel/registry/context.ts`：新增 `useActivityRuntimeLabels()`；
  - `apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts`：构建 runtimeLabels（协调 Runtime → 队长显示名、成员 Runtime → 成员显示名，名字缺失留空）并传入工作空间；
  - `apps/desktop/src/renderer/domains/activity-panel/hooks/useTodoTabPanelModel.ts`：改用 `collectRuntimeScoped` 按 runtimeId 归并成 `TodoOwnerGroup[]`，输出 `grouped`（≥2 个有数据且有标签的 Runtime 才分节），扁平 `items` 保留供徽标与单 Runtime 视图；
  - `apps/desktop/src/renderer/domains/activity-panel/components/TodoTabPanel.tsx`：分节渲染（成员名节头 + 每节完成计数 + 既有 `TodoTimeline`），无标签节回落 `activityPanel.todo.unattributed`；
  - `apps/desktop/src/renderer/domains/activity-panel/components/TaskTabPanel.tsx`：`TaskCard` 在多 Runtime 聚合且该行有标签时显示成员 chip；
  - i18n：`chat.json` zh/en 新增 `activityPanel.todo.unattributed`；
  - 新增组件测试 `TodoTabPanel.test.tsx`（4 例）与 `TaskTabPanel.test.tsx`（2 例）。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run TodoTabPanel.test.tsx TaskTabPanel.test.tsx`（apps/desktop cwd）：6/6 通过；
  - 回归 `task-tab.test.tsx`：4/4 通过；
  - `bun x tsc --noEmit -p apps/desktop/tsconfig.json`：本次变更文件 0 错误；
  - `bun run check:quick -- <10 个变更文件>`：Biome 无告警，package-boundaries / coding-agent-architecture / runtime-independence 等守卫 ok。
- 未运行及原因：
  - `ActivityPanel.live-tabs.test.tsx` / `plugin-tabs.test.tsx` 各 2 例失败：`shortcuts.ts:52 window.vetta.config.get()` 未被 mock 的 unhandled rejection，该链无本次/并行在途改动，属 HEAD 既有回归，留待快捷键/终端页负责人修复；
  - `CanvasTabPanel.test.tsx` 4 例失败：并行会话在途新增 `canvasArtifactRevisionAtom` 等未同步进测试 `vi.mock`，归并行会话收口；
  - `check:guards` 的 `build-agent-modes` 失败与 TASK-0069 时相同（并行会话 agent-modes 在途改动）。
- 剩余风险：
  - background-tasks / workflow / ports 页签仍无归属展示（模型层维持 ADR-0111 现状，后续按需追加）；
  - 队长同时拥有协调 Runtime 与成员 Runtime：若两者都有待办会各成一节，节名相同——现网 leader memberRuntime 极少产出待办，出现时信息也无错误归属。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【新增】Agent 团队全景的活动面板现在标注每条待办与任务归属哪位成员：待办按成员分节、任务卡片携带成员标签，多成员并行执行时不再混淆产出归属；普通单会话视图保持原样。
