---
id: TASK-0122
type: task
status: verifying
priority: P2
owner: packages/agent-team + plugins/preset-agent
requirement: []
plan: PLAN-0013
source: ISSUE-0025 实测（会话 91c32cf7：38 次 wait / 34 次 timeout / 主控 input 503,860）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0025]
related_bugs: []
execution: parallel
branch: task/TASK-0122-team-leader-yield
worktree: .worktrees/task-0122
base_commit: main
read_paths: [packages/agent-team/src/, packages/plugins/presets/preset-agent/agent/prompts/, apps/desktop/src/main/agent-teams/team-task-control-service.ts, apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts]
write_paths: [packages/agent-team/src/task-runtime-tools.ts, packages/agent-team/test/, packages/plugins/presets/preset-agent/agent/prompts/master.md, apps/desktop/src/main/agent-teams/, .github/release-notes/]
exclusive_paths: [packages/agent-team/src/task-runtime-tools.ts, packages/plugins/presets/preset-agent/agent/prompts/master.md]
depends_on: []
conflicts_with: [TASK-0123]
integration_status: integrated（主工作区串行实施；未创建独立 worktree，因本轮无并行 Task 同写这些路径）
created: 2026-09-26
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 团队主控「分派后让出回合」引导 + team_wait_tasks 超时载荷瘦身

## 目标

消除实测中主控以 `team_wait_tasks` 轮询挂起单回合 ~89% 时间的空转：让模型知道「分派完毕即可
结束回合，完成通知会唤醒你」，并把每次 timeout 返回的全量 workItem JSON（实测 ~7-8KB/次）
瘦身为最小状态载荷。两处改动属同一 concern（让主控便宜地不空转），合并为一个 Task。

## 范围

### 并发评估

- 结论：条件支持并行——写面集中在 agent-team 工具合同与 preset 提示词；与 TASK-0123 在
  `apps/desktop/src/main/agent-teams/` 与 `.github/release-notes/` 有写范围重叠，已登记
  `conflicts_with`，两者可各自独立实施但必须按声明顺序集成；与同目录其它在途改动需先
  `git status` 确认。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0123；TASK-0124/0125 与本任务有逻辑依赖不在同一批。
- 前置依赖：无。
- 冲突文件/独占路径：`task-runtime-tools.ts`、`master.md`。
- Branch：`task/TASK-0122-team-leader-yield`。
- Worktree：独立 worktree。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0013 阶段 1 首项。

### 做

- `master.md`：在编排纪律段补「分派后应结束回合；完成通知会自动唤醒本会话；`team_wait_tasks`
  仅用于需要中途汇总的短等待或快照，不得用它把回合挂起等待全部完成」；
- `team_wait_tasks` timeout 返回瘦身：`reason:"timeout"` 分支只回 `{teamTaskId, state, revision,
  updatedAt}`，不回 `workItem.objective` 全文等非状态字段；正常完成/暂停返回维持全量；
- 工具描述同步一句：等待全部完成时应结束回合而非循环等待（与 master.md 对齐，不重复条约全文）；
- 检查 `team_get_task` 是否同路径返回全量——若是且属观察用快照语义，保持现状不做（快照就该全）。

### 不做

- 不改 wait 的阻塞语义、上限（60s）与「timeout 不取消任务」合同；
- 不动 workItem 持久化模型与通知 journal；
- 不做运行时强制挂起（ISSUE-0025 方案 C，挂起待复测数据）；
- 不改上游已改动的 `team_delegate_task` 描述（rebase 时取上游版本）。

## Given / When / Then

- Given：主控已分派 ≥1 个长任务且无其它待办；
- When：主控在提示词引导下选择结束回合（而非循环 wait）；
- Then：任务完成通知以 `triggerTurn` 唤醒主控续跑，主控在新回合集成结果；若主控仍调用
  `team_wait_tasks` 且任务超时，返回的 timeout 载荷不含 objective 等大字段。

