---
id: TASK-0506
type: task
status: verifying
priority: P2
owner: apps/desktop + packages/theme-ui
requirement: REQ-0008
plan: PLAN-0032
source: 本地重构（PLAN-0032 P4d），无上游直接对照
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0506-weknora-split-detail-and-view-model
worktree: unassigned（已集成，待推送后清理）
base_commit: 7ae82222bd97add9ef8adeff4aeb321335163256
read_paths:
  - apps/desktop/src/renderer/domains/weknora/
  - packages/theme-ui/src/scheduler/
  - packages/theme-ui/src/layout/
write_paths:
  - apps/desktop/src/renderer/domains/weknora/
  - packages/theme-ui/src/scheduler/
  - project/tasks/TASK-0506-weknora-split-detail-and-view-model.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/weknora/
depends_on: [TASK-0505]
conflicts_with: []
integration_status: integrated
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# WeKnora 接入 SplitDetailLayout，平铺 props 收 view model（PLAN-0032 P4d）

## 目标

把 WeKnora 页改造成符合 PLAN-0032「本地面板统一规则」的三层结构（Page / useWeKnoraViewModel / 纯展示 View），接入 P4a 已交付的 `SplitDetailLayout`，平铺 props 收拢为 view model 对象；会话栏复用 `ResizeHandle` 支持拖宽与折叠（**重写**现有自写 motion 收起动画），批量操作与导出迁入 `ButtonGroup`；保留 `apps/desktop/DESIGN.md:283` 登记的边距特例。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 worktree `task/TASK-0506-weknora-split-detail`）
- 可并行 Task：TASK-0507、TASK-0508
- 前置依赖：TASK-0505 P4a SplitDetailLayout 已交付
- 冲突文件/独占路径：`apps/desktop/src/renderer/domains/weknora/` 整目录独占
- Branch：`task/TASK-0506-weknora-split-detail`
- Worktree：由 Coordinator 派工时 `bun run worktree:create --task TASK-0506`
- 集成顺序：与 TASK-0507/0508 路径不重叠，先到先集成

### 做

- `WeKnoraPageView` 平铺 props（当前约 33 字段）收成单个 `viewModel` 对象 + `actions` 对象，对照 `useMemoryPageModel` 的 Page/Model/View 分层。
- 会话列表迁移进 `SplitDetailLayout` 的 list 列；右侧详情列接当前会话主区。
- 会话栏宽度用 `ResizeHandle`（拖宽）+ 折叠按钮；**删除并替换** `weknora-sidebar-animation.test.tsx` 当前覆盖的自写 motion 收起动画，改用 `SplitDetailLayout`/ResizeHandle 已有的折叠过渡。
- 批量操作（批量删除、批量导出）进 `ButtonGroup`，遵循 P2 移植过来的键帽/按钮组模式。
- 保留 `DESIGN.md:283` 边距特例；不改业务逻辑、IPC、数据层。
- i18n：en/zh `weknora.json` 用户可见文案走 i18n。

### 不做

- 不改消息流、对话 API、检索逻辑。
- 不动 `apps/desktop/src/main/` 或 preload。
- 不调整 Allstar / Work 右栏（属于 TASK-0507/0508）。

## Given / When / Then

- Given：用户打开 WeKnora 页
- When：拖动会话栏分隔条 / 点击折叠按钮 / 缩小窗口
- Then：会话栏平滑拖宽折叠；窄屏下详情独占整页（继承 SplitDetailLayout 行为）；批量操作通过 ButtonGroup 触发；68 个 weknora 测试文件全绿

## 必须保持

- `DESIGN.md:283` 边距特例保留。
- `useWeKnoraModel` 内部数据流与 IPC 契约不变。
- 现有 `data-testid` 用户可见行为兼容；如因结构调整必须改 testid，需同步修改全部消费方测试。

## 测试与验证

- 定向测试：`apps/desktop/src/renderer/domains/weknora/` 全部测试文件（当前 68 个），重点 `weknora-sidebar-animation.test.tsx` / `weknora-visual-layout.test.tsx` / `weknora-top-whitespace-layout.test.tsx` / `WeKnoraPageView.test.tsx`
- 用户流程：手动建立会话、发送消息、批量选择、批量导出、折叠/展开侧栏、拖宽
- 质量检查：`bun run test:impact -- apps/desktop/src/renderer/domains/weknora/`、`bun run check`

## 验收分层

- 工程验证：worker 自验 desktop 全包测试 68 文件 495 通过（round2 终态）；Coordinator 集成后 weknora 定向 5 文件 18/18 通过。域内唯一失败 `weknoraExport.cp3-reverify.test.ts` AC-7（UTF-8 字节截断组合上限）在干净 base commit `7ae82222b` 上同样复现，属 pre-existing，与本切片无关。
- 技术评审：独立评审
- 集成：integrated；Worker 提交 `7add1f22d`（task/TASK-0506-weknora-split-detail-and-view-model），由 Coordinator 于 2026-11-25 合入本地 main。
- 人工功能验收：待验收（用户实机走查 WeKnora 页布局、拖宽、折叠、批量操作）
- 发布：未授权（沿用 TASK 批次推送授权，不另行发布）

## 功能验收包

- 入口与前置条件：Desktop 启动后进入 WeKnora 页面（侧边导航），存在至少一个会话
- 用例 1：拖动会话栏右缘，宽度跟随且在 200px~480px 区间
- 用例 2：点击折叠按钮，会话栏收起；再次点击展开
- 用例 3：窗口宽度 <780px 时详情独占整页，返回按钮回列表
- 用例 4：多选会话后顶部 ButtonGroup 出现批量删除/导出
