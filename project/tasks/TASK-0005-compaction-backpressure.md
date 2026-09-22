---
id: TASK-0005
type: task
status: ready
priority: P1
owner: packages/coding-agent/packages/runtime-core
requirement: REQ-0002
plan: PLAN-0002
execution: parallel
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-core]
write_paths: [packages/coding-agent, packages/runtime-core]
exclusive_paths: []
depends_on: [TASK-0004]
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# Context Compaction Backpressure

## 目标

避免长 Agent Loop 在上下文阈值附近重复触发 Compaction，或让 Compaction 自身成为新的长时间阻塞。

## 方案边界

- single-flight；
- 阈值滞回和最小间隔；
- reserve tokens；
- Tool Loop 下一次 Model Call 前检查；
- 压缩失败产生可恢复终态；
- 可配置独立压缩模型。

## 测试

连续阈值触发、压缩中再次触发、压缩取消、压缩失败和重启恢复。
