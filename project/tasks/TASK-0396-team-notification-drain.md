---
id: TASK-0396
type: task
status: in_progress
priority: P1
owner: apps/desktop/agent-teams
requirement: REQ-0002
plan: PLAN-0024
source: user-request / pendingContinuations 收尾时序假设
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0395]
related_issues: []
related_bugs: [BUG-0151]
execution: parallel
branch: task/TASK-0396-team-notification-drain
worktree: ../open-forge-wt/task-0396-team-notification-drain
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop/src/main/agent-teams/, packages/agent-team/]
write_paths: [apps/desktop/src/main/agent-teams/team-turn-coordinator.ts, apps/desktop/src/main/agent-teams/team-turn-coordinator.test.ts, apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-turn-coordinator.ts]
depends_on: []
conflicts_with: [TASK-0395, TASK-0154]
integration_status: pending
created: 2026-10-23
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Team 通知消费期间的新通知及时续跑

## 目标与范围

验证「首通知处理中第二成员完成」是否依赖 30 秒恢复扫描；若成立登记 Bug、写先红回归后修复，若不成立记录反证并保留有价值的时序测试。归类 Upstreamable。

条件支持并行，但本批代码串行以免基准争抢；Task 独立 Worktree、同成员通道由既有调度器拥有，不新增运行时。输入来自真实内部组装与受控外部 Runtime；输出为稳定测试及必要的收尾重检查。无需依赖 0395 代码，集成排在其后。

## Given / When / Then

- Given 主控正在消费 A 的完成通知，When B 完成并持久通知、随后主控释放，Then B 可及时进入下一准入且每个 notificationId 只消费一次，无需周期扫描推动正常路径。
- Given 通知处理失败/无可续跑任务，When 释放，Then 保留恢复退避而不忙循环。
- Given 中途 stop/delete/新 stop generation，When 旧 continuation 结束，Then 不复活团队或覆盖新一代标记。

## 必须保持

通知 journal 与 receiving workItem notificationIds 是持久准入凭据；取消、权限、任务所有权和成员串行性不变；开始前重读当前状态；不以缩短恢复扫描或反复模型轮询改善延迟。

## 测试与验证

先显式 gate/可控时钟复现，禁止 sleep 猜时序；定向 coordinator/concurrency/notification/waiter；用户流程分派→完成→继续分派→停止→恢复。走仓库 Node runner、test:impact、check:quick 与最终 check。性能工具如需另立指标必须与 0395 分开，不能用假 CPU 分数保留正确性修复。

## 验收分层

工程与独立审查待执行；集成 pending；人工功能验收待实际行为交付；真实 Provider/UI 未授权不跑，发布未授权。

## 功能验收包

两成员错峰完成时主控连续汇总且无重复，停止后保持停止。已完成任务不能因通知恢复被重新执行。

## 交付记录

已确认 BUG-0151：新增正常分派连续流程在基线失败（期望 A/B 两通知、实际仅 A），既有 56 例通过；尚未修改生产代码。0395 因主检出 Autoresearch 指针被其他会话占用暂停性能实验；此 Task 是独立正确性诊断，可先行，不复用实验自动提交。Worktree 待创建；全量历史台账准入例外沿用 WAIVER-0006，目标门禁必须通过。若改变既有协议/生命周期而非修复时序，将先补 ADR/迁移说明。
