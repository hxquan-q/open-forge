---
id: TASK-0469
type: task
status: done
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
integration_status: integrated
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

- 实际修改（2026-11-07）：如"做"所列；`ipc/session.ts` 另删两个失效 import（DesktopGoalController、CODING_AGENT_TODO_CLEAR）；测试对 DesktopGoalController 做 class mock（编排语义已有专属测试文件覆盖），sharedRuntime 补 invokeSessionExtension。
- 踩坑记录：注册清单排序按码点（`clearGoal` < `clearQueue`，大写 G < 大写 Q），首跑漏插；preload goal 用例需补 `send/on` 假 ipc 且 invoke 返回须为 HostResponse 信封（`{ok:true,result}`），undefined 会触发 INVALID_REQUEST；管道 `| tail` 再次吞掉 check:quick 退出码（未及时推送，已以显式 `exit=$?` 复核纠正）。
- 实际验证：desktop 定向 2 文件 33 例通过（desktop-host 25 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 663 → 657；`test:impact` 全量通过（desktop + host-protocol）；实现提交 `7204295ed` 后 `test:changed --base origin/dev` 通过并推送 `main:dev`，远端 quality run 42360291016（headSha `7204295ed`）success。
- 未运行与风险：goal/todos 相关推送事件（若有）未迁移；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
