---
id: TASK-0010
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: 内存/GPU 占用优化专项调查（2026-09-23）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/app-monitor]
write_paths: [apps/desktop/src/main/app-monitor, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 性能快照追踪器死数据清理

## 目标

`SessionPerfTracker.queueWaitSamples` 只写不读（聚合走 `recordPerfReduction` / `turn.queueWaitMs`），长命会话下无界累积，违反 app-monitor 目录「只保留聚合计数与快照」红线。直接删除。

## 验收

- 排队等待时长聚合行为不变；
- 既有 perf-snapshot 测试全绿。

## 实施摘要（2026-09-23）

- 删除字段、dispose 清理与 push 写入（`apps/desktop/src/main/app-monitor/perf-snapshot.ts`）。
- `perf-snapshot.test.ts` 8/8 通过；`check:quick`（变更文件）通过。
- 提交 `9f554568d`，发布说明 v0.5.59「其他」已留一句。

## 并发结论

支持（无共享写路径），本任务串行完成。
