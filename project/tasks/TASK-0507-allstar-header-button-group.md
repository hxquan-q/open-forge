---
id: TASK-0507
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: 本地重构（PLAN-0032 P5a）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0507-allstar-header-button-group
worktree: unassigned（已集成，待推送后清理）
base_commit: 7ae82222bd97add9ef8adeff4aeb321335163256
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
  - packages/ui/src/button-group.tsx
  - packages/theme-ui/src/
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/
  - project/tasks/TASK-0507-allstar-header-button-group.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
depends_on: [TASK-0505]
conflicts_with: []
integration_status: integrated
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# Allstar 页头「打开项目 / 新建会话」迁入 ButtonGroup（PLAN-0032 P5a）

## 目标

把 `AllstarDevHomePageView` 页头当前零散的「打开项目」「新建会话」按钮改造为 P2 移植好的 `ButtonGroup`，遵循 PLAN-0032 本地面板统一规则中的「页头右侧按钮组」骨架；卡片网格保持现有密度不动。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 worktree `task/TASK-0507-allstar-header-button-group`）
- 可并行 Task：TASK-0506、TASK-0508
- 前置依赖：TASK-0505（P2 ButtonGroup 已在 theme-ui/ui 落地）
- 冲突文件/独占路径：仅 `AllstarDevHomePageView.tsx`，无跨 Task 冲突
- Branch：`task/TASK-0507-allstar-header-button-group`
- Worktree：由 Coordinator 派工时 `bun run worktree:create --task TASK-0507`
- 集成顺序：与 0506/0508 路径不重叠，先到先集成

### 做

- 页头「打开项目」「新建会话」按钮合并为 `ButtonGroup`，主按钮 + 次按钮或分段按钮（按密度定）。
- 保持卡片网格密度不变（TASK-0491 刚调整到 125% 放大 + 32px gap-x）。
- i18n：按钮文案沿用 en/zh 现有键，缺失补齐。
- 遵守键帽组件规则：若新会话有快捷键展示，使用 `VettaKbd`。

### 不做

- 不改卡片网格宽度、间距、对齐。
- 不动 `useAllstarDevHomeModel` 数据流。
- 不动会话行菜单（TASK-0492 范围）。

## Given / When / Then

- Given：用户进入 Allstar 版块首页
- When：查看页头右侧
- Then：「打开项目 / 新建会话」以统一 ButtonGroup 呈现；视觉与其它面板（自动化/记忆/WeKnora）一致

## 必须保持

- 卡片网格密度（13rem 列宽 + 32px gap-x）。
- 现有键盘快捷键行为。

## 测试与验证

- 定向测试：`AllstarDevHomePageView` 相关契约测试
- 用户流程：点击两个按钮验证路由与对话框依旧触发
- 质量检查：`bun run test:impact`、`bun run check:quick`

## 验收分层

- 工程验证：定向契约测试 27/27；`test:impact` 17 文件 113/113；`check:quick` 全绿；`check` 的 desktop typecheck 与 guards 通过，整体 exit 1 仅因 pre-existing 的 docs-site/mobile install 缺失。Coordinator 集成后定向复跑 27/27 通过。
- 技术评审：自审 + verifier 复查
- 集成：integrated；Worker 提交 `4bac1883b`（task/TASK-0507-allstar-header-button-group），由 Coordinator 于 2026-11-25 合入本地 main。
- 人工功能验收：待验收（用户目视确认密度与按钮组外观）
- 发布：未授权

## 功能验收包

- 入口：Desktop → Allstar 版块首页
- 用例 1：页头按钮组排列整齐，主按钮视觉突出
- 用例 2：点击「打开项目」弹出原对话框；点击「新建会话」走原新建流程
