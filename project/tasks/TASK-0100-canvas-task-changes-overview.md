---
id: TASK-0100
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0009
source: PLAN-0009 决策索引 3（不新增第五个顶层 Tab）
execution: parallel
branch: task/TASK-0100-changes-overview
worktree: ..\open-forge-wt\TASK-0100
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/domains/activity-panel, packages/runtime-storage/src/conversation, packages/runtime-node/src/coding]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/conversation/components/blocks/tool-views]
exclusive_paths: []
depends_on: [TASK-0096]
conflicts_with: [TASK-0098, TASK-0099]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0009]
related_tasks: [TASK-0096, TASK-0097, TASK-0098, TASK-0099]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 任务级跨文件变更总览

## 目标

长对话任务结束后，用户在 Canvas Tab 内切换到「任务变更」分段，即可看到当前会话全部文件变更的累计视图（文件列表 + 加减行统计 + Unified Diff），并支持批量保存到项目。不必再逐个文件或回滚对话历史拼凑 diff。

## 背景事实

- 复用资产就位：`EditDiffView.tsx`（136 行，消费 `DiffPreviewView`）与 `parse-diff.ts` 提供 Unified Diff 解析与染色。
- `edit_file` / `write_to_file` 工具结果已把 `{ diff, firstChangedLine }` 写入 `details`，renderer 侧经 `uiDetails.diff` 消费——**展示用单次执行快照已存在**，本 Task 缺的是按文件聚合与会话级总览。
- Canvas Tab 容器为 `CanvasTabPanel.tsx`（局部组件 `CanvasPreview` / `CanvasArtifactRow`）。
- ADR-0129 与 PLAN-0009 决策索引 3 明确：**不新增第五个顶层 Tab**，变更总览作为 Canvas Tab 内部一级分段控制器。

## 范围

### 并发评估

- **并发结论**：**条件支持**
- **执行方式**：parallel（独立 Worktree 可并行实现；与 TASK-0099 共享 Activity Panel 写范围，集成必须串行）
- **可并行 Task**：TASK-0099
- **前置依赖**：TASK-0096（Canvas 容器结构稳定）
- **冲突文件/独占路径**：与 TASK-0099 的 `apps/desktop/src/renderer/domains/activity-panel` 写入范围重叠；`CanvasTabPanel.tsx` 为共享热点。可在各自 Worktree 独立实现，但必须顺序集成；TASK-0098 也共享该容器。
- **Branch**：`task/TASK-0100-changes-overview`
- **Worktree**：`..\open-forge-wt\TASK-0100`
- **集成负责人**：Coordinator
- **集成顺序**：TASK-0096 之后；TASK-0099 可在独立 Worktree 并行实现，但两者顺序集成；与 TASK-0097 / TASK-0098 也因共享容器文件而串行集成

### 做

- **数据聚合（先行，可独立单测）**：从当前活跃 Session 的工具调用历史中提取含 `uiDetails.diff` 的变更记录（`edit_file`、`write_to_file`、`artifact` 的 `update`），按文件路径聚合为**最新累计变更**。聚合必须是纯函数，可脱离 React 树单测。
- **分段控制器**：Canvas Tab 顶部增加 `[产物列表] | [任务变更 (N)]`，N 为变更文件数；无变更时不显示该分段或显示空态。
- **文件列表**：展示路径、增删改状态、`+加行 / -删行` 徽标。
- **Diff 视图**：选中文件后复用 `EditDiffView` / `DiffPreviewView` 渲染该文件的 Unified Diff。
- **批处理动作**：提供「全部保存到项目」与「放弃全部变更」。保存走既有 `SAVE_TO_PROJECT` 通道；放弃动作必须有确认对话框，且**不得绕过既有 `confirmDialogAtom` 模式**。
- **容错**：工具结果缺少 `details.diff` 时该次变更不计入聚合并静默跳过；同一文件多次修改只呈现最新累计结果。
- 文案走 i18n。

### 不做

- **不新增第五个顶层 Tab**（PLAN-0009 决策索引 3）。
- 不修改 `EditDiffView` / `parse-diff.ts` 的实现（只消费）。
- 不新建存储、不写会话事实、不改变 Session 持久化格式。
- 不实现逐 hunk 接受 / 拒绝。
- 不做回滚到历史版本（`write_to_file` 的 `before` 字节快照属 TASK-0094 范围，不在本 Task）。

## Given / When / Then

- Given：当前会话中 Agent 通过 `edit_file` / `write_to_file` 修改了 3 个不同文件
- When：用户切到 Canvas Tab 的「任务变更」
- Then：列出 3 个文件，各自显示增删改状态与 +/- 行统计；点击任一文件在下方看到其 Unified Diff

- Given：同一个文件在会话中被修改了两次
- When：用户查看任务变更
- Then：该文件只出现一次，展示累计到最新一次的差异

- Given：会话中没有任何文件变更
- When：用户切到「任务变更」
- Then：显示空态提示，不报错、不白屏

- Given：用户点击「放弃全部变更」
- When：确认对话框弹出并确认
- Then：变更被丢弃且界面反映最新状态；未确认时不做任何改动

