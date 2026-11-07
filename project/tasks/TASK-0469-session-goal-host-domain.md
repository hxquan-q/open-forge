---
id: TASK-0469
type: task
status: in_progress
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0468]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 369804316
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/conversations/desktop-goal-controller.ts
  - packages/coding-agent/src/features/goal/contracts.ts
write_paths:
  - packages/host-protocol/src/domains/session-goal.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-goal-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0469-session-goal-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0468]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话 goal/todos 子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 2 片）

## 目标

`vetta:session:goal-{get-state,start,pause,resume,clear}` 与 `clear-todos` 六通道迁为 `session.*` Host 方法（TASK-0465 组 1 元数据/模式尾部），renderer 签名不变，旧 handler 删除。goal 操作经 `DesktopGoalController`（唯一编排点，ADR 语义保留），clearTodos 经 session extension。

## 做

- `domains/session-goal.ts` 六方法合同：getGoalState（快照 `CodingAgentGoalState | null`）、startGoal（objective minLength 1）、pause/resumeGoal（goalId）、clearGoal（→Null）、clearTodos（→Boolean）；`CodingAgentGoalState` 形状钉定（goalId/objective/status 五枚举/statusDetail?/tokensUsed/timeUsedSeconds/continuationCount/createdAt/updatedAt）。
- `host/session-goal-domain.ts`：每调用 `new DesktopGoalController(getSharedRuntime())`（无状态编排器）；desktop-host 注册第七领域；`ipc/session.ts` 删 6 handler、6 枚举项；preload 6 处 `host.call`；host-transport union 扩 SessionGoal。
- 测试先行：注册清单 30 → 36 与 goal 域用例（快照/编排透传 + 空标识 INVALID_PARAMS）。

## 不做

- 不动 goal 事件推送（goal-changed 若有，走旧 IPC）；不迁移 UPDATE_SETTINGS/SET_EXECUTION_MODE（编排断言复杂，另片处理）。

## Given / When / Then

- Given 任意 goal/todos 状态 / When 六方法经 Host 合同调用 / Then 行为与旧通道一致（start 的 continue 失败回滚 pause 语义保留在 DesktopGoalController）；空标识/objective → `INVALID_PARAMS`；旧 6 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 663 → 657；门禁链 + quality 过滤核实。

## 交付记录

- （实施中）
