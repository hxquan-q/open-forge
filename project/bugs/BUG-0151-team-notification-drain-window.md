---
id: BUG-0151
type: bug
status: in_progress
priority: P2
owner: apps/desktop/agent-teams
requirement: REQ-0002
plan: PLAN-0024
source: TASK-0396 deterministic concurrency regression
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0396]
related_issues: []
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 主控消费通知期间的新完成通知未在释放后续跑

## 用户流程

- Given：主控已委派 A，A 完成通知触发主控汇总。
- When：主控汇总期间另一项任务 B 完成，随后主控释放执行通道。
- Then：B 的完成结果应沿既有持久通知/成员通道及时触发后续汇总，不依赖周期恢复扫描推进健康路径。

## 实际行为与期望行为

固定两次委派与完成的交错后，主控仅收到 A 的通知。B 已完成，但 A continuation 收尾不重新检查中途到达通知。期望两批通知均准入一次，成员任务不重跑。

## 环境与失败证据

- 基线：main@ea67d951e；Desktop 0.1.3；Windows Bun 1.4.2 + Vitest 4.1.11 Node runner。
- Worktree：task-0396-team-notification-drain，无真实 Provider/用户状态。
- `bun run test:impact -- apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts`：57 例中新增 1 红、既有 56 绿。
- 红测试：`drains a completion received during an initiator continuation without a recovery scan`；期望 `[[A],[B]]`，实际 `[[A]]`。
- 首次裸定向收集因隔离树缺 action-rpc 构建产物失败，随后仓库 impact 入口准备依赖成功；收集错误不算 Bug 复现。

## 最小复现

1. 用显式 deferred gate 在首通知的 Runtime continuation 内暂停，完成 A。
2. 正常工具端口委派 B，等待执行开始和持久完成状态；只 flush 0ms 计时器，不推进 30 秒扫描。
3. 释放首通知，flush 当前异步工作；第二批通知缺失。

## 影响

错峰完成时主控汇总迟滞；既有 30 秒本地恢复扫描可作补偿，但本证据尚未量化真实用户延迟。没有证明持久通知丢失或跨重启不可恢复。

## 根因证据

`TeamTurnCoordinator.scheduleNotification` 用 Set 同时表示排队/执行中的 continuation；中途调度请求因 has(key) 被吞掉，finally 仅 delete。与 journal 提前消费、通道未释放两项假设对照中；新增测试保持正常分派与发布链路。

## 回归测试

连续两项任务、中途通知、持久回执唯一；停止与代次变更不复活；失败/无新增记录不产生空转续跑；已有恢复、取消、预算和独立成员通道测试不退化。

## 修复与验证

- 修复：待实现，预期使用带身份的 pending ownership 与 rerun 标记，仅在本轮仍拥有标记且收到后续调度请求时重新走原准入。
- 测试：红基线已记录；绿与完整检查待执行。
- 未运行：真实 Provider/UI、性能自动实验（主检出共享配置被另一会话占用）；此项作为独立正确性修复，不伪造性能分数。
