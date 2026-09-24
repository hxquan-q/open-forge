---
id: TASK-0100
type: task
status: ready
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
conflicts_with: [TASK-0098]
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

- **并发结论**：**支持并发**
- **执行方式**：parallel（独立 Worktree）
- **可并行 Task**：TASK-0099
- **前置依赖**：TASK-0096（Canvas 容器结构稳定）
- **冲突文件/独占路径**：无独占；`CanvasTabPanel.tsx` 为共享热点，与 TASK-0098 冲突，集成时串行
- **Branch**：`task/TASK-0100-changes-overview`
- **Worktree**：`..\open-forge-wt\TASK-0100`
- **集成负责人**：Coordinator
- **集成顺序**：TASK-0096 之后；与 TASK-0097 / TASK-0098 串行集成（同一容器文件）

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
- 实际运行：
- 未运行及原因：
- 剩余风险：
