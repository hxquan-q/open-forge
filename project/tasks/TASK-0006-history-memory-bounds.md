---
id: TASK-0006
type: task
status: ready
priority: P1
owner: runtime-node/runtime-core/apps/desktop
requirement: REQ-0002
plan: PLAN-0002
execution: parallel
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-node, packages/runtime-core, apps/desktop]
write_paths: [packages/runtime-node, packages/runtime-core, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0004]
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# 长会话历史与事件缓冲上限

## 目标

限制完整 JSONL 读取、Runtime Event Relay、Renderer Projection、Tool/MCP 结果和 Team 子会话造成的累积内存增长。

## 必须保持

- Conversation/Event Log 仍是恢复事实；
- 事件顺序、terminal event 和旧会话读取保持兼容；
- 不以丢失恢复事实换取表面内存下降。

## 验收

长流、长会话、Renderer reload、Session switch 和重复 dispose 场景下，缓冲有界且能恢复。
