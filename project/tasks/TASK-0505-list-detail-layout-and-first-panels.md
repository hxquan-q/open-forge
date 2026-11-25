---
id: TASK-0505
type: task
status: in_progress
priority: P2
owner: packages/theme-ui + apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: upstream（list+detail 分屏 / memory / weknora / automation 面板改造，commit 清单见下）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0500, TASK-0504]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f512718
read_paths:
  - packages/theme-ui/src/layout/
  - apps/desktop/src/renderer/domains/memory/
  - apps/desktop/src/renderer/domains/weknora/
  - apps/desktop/src/renderer/domains/scheduler/
write_paths:
  - packages/theme-ui/src/layout/
  - packages/theme-ui/src/
  - apps/desktop/src/renderer/domains/memory/
  - apps/desktop/src/renderer/domains/weknora/
  - apps/desktop/src/renderer/domains/scheduler/
exclusive_paths: []
depends_on: [TASK-0500, TASK-0504]
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0505 通用「列表 + 详情」分屏布局与本地面板第一批（P4）

## 目标

在 theme-ui 抽一个「列表 + 右侧详情」分屏布局：详情可拖宽（复用 `layout/ResizeHandle`），容器宽度不足时详情独占整页（参照上游 `3e161ba8e` 的 `@container` 做法）；内置加载、空、错误、降级四种状态与滚动渐隐。记忆、WeKnora、自动化三处面板共用该布局。

## 上游测绘结论（scout，2026-11-25）

- **上游没有共享「列表+详情」布局组件**：`theme-ui/src/layout/` 仅 `AppFrame/MainContentFrame/ResizeHandle/SidebarDock/SidebarOverlay`，无 SplitView/MasterDetail。分屏逻辑以内联 Tailwind 存在于 `AutomationPageView`/`ProjectDetailPageView`。**P4a 是本地净新建组件**，上游仅提供 `3e161ba8e` 的 `@container`/`@[780px]` 写法（固定 `w-[400px]` 列，非可拖）。
- **上游不存在 Memory、WeKnora 页面**：两者均为本地重构，非移植。仅自动化有上游 pre-image。
- **自动化是唯一真移植**：核心 `d324bac37`（列表+右侧分屏，27 文件 +1297/−1551）+ ~15 个跟进（`4fddd2c43` `3fa3e8713` `d85b5d25c` `728412034` `ece5cf1d5` `17038a389` `de487a047` `d25f2683a` `3e161ba8e` `6a73da6b0` `89062e29f` `2543c5aec` `5e07c8bd1` `607a72a99` `f940900be` `0111d7cde`）。
- **D4 陷阱**：上游 post-image 依赖本地没有的「间隔重复」「运行会话策略」「打开聊天」，且删掉了本地保留的 `permissionTiers`/`trigger`（`SchedulerTaskFieldsView`）。必须逐 hunk 选移植，不能整文件覆盖。

## 四个切片（四个提交）— 按可验证性排序

- **P4a（共享布局，theme-ui/layout，净新建）**：以 `AutomationPageView` 的 `@container`+`@[780px]` 结构为骨架，接入 `ResizeHandle`（可拖宽，超上游固定 400px）与四态（加载/空/错误/降级）+ 滚动渐隐。本地先例 `project/ProjectDetailPageView.tsx:137`。
- **P4b（自动化，唯一上游对照）**：renderer 移植 `AutomationDetailPane/FieldRows/PromptField/useAutomationDetailModel`，删 `HistoryDrawer*`/`TaskFormDialog*`/`useHistoryDrawerModel`/`useTaskFormModel`，改用共享布局；**保留本地 `permissionTiers`/`trigger`**。theme-ui `AutomationPageView` 重写为分屏。
- **P4c（记忆，本地重构）**：`MemoryPage` 拆 Page/`useMemoryPageModel`/纯 View 三层；弹窗态进 model；详情入右分屏；切换/搜索改 `SegmentedControl`+现有输入；外层 `px-8 pb-8`。
- **P4d（WeKnora，本地重构，最大回归面）**：平铺 props 收 view model；会话栏复用 `ResizeHandle`+折叠（**重写自写 motion 收起动画**，同步改 AC-10~12/sidebar-animation/collapse/state 测试）；批量操作与导出进 `ButtonGroup`；保留 DESIGN.md 边距特例。

## 适配要点

- 共享布局组件落 `packages/theme-ui/src/layout/`，经 `package.json#exports` 导出；依赖已就绪（`ResizeHandle` 148 行、`SegmentedControl` 92 行、`ButtonGroup`）。
- `@container` 分屏回退按 `3e161ba8e`；`ResizeHandle` 可拖宽是本地增强（上游固定 400px）。
- 顺序理由：自动化是唯一有上游 diff 可验证共享布局正确性的消费者，先做；Memory 体量小作第二验证；WeKnora 回归面最大放最后。

## 不做

- 不改面板业务逻辑与数据层。
- 不动 Allstar/Work 右栏（P5）、用量页（P6）、顶栏（P7）。
- 自动化不引入「间隔重复」「运行会话策略」「打开聊天」（本地无此前置）。

## 验收（Given/When/Then）

- `bun run check` 全过；相关单测绿（含 WeKnora 68 个测试文件回归）。
- 三处面板窄容器下详情独占整页、可拖宽详情。
- 记忆页三层结构（Page/Model/View）落成。

## 已确认（2026-11-25）

- 共享布局：**新建可复用组件** `SplitDetailLayout`（theme-ui/layout）：`ResizeHandle` 可拖宽 + `@[780px]` 窄屏详情独占 + 四态（加载/空/错误/降级）+ 滚动渐隐，三面板共用。
- 切片顺序：**P4a 布局 → P4b 自动化 → P4c 记忆 → P4d WeKnora**。
- WeKnora：**本轮全做**（重写自写动画 + 改 68 测试）。

## 切片进度

- P4a 共享布局：完成（`10410561b` 新增、`5f13c033c` 修正）。
- P4b 自动化分屏：完成（`12d79c636`；含 `automation-status.ts`、`useAutomationDetailModel`/`AutomationDetailPane`、删除 `HistoryDrawer*`/`TaskFormDialog*`/`useTaskFormModel*`，D03 例外已登记 DESIGN.md 与 design-exceptions.json）。
- P4c 记忆、P4d WeKnora：待做。
