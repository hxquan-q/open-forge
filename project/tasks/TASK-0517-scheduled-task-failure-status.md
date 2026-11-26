---
id: TASK-0517
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: BUG-0198
plan: PLAN-0032
source: upstream c83d5c220（PLAN-0032 D4 等价行为核对发现缺失）
related_requirement: [BUG-0198]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: [BUG-0198]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e620f615b
read_paths:
  - apps/desktop/src/main/scheduler/
  - apps/desktop/src/main/ipc/scheduler.ts
  - apps/desktop/src/preload/api-types/scheduler.ts
  - packages/runtime-core/src/runtime-host/kernel-session-events.ts
write_paths:
  - apps/desktop/src/main/scheduler/task-executor.ts
  - apps/desktop/src/main/scheduler/task-executor.test.ts
  - apps/desktop/src/main/ipc/scheduler.ts
  - apps/desktop/src/preload/api-types/scheduler.ts
  - project/tasks/TASK-0517-scheduled-task-failure-status.md
  - project/tasks/README.md
  - project/bugs/BUG-0198-scheduled-task-failure-recorded-success.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.5/
  - .github/release-notes/v0.1.5.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0517 定时任务失败轮次不再记成成功

## 合同

- 来源与目标：BUG-0198。上游 `c83d5c220` 的等价行为合入（PLAN-0032 D4 拍板要求先核对「失败不记成功」等价行为，核对结论为缺失）。
- 输入 → 输出：runtime `error(turnId)` 事件 → 执行记录与最近运行状态正确落到 `failed`。
- 做 / 不做：做执行器 `turnFailure` 捕获与三态收口、`record.updated` 类型加宽（main+preload 两处）、移植上游回归用例。不做：一次性任务失败后的重试/停用策略变更、渲染层新增 UI、无人值守 `unattended` metadata 语义（另一项核对结论，留待 P9 自动化 ADR）。
- Given / When / Then：定时任务执行轮次发出 `error` 事件后以 `agent_end` 收尾 → 记录 `status: "failed"`、`error` 带消息、`updateTaskLastRun` 收 `failed` → 无 `error` 事件的正常轮次仍为 `success` → `aborted` 仍为 `aborted`。
- 验证：`task-executor.test.ts` 定向测试（新增失败用例红灯先行）+ `bun run check:quick -- <改动文件>` + `bun run check`。
- 人工验收：实机配置一个必然失败的定时任务（如无效 Provider），确认历史与列表显示失败。

## 交付

- 2026-11-26 实施交付（主代理直接实施，红绿流程）：
  - 红灯证据：先移植上游失败轮次用例到 `task-executor.test.ts`，未修复代码上失败（`updateTaskLastRun` 收到 `success` 而非 `failed`）。
  - 实现：与上游 `c83d5c220` 逐义等价——`task-executor.ts` 新增 `turnFailure` 捕获（`error` + `turnId` 事件）、`agent_end`/`aborted` 三态收口（aborted > failed > success）、`record.error` 写入、`updateTaskLastRun` 与 `record.updated` 状态映射；`ipc/scheduler.ts` 与 `preload/api-types/scheduler.ts` 的 `record.updated` status 联合加宽 `"failed"`。
  - 断言形态适配：上游用例的 `toHaveBeenCalledWith` 改为 `mock.calls.some(...) + toBe(true)` 结果式断言，不触碰断言深度基线。
  - 绿灯证据：定向 3/3 通过；`test:impact` 8 文件 108 用例全绿；`bun run check` exit 0（含断言深度、声明头、biome 格式门禁）；`release-notes --check` exit 0；索引检查通过。
  - 消费方核对：`useExecutionHistoryModel` 的 `record.updated` 仅触发重载、`record.error` 已被历史页展示消费；`useTaskListModel` 有 `failed` 文案分支——渲染侧无需改动。
  - 未做：`verify:ui:*` 未授权；人工验收待用户实机配置必失败的定时任务确认历史与列表显示失败。
