---
id: TASK-0126
type: task
status: done
priority: P3
owner: apps/desktop
requirement: []
plan: PLAN-0013
source: ISSUE-0028 候选 C（预算可视化先行）+ pi-subagents FleetView 参照
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: [TASK-0124]
related_issues: [ISSUE-0028]
related_bugs: []
execution: serial
branch: task/TASK-0126-team-session-budget-visibility
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/agent-teams/, apps/desktop/src/renderer/]
write_paths: [apps/desktop/src/renderer/, apps/desktop/src/shared/i18n/locales/, .github/release-notes/, project/tasks/]
exclusive_paths: []
depends_on: [TASK-0124]
conflicts_with: [TASK-0124]
integration_status: integrated
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话预算可视化：成员/会话级 token、回合、时长上屏

## 目标

ISSUE-0028 候选 C 的最小步：把已存在于成员会话 usage 记录里的预算数据聚合投影到团队会话
视图——每个成员的回合数、工具调用数、input/output token、累计时长，与会话级合计。不做
任何熔断，先让「这个团队正在烧多少」对用户可见，为后续是否引入预算上限（ISSUE-0028
A/A'/B）提供数据入口与用户心智。

外部参照：pi-subagents FleetView 的「成员行 = ↻回合 · 工具数 · token · context 占比
（≥85% 标红）· 时长」四元组，证明该信息密度用户可读；本任务只做静态展示，不做其键位
导航与 inline steer。

## 范围

### 并发评估

- 结论：串行——复用 TASK-0124 的阶段化进度投影面与团队会话视图挂载点，并行会互相踩踏
  同一 UI 区域。
- 执行方式：serial，待 TASK-0124 集成后启动；若 0124 长期挂起可降级为独立展示组件。
- 前置依赖：TASK-0124（共享其状态投影）；成员会话 usage 记录可得性需在实施时先核实
  （成员用量数据在主会话实测日志中可见，聚合投影路径待确认）。
- 冲突文件：团队会话视图/进度组件挂载区域，与 TASK-0124 同一排他面。

### 做

- 成员级聚合投影：从成员会话持久记录（usage/轮次）派生 `回合数 · 工具调用数 · input
  tokens · output tokens · 时长`，纯读不重写事件源；
- 会话级合计行：聚合各成员 + 主控用量，显示累计 token 与墙钟时长；
- context 窗口占比在模型声明了 contextWindow 时展示，未声明则省略（参照 FleetView
  的省略策略，不留空槽）；
- i18n 文案 + 发布说明。

### 不做

- 不做预算上限、阈值熔断、wrap-up 警告（ISSUE-0028 A/A'/B 仍挂起，触发条件不变）；
- 不做 token 预测/任务前估算；
- 不改 usage 计量与持久化格式——本任务是纯投影；
- 不做 FleetView 的键盘导航/inline steer/`x` 停止（属交互演进，非本任务范围）。

## Given / When / Then

- Given：团队会话进行中或已完成，其成员会话留有真实 usage 记录；
- When：用户在正常入口打开该团队会话（进行中查看或事后回看历史）；
- Then：看到每成员回合/工具/token/时长行与会话合计，数值与成员会话持久记录一致；
  成员未开始时该行显示为未启动态而非 0 误导。

## 必须保持

- 不改 workItem 状态机、通知投递、usage 计量——本任务是只读投影；
- 主会话已有 usage 显示不受影响；
- 数据缺失（成员会话记录不可读）时优雅省略而非报错阻断会话页。

## 测试与验证

- 单元测试：聚合投影对「成员未启动/运行中/已完成/记录缺失」四态的输出形状；
- 组件测试：成员行与合计行渲染真实数值，非 mock 计数断言；
- 定向运行：`bun scripts/quality/run-vitest.mjs --run <新增/相邻测试>`；
- 一轮编辑后 `bun run check:quick`。

## 交付记录

- 实际修改：
  - `team-session-progress.ts`：新增 `projectMemberUsage`（成员 runtime 持久化 history →
    回合/工具调用/input·output token/累计时长纯聚合）；成员行扩展为全名册（无委派工作项的
    成员显示「未开始」而非 0），行上挂 `usage` 与 `contextPercent`，会话级 `totals` 合计。
  - `useTeamChatModel`：从 `snapshot.display.memberConversations` 与 `contextUsages`
    组装 `memberUsages`/`contextPercentByMember` 传入投影。
  - `TeamSessionProgress.tsx`：成员行第二行渲染 `↻回合 · 工具 N · ↑in ↓out · 时长`
    （复用 `formatCompactTokens`/`formatDurationCompact`），列表底部加合计行。
  - i18n：`agent-teams` 的 `chat.teamProgress` 增加 `metrics/context/total/item.notStarted`（中英）。
- 实际运行：
  - `run-vitest --run team-session-progress.test.ts TeamSessionProgress.test.tsx
    TeamChatDelegationFlow.test.tsx TeamWaitTasksView.test.tsx`（46 用例全过，含
    memberConversations→阶段条的接线流程用例与聚合表驱动用例）。
  - `bun run check:quick`（Biome/guards；`task-worktrees` 存量告警同 0124）。
  - `tsc --noEmit -p apps/desktop/tsconfig.json`。
- 未运行及原因：`verify:ui:*`（用户未授权）；真实 provider 数据未复跑（本任务纯只读投影，
  计量与持久化格式未改）。
- Worktree：unassigned（serial，主 checkout 上 task 分支叠于 TASK-0124）
- 集成记录：`--no-ff` 合入 main 无冲突；合入后定向 4 文件 46 用例与 `check:quick`
  复跑通过（`task-worktrees` 存量告警不变）。
- 剩余风险：工具数按发出的 toolCall 部件计（含在途），回合按 assistant 步数计；
  若 TASK-0122 改变回合/步语义需重评口径。