- Given：既有「产物列表」分段
- When：用户查看
- Then：artifact 列表行为与本次改动前完全一致

## 必须保持

- `EditDiffView` / `parse-diff.ts` 行为与其既有测试不变。
- 工具调用历史的读取是**只读**操作，不改变会话状态、不写事实。
- `artifact` 列表分段的既有行为与数据不变。
- `SAVE_TO_PROJECT` 通道的语义与错误码不变。
- 既有确认对话框模式（`confirmDialogAtom`）不变。
- Activity Panel 顶层 Tab 集合保持 `file / canvas / browser / terminal` 四个。

## 测试与验证

- **单元测试**：聚合纯函数——多文件、同文件多次修改、缺失 `details.diff` 的跳过、空输入。
- **组件测试**：分段切换、文件列表渲染与统计、选中文件切换 Diff、空态、放弃确认对话框。
- **用户流程**：会话内产生 3 个文件变更 → 切到「任务变更」→ 3 个文件全部列出 → 选中查看 Diff → 批量保存。
- **质量检查**：`bun run check`。
- **命令**：
  ```bash
  bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/
  bun run check
  ```

## 交付记录

- 实际修改：
  - 新增 `services/session-changes.ts`：从会话时间线的工具块（`uiDetails.diff`）收敛出按文件的累计视图 —— 同一文件只保留最新一次差异并记录被改次数，缺 diff / 缺路径的记录静默跳过，新增与删除按 `--- /dev/null`、`+++ /dev/null` 判定；全部为纯函数（`sessionChangeCallsFromTimeline` + `collectSessionChanges`）。
  - `useCanvasTabModel`：新增 `section`（artifacts / changes）、`changeFiles` / `changeTotals` / `selectedChange` 与 `selectSection` / `selectChange` / `saveAllArtifacts` / `discardAllArtifacts`；变更视图直接读 `chatMessagesAtom`，是只读投影。
  - `CanvasTabPanel`：列表态顶部加 `[产物列表 | 任务变更 N]` 分段控制器与两个批处理按钮；新增 `CanvasChangesOverview`（文件列表 + 状态 + 增删行 + 选中即复用 `EditDiffView` 展示差异 + 空态），未新增第五个顶层 Tab。
  - i18n：`sectionArtifacts/sectionChanges/changesEmpty/changesEmptyHint/changePickHint/statusAdded|Modified|Deleted/changeCount/saveAllToProject/discardAll/discardAllConfirm/batchSaveSummary/batchDiscardSummary/noArtifactsToSave`。
- 关键决策与依据：
  - **「全部保存到项目」与「放弃全部变更」落到产物、不落到文件**：任务写明保存要走既有 `SAVE_TO_PROJECT` 通道，而该通道是 artifact 维度的；Agent 通过 `edit_file` / `write_to_file` 写出的文件本来就已经在项目里，没有「保存」这一步可做。因此两个批处理按钮作用于画布列表里的产物（逐个 `SAVE_TO_PROJECT` / `DELETE`），文件变更段则保持纯只读审查。逐条撤销入口已由 TASK-0094 的 diff 卡提供，批量回滚不在本 Task（任务明确「不做回滚到历史版本」）。
  - **放弃全部变更必须确认**：走既有 `confirmDialogAtom`，文案写明「本机文件不会自动回收，会话历史与项目文件不受影响」，确认前不调用任何删除。
  - **数据源用会话时间线而不是主进程工具日志**：`uiDetails.diff` 已是 renderer 侧的既有消费面，直接复用可以避免再开一条 IPC 读取路径，也不用碰会话持久化。
  - **「累计」的口径**：同一文件多次修改时不合并 hunk（不做三方合并），展示最新一次差异 + 改动次数；总量按全部变更累计，用于任务级审查。
- 实际运行：
  - `run-vitest.mjs --run src/renderer/domains/activity-panel ...`：47 个文件 221 个用例全部通过（含新增 `session-changes.test.ts` 5 例、面板 3 例：分段汇总与查看差异、空态、批量保存汇总与放弃确认）。
  - `node node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json`：EXIT=0。
  - `biome check --write`（本次改动文件）：通过。
- 未运行及原因：
  - 未运行 `verify:ui:*`：未获 UI 实机授权；分段控制器与长文件列表的滚动表现在组件测试之外。
  - 未做 worktree 隔离：任务声明 `execution: parallel` + 独立 worktree，但本轮与 TASK-0097 / TASK-0098 串行执行（三者互斥同一容器文件），因此在主工作区完成并如实记录。
- 剩余风险：
  - 变更聚合只覆盖带 `uiDetails.diff` 的工具结果；工具没产出 diff 的写入（例如某些 patch 形态）不会出现在总览里。
  - 总量按每次变更累加，与「最新差异的行数」不是同一个数，界面上已把两者分开呈现（列表是单文件最新差异，顶部是累计总量）。
  - 待办：若后续要做「一键回滚全部变更」，需要接 TASK-0094 的快照与 hash 守卫，属新 Task。

