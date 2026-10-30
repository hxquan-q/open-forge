---
id: TASK-0418
type: task
status: verifying
priority: P1
owner: ssh-transport
requirement: REQ-0002
source: TASK-0412 gate bzbpubblu; BUG-0057
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412, TASK-0165]
related_issues: [ISSUE-0035]
related_bugs: [BUG-0057]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [packages/ssh-transport/, project/]
write_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts, project/tasks/TASK-0418-ssh2-handshake-budget-floor.md, project/tasks/README.md, project/bugs/BUG-0057-ssh2-new-host-interactive-auth-starvation.md, project/bugs/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, .github/release-notes/fragments/v0.1.4/task-0418-ssh2-handshake-budget-floor.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# SSH 握手预算不再被建连前时钟吃掉

## 目标与范围

续接 BUG-0057。`readyTimeout` 已改取调用方 deadline 的剩余时间，但 `remainingMs()` 用 `Date.now()` 相减。bzbpubblu 中期望 240000、实际 239999。握手预算不得短于调用方给出的 `timeoutMs`；已过去的时间只在真正超过 1ms 后扣减。不改 ConnectTimeout、交互提示或默认 4 分钟。

## 并发评估

必须串行：与 TASK-0412 共用主检出和交付候选，没有实现 Worker。不与 TASK-0419 的 Desktop 文件重叠。

## Given / When / Then

- Given 调用方 `timeoutMs` 为 240000，When 建连前经过不足 1ms，Then `readyTimeout` 仍为 240000。
- Given 已过去超过 1ms，When 读取剩余预算，Then 按整毫秒扣减且至少为 1。
- Given 没有调用方 deadline，When 建连，Then 仍用默认 4 分钟。

## 必须保持

不提高 timeout/retry，不新增 skip，不放宽原 240000 断言。不连接真实 SSH，不使用用户主机或凭据。

## 测试与验证

仓库 Node runner、单 worker 运行 `packages/ssh-transport/src/ssh2-runner.test.ts`，原 240000 断言保持，定向 27/27 通过。第十批冻结候选 b6c7y60gc 的 ssh-transport 为 21 文件通过、1 文件既有跳过，236 项通过、25 项既有跳过，239999 未再出现。该结果不表示已发布。