## 必须保持

- 任务完成通知（`agent-team.task-completed.v1`）持久化与 `triggerTurn` 投递语义不变；
- `team_wait_tasks` 完成/暂停/`attention-required` 分支返回结构不变（只有 timeout 分支瘦身）；
- timeout 绝不取消或失败任务的语义不变；
- `team_wait_tasks`/`team_delegate_task`/`team_get_task` 输入 Schema 不变。

## 测试与验证

- 定向测试：`task-runtime-tools` timeout 分支的合同测试（载荷只含状态四元组；完成分支仍全量）；
  `runtime-tools.test.ts` 现有 wait 用例更新；
- 用户流程：受控夹具团队会话（`team-session-concurrency.test.ts` 模式）断言「分派→回合结束→
  通知触发续跑」链路不破；
- 质量检查：`bun run test:pkg agent-team` + `bun run check:quick`。

## 交付记录

- 实际修改：
  - `packages/plugins/presets/preset-agent/agent/prompts/master.md`：分派句后补「全部分派完且只剩等待时结束回合而非轮询；完成通知会自动唤醒；`team_wait_tasks` 仅用于回合内短等待或快照」。
  - `packages/agent-team/src/task-runtime-tools.ts`：`team_wait_tasks` 描述同步让出回合指引；`reason:"timeout"` 分支对模型可见文本只回 `{teamTaskId, state, revision, updatedAt}` 四元组，`details`（UI 工具卡）仍保留全量快照；`state-changed`/快照路径外的分支不变。
  - `team_get_task` 保持全量返回（观察用快照语义，按要求不动）。
- 实际运行：`bun run test:pkg agent-team` 12 文件 85 例通过（新增 timeout 瘦身与 state-changed 全量两例，旧实现下瘦身用例红）；desktop 侧 `TeamWaitTasksView`/`team-task-waiter` 11 例通过；`bun run check:quick` 全绿。
- 未运行及原因：真实 ~45 分钟团队会话量化复跑属 TASK-0125（本任务前置项），未在本轮执行；「分派→回合结束→通知唤醒」链路由 `team-session-concurrency.test.ts` 既有用例（durable delegate / interrupted leader continuation）覆盖。
- Worktree：主工作区（无并行 Task 占用这些路径）。
- 剩余风险：提示词引导是软约束，模型仍可能轮询（方案 C 运行时强制挂起按 ISSUE-0025 待复测数据再评估）；timeoutMs=0 快照同走 timeout 分支，模型侧也只回四元组，需要全量时用 `team_get_task`。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑包级与桌面侧相关套件。真实团队会话本轮未驱动。

| 合同条款 | 本次读数 |
|---|---|
| 主控在提示词引导下结束回合、任务完成通知以 `triggerTurn` 唤醒续跑 | `packages/agent-team` **整包 12 文件 / 85 例通过**（含提示词侧 `runtime-tools.test.ts` 更新的 wait 用例）；桌面 `team-task-waiter.test.ts`、`team-runtime-manager.test.ts`、`team-member-function-source.test.ts`、`TeamWaitTasksView.test.tsx` **4 文件 / 20 例通过** |
| `team_wait_tasks` 超时载荷瘦身 | 同上（`runtime-tools` 侧断言载荷形态） |
| 用户流程：分派 → 回合结束 → 通知唤醒 | 交付记录自己写明由 `team-session-concurrency.test.ts`（durable delegate / interrupted leader continuation）既有用例覆盖；本轮未新增该文件读数 |

- **未覆盖**：真实 ~45 分钟团队会话的量化复跑——交付记录明确指出这属 **TASK-0125（本任务前置项）**，不在本任务范围；因此「主控真的少 wait 了」这一**行为量级**结论本轮无数据，只有机制级（通知唤醒链路）证据。
- **关闭建议**：机制与提示词侧测试级成立，倾向 `done`；行为量级归 TASK-0125。是否要求先等 TASK-0125，请用户裁定。
