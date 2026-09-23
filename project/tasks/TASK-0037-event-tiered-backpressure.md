---
id: TASK-0037
type: task
status: ready
priority: P1
owner: packages/runtime-core
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-3
execution: serial
branch: forge/dev
worktree: unassigned（kernel 事件总线改动面收敛，可独立 worktree 并行）
base_commit: forge/dev
read_paths: [packages/runtime-core/src/kernel, packages/runtime-core/src/runtime-host]
write_paths: [packages/runtime-core/src, .github/release-notes]
exclusive_paths: [packages/runtime-core/src/kernel]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# 事件分级背压：中间 delta 可合并、终态必达

## 目标

现有背压只压载荷不分级；`ConversationProjection.pendingAssistantEvents` 无硬上限、由 100ms flush 约束排空。引入两档投递语义：中间流 delta 允许合并/丢弃（UI 只需最新值快照），终态事件（finish/tool result/error/cancel）限时必达；丢弃计数进遥测。

## 范围

### 并发评估

- 结论：支持——kernel 事件总线为独占路径，可开 worktree 与 desktop 侧任务并行；
- 业界参照：Crush 有界 pubsub——每订阅者 channel 4096、中间态满即丢 + 告警 + 计数、终态事件 50ms 限时必达（`internal/pubsub/broker.go:18-40`）。

### 做

- 事件总线区分「中间态可丢」与「终态必达」两档投递语义；
- 订阅者队列硬上限 + 满时合并/丢弃策略 + 丢弃计数指标；
- UI 侧确认 delta 合并后无丢块（最新值快照语义）。

### 不做

- 不改事件 Schema 与持久化事件流（JSONL 记录仍完整有序）；
- 不让终态事件可丢；
- 不动现有 compaction backpressure 参数面（`backpressure.ts:30-34`）。

## Given / When / Then

- Given：一次高吞吐工具流（每 token 一事件的合成流）
  When：订阅者消费速度低于产生速度
  Then：中间 delta 被合并/丢弃、队列水位封顶、丢弃计数可观测；终态事件全部限时到达，UI 最终状态与无丢弃场景一致

## 必须保持

- 终态事件不丢、不乱序；
- 取消/错误语义不变；
- JSONL 事件记录完整（丢弃只发生在 UI 投递侧，不影响事实源）。

## 测试与验证

- 定向测试：可控时钟下的队列满合并/丢弃、终态必达、计数断言；
- 用户流程：高吞吐流式会话中 UI 无丢块、无队列膨胀；
- 质量检查：`bun run test:pkg runtime-core`；合成流对比队列水位。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
