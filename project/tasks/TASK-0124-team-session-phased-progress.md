---
id: TASK-0124
type: task
status: done
priority: P3
owner: apps/desktop
requirement: []
plan: PLAN-0013
source: ISSUE-0027-D + ISSUE-0025（45min 仅「正在努力工作…」无阶段提示）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0025, ISSUE-0027]
related_bugs: []
execution: serial
branch: task/TASK-0124-team-session-phased-progress
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/main/agent-teams/]
write_paths: [apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/shared/i18n/locales/, .github/release-notes/, project/tasks/]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话阶段化进度展示（委派/执行/审计/收尾）

## 目标

实测 45min 任务期间用户只看到「正在努力工作…」动画与偶发的 timeout 载荷文本，无法区分
「在抽取数据」「在建页面」「在审计」。把成员任务状态机（已有 durable workItem：
running/waiting/completed）投影为团队会话页的阶段化进度条/阶段标签。

## 范围

### 并发评估

- 结论：必须串行——状态机投影面跨主进程与 renderer，且依赖 TASK-0122 确定的回合语义
  （阶段边界是否随让出回合而变）。
- 执行方式：serial。
- 前置依赖：TASK-0122 落地后定义阶段语义；UI 侧先完成 `docs/ui-review.md` 审查顺序推演。
- 冲突文件/独占路径：agent-teams domain 视图与 session 状态读取面。

### 做

- 设计阶段模型：以 workItem 状态机 + 通知 journal 为事实源，投影为「分派 N 项/执行中/审计中/
  收尾」的用户可懂阶段；
- timeout 载荷在 UI 折叠为「等待成员完成」类中性文案，不再原文展示结构化 JSON；
- 保持 ISSUE-0027-D 定位：先可见、可解释，不省时间。
- 外部参照：pi-subagents（tintinweb）FleetView——每成员一行渲染 `类型 · 任务摘要 ·
  ↻回合数 · 工具调用数 · token · context 占比（≥85% 标红）· 时长`，Enter 打开该成员
  的实时会话层可 inline steer，`x` 两次确认停止；完成的成员短暂驻留后退出列表。
  我们的阶段模型不必照搬键位交互，但「成员行 = 回合/token/状态/时长四元组 + 可点开
  看实况」是被验证的信息密度形态。

### 不做

- 不改 workItem 状态机与通知投递；
- 不做进度百分比（无可靠分母）；
- 不做质检分级（ISSUE-0027-A 挂起中）。

## Given / When / Then

- Given：团队会话有 ≥1 个委派中的长任务；
- When：成员执行期间用户查看会话页；
- Then：看到当前阶段（谁在做什么/等待什么），timeout 不再以裸 JSON 出现；任务完成时阶段
  推进到收尾。

## 必须保持

- workItem 状态与通知语义为唯一事实源，UI 不维护第二份状态；
- 长会话无 UI 泄漏/重复挂载。

## 测试与验证

- 定向测试：阶段投影纯函数（workItem 集合 → 阶段标签）表驱动用例；视图组件测试断言阶段文案；
- 用户流程：组件级渲染测试（真实 state 投影），不升 E2E；
- 质量检查：`test:pkg` + `check:quick`。

## 交付记录

- 实际修改：
  - 新增 `connectors/team/team-session-progress.ts` 纯投影（snapshot.activities → 阶段/状态计数/成员行）
    与 `TeamSessionProgress.tsx` 阶段条组件，挂到 `TeamChatView` subHeader（成员胶囊条下方）；
    `useTeamChatModel`/`teamChatModel` 暴露 `teamProgress` 视图模型字段。
  - 新增 `tool-views/TeamWaitTasksView.tsx`，在 `ToolCallBlock` 对 `team_wait_tasks` 结构化
    JSON 结果折叠为中性文案（仍在等待/有更新 + 各状态计数），原始载荷仍可从工具卡展开查看。
  - i18n：`agent-teams` 加 `chat.teamProgress.*`，`chat` 加 `teamWaitTasks.*` 与
    `toolLabel.alias.team_wait_tasks`（中英）。
- 实际运行：
  - `run-vitest --run team-session-progress.test.ts TeamSessionProgress.test.tsx
    TeamWaitTasksView.test.tsx TeamChatDelegationFlow.test.tsx`（41 用例全过，含新增的全链路
    流程用例：queued→running→收尾→settled 经真实 model + IPC 边界 mock）
  - `bun run check:quick`：Biome/guards 通过；`task-worktrees` 告警为 TASK-0045∩0122/0123
    的存量重叠，与本任务无关。
  - `tsc --noEmit -p apps/desktop/tsconfig.json`（desktop 定向类型检查）
- 未运行及原因：`verify:ui:*`（用户未授权）；E2E 不必要——组件级流程测试已覆盖真实接线。
- Worktree：unassigned（serial 任务按合同在主 checkout 的 task 分支执行，未建独立 worktree）
- 集成记录：`--no-ff` 合入 main（`v0.1.2.md`「其他」与 TASK-0045 各增一条、双双保留）；
  合入后定向 4 文件 46 用例与 `check:quick` 复跑通过（`task-worktrees` 存量告警不变）。
- 剩余风险：阶段语义是只读投影，不改动 workItem 状态机；TASK-0122 落地后若回合边界语义变化，
  仅需重评 `wrapping` 判定（leaderBusy 输入点）。
