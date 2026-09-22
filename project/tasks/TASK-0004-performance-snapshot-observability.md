---
id: TASK-0004
type: task
status: ready
priority: P0
owner: apps/desktop/packages/runtime-core
requirement: REQ-0002
plan: PLAN-0002
source_issue: ISSUE-0003
execution: parallel
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [apps/desktop, packages/runtime-core]
write_paths: [apps/desktop, packages/runtime-core]
exclusive_paths: []
depends_on: [TASK-0003]
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# Desktop Runtime 性能快照

## 目标

建立隐私安全、非阻塞的性能快照，能够区分 Main/Renderer/GPU/Heap、Provider、Tool、Compaction、EventBuffer、Queue 和 IPC 延迟。

## 必须保持

- 监控失败不能改变业务结果；
- 不保存 Prompt、文件内容、凭据或可重建私有数据；
- 空闲时低开销，活跃任务和异常时提高采样频率。

## 验收

可以用 Session/Turn 关联一次长任务，并回答主要 CPU/GPU/内存/等待瓶颈。
