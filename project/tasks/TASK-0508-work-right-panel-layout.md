---
id: TASK-0508
type: task
status: ready
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: 本地重构（PLAN-0032 P5b）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0508-work-right-panel-layout
worktree: unassigned（待创建）
base_commit: 8ec047808
read_paths:
  - apps/desktop/src/renderer/domains/workspace-mode/
  - packages/theme-ui/src/
write_paths:
  - apps/desktop/src/renderer/domains/workspace-mode/
  - project/tasks/TASK-0508-work-right-panel-layout.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/workspace-mode/components/WorkWorkspacePanel.tsx
depends_on: [TASK-0505]
conflicts_with: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# Work 右栏按容器宽度切换布局 + 窄屏抽屉入口 + CollapsePanel 分节（PLAN-0032 P5b）

## 目标

`WorkWorkspacePanel.tsx:110` 当前固定 `w-[340px]`，窗口窄于 640px 时直接 `hidden`；Coding 侧此时有底部抽屉替代（同文件 :107 注释），Work 侧没有任何入口。本 Task 改造为：

1. 按容器宽度自适应布局（参考 P4a `SplitDetailLayout` 的 `@container` 模式）；
2. 窄屏补抽屉入口（与 Coding 侧行为一致）；
3. 四个分节改用 `CollapsePanel`（统一折叠交互，遵循 PLAN-0032 统一规则）。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 worktree `task/TASK-0508-work-right-panel-layout`）
- 可并行 Task：TASK-0506、TASK-0507
- 前置依赖：TASK-0505（SplitDetailLayout 模式可参照）
- 冲突文件/独占路径：仅 `WorkWorkspacePanel.tsx` 与其 direct 测试
- Branch：`task/TASK-0508-work-right-panel-layout`
- Worktree：由 Coordinator 派工时 `bun run worktree:create --task TASK-0508`
- 集成顺序：与 0506/0507 路径不重叠，先到先集成

### 做

- 用 `@container` 替换固定像素媒体查询：宽屏（>= 容器阈值）右栏 340px 固定；窄屏隐藏右栏但暴露底部抽屉入口。
- 抽屉入口视觉与 Coding 侧对齐（先看 Coding 侧实现保持行为一致）。
- 四个分节（待确认实际几个，按现状）改用 `CollapsePanel`。
- i18n：抽屉触发器 aria/title 走 i18n。

### 不做

- 不改 Coding 侧右栏。
- 不动数据流、Hook 数据契约。
- 不重写已有业务逻辑。

## Given / When / Then

- Given：用户进入 Work 工作区
- When：容器宽度足够 / 宽度不足
- Then：宽屏右栏 340px；窄屏隐藏右栏、底部出现抽屉入口；点击抽屉弹出与 Coding 侧一致的 panel；四个分节可独立折叠展开

## 必须保持

- Coding 侧右栏行为不变。
- 数据流契约不变。

## 测试与验证

- 定向测试：`workspace-mode/` 相关测试
- 用户流程：调整窗口宽度跨越阈值、点击抽屉入口、折叠展开每个分节
- 质量检查：`bun run test:impact`、`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：独立评审
- 集成：pending
- 人工功能验收：待验收（用户实机调整窗口宽度走查）
- 发布：未授权

## 功能验收包

- 入口：Desktop → Work 工作区
- 用例 1：窗口宽时右栏固定 340px
- 用例 2：窗口收窄时右栏消失，底部出现抽屉按钮
- 用例 3：点击抽屉按钮，面板自底部弹出
- 用例 4：四个分节可独立折叠/展开，状态当次会话内保持
