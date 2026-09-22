---
id: TASK-0003
type: task
status: ready
priority: P0
owner: packages/runtime-core/apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source_bug: BUG-0001
created: 2026-09-22
updated: 2026-09-22
depends_on: [TASK-0002]
---

# Session 取消与恢复 Deadline

## 目标

Provider、Tool、MCP、Approval 或 Compaction 不响应取消时，Session 切换、新建和恢复不能永久等待。

## 必须保持

- 旧 Turn 未安全结束前不静默启动新 Turn；
- UI 不得只把 running 改成 false；
- 超时必须进入明确的 failure/cancelled/recovery_required 终态；
- 旧事件和资源释放结果可重建。

## 测试

使用忽略 AbortSignal 的 Fake Provider/Tool，覆盖取消、Session 切换、重复停止、重启恢复和资源释放。
