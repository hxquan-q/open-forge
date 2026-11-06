---
id: TASK-0460
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: []
plan: []
source: user-request
related_requirement: []
related_plan: []
related_tasks: [TASK-0459]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3626913bb
read_paths:
  - apps/desktop/src/renderer/domains/weknora/weknora-background-flow.test.tsx
  - apps/desktop/src/renderer/domains/weknora/weKnoraStreamEngine.ts
write_paths:
  - apps/desktop/src/renderer/domains/weknora/weKnoraStreamEngine.ts
  - apps/desktop/src/renderer/domains/weknora/weknora-background-flow.test.tsx
  - project/tasks/TASK-0460-weknora-ac20-flake-fix.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# weknora AC-20 时序用例偶发修复

## 目标

`weknora-background-flow.test.tsx` AC-20（后台终态合并为一次重拉）当日 3 次全量跑失败 2 次、隔离复跑恒过，按 TASK-0454 记录的"再次复现即修复"约定立本任务收口，恢复门禁信号可信度。

## 根因（2026-11-07 实测修订）

- 初判"两个 act 被真实时钟拉开超窗"不成立：合并同 tick 连发后仍复现（8 跑 5 失败）。
- 打点实证（引擎排期/触发 + listSessions 栈）：AC-20 断言窗口内触发的重拉来自**早于本用例 500ms 武装的定时器**——weKnoraStreamEngine 的状态按设计模块级存活（订阅常驻），跨用例残留的 reload 定时器闯进下一用例；且 `state.reload` 引用由最近挂载刷新，触发时打在当前用例的计数器上。隔用例定时 + 归属刷新的组合使失败呈时序概率性（当日全量 3 跑 2 败、隔离 8 跑 5 败）。

## 做（修订后）

- 引擎登记表 WeakMap → Map（定时器回调持状态引用，WeakMap 条目实际不可回收；生产恒为默认 store 无增长面），新增导出 `resetWeKnoraStreamEngineForTest()`（清在飞定时器与全部引擎状态）。
- 测试文件 `beforeEach` 调用重置，阻断跨用例泄漏；两个终态同 tick 连发的测试侧合并保留（前提更确定）。
- 生产语义不动：`scheduleBackgroundReload` 维持原固定窗口「已有排期即跳过」实现（尾随去抖试验过、非根因，已还原）。

## 不做（修订后）

- 不改去抖窗口语义与时长；不引入 fake timers。

## Given / When / Then

- Given 引擎无跨用例残留 / When 后台两路终态同 tick 到达 / When 500ms 窗口结束 / Then 恰好一次 `listSessions`，800ms 后仍无第二次；无弹窗。

## 测试与验证

- 修后该文件连续 8 跑全绿（修复前 8 跑 5 败）；weknora 全域 68 文件 496 例通过；`apps/desktop typecheck` 通过。

## 交付记录

- 实际修改（2026-11-07）：`weKnoraStreamEngine.ts`（Map + ForTest 重置导出 + 注释修订，去抖实现还原原样）、`weknora-background-flow.test.tsx`（beforeEach 重置 + AC-20 同 tick 连发）。
- 实际验证：目标文件 8/8 绿；weknora 目录 68 文件 496 通过 1 跳过；typecheck 通过；`check:quick`（同步 0459 索引行后）通过。
- 未运行与风险：`test:impact`/`test:changed` 门禁随批次执行；生产路径改动仅为登记表容器与测试导出，行为面（订阅幂等、去抖、事件路由）不变。
- 人工验收：不适用（测试稳定性修复 + 内部隔离钩子）。
- 发布：不适用
