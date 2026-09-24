---
id: TASK-0037
type: task
status: done
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
integration_status: integrated（forge/dev 工作区，未提交）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

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
  - `packages/runtime-core/src/runtime-host/session-event-subscriber-queue.ts`：按 (sessionKey, handler) 隔离的有界队列（上限 4096）；同 (sessionId,type,contentIndex) 相邻 ephemeral 合并为**拼接 delta**（字符串 delta 连接，不丢字）；仅 marker 类 ephemeral 可在压下丢弃；delta 携带与终态事件（done/error/compaction 等）一律不丢——无可丢 marker 时允许队列超限也不 shift 必需事件；`flushSync` 移除（原逐事件即排即送使队列永不积累，背压是死代码），改 microtask 批量投递，终态事件先冲出排队 ephemeral 再投递，保持顺序；`dispose`/`release(sessionKey)` 清理。
  - `packages/runtime-core/src/contracts.ts` + RuntimeHost facade：`readSubscriberDeliveryStats` 暴露每订阅者 `{queued, coalesced, dropped, delivered}` 计数。
  - `apps/desktop/src/main/app-monitor/perf-monitor-service.ts`/`perf-snapshot.ts`：perf monitor 保留订阅 handler/sessionKey 引用，快照轮询把丢弃/合并计数并入 `aggregates.eventDelivery`，可在诊断包快照中定位背压热点。
  - `apps/desktop/.../conversation-projection.ts`：renderer 端 pending 队列同样改为 delta 拼接合并 + 终态永不丢 + `readStats()`；合并扫描遇到非 ephemeral 事件即停止（修掉跨 toolcall_start 误并丢块的回归）。
  - `useSessionEventController`：终态事件（done/error）走即时 `flushDeltas` 不等 100ms 节流。
- 实际运行：
  - `packages/runtime-core` runtime-host 测试 19/19 绿（订阅者队列合并/丢弃/终态必达/按 sessionKey 隔离、relay 批量化 live 无损+replayed 保序、stats 访问器）。
  - `conversation-projection.test.ts` 7/7 绿（新增 delta 拼接、终态不丢、丢弃计数断言）。
  - `useSessionManager.queue` 9、`useSessionManager.session-switch` 9、`cross-session-leak` 1 绿。
  - `tsc --noEmit`（runtime-core + desktop 本任务文件）0 错误。
- 未运行及原因：
  - `bun run check` 全量：受工作区其他 Agent 在途错误影响暂不可绿，本任务文件已过 lint/format。
  - 生产环境突发流量实测：合并/丢弃语义由确定性单测覆盖，真实 Provider 突发回放无本地基线场景。
- 剩余风险：
  - 投递从逐事件改 microtask 批量后，极短时窗内订阅者看到的事件数减少（合并后）；reducer 按 contentIndex 追加，语义等价，但依赖「每 delta 一次回调」的假设型消费者需注意（现有订阅者均按累积态消费）。
  - replay_finished 语义：重放流仍按原始事件逐条投递（不合并），live 侧合并——跨断言测试已按「live 无损、replayed 保序」更新。
- Release Notes（候选，待 ISSUE-0007 首发版本切入后写入 Open Forge 自己的 `v*.md`；此前不写入继承的 Vetta `v0.5.59`）：
  - 「改进」：模型回复突发提速时界面更稳，结束状态不再丢失：此前模型瞬时吐出大量事件时，投递队列会把排在末尾的事件挤掉——极端情况下可能丢掉回合结束信号；队列也一直处于「来一个发一个」的空转状态。现在连续的增量事件会无损合并成一批投递，只有纯标记类事件在压力下可丢弃，正文与结束/错误等终态事件一律必达；被丢弃的标记事件数计入性能快照，便于排查。
