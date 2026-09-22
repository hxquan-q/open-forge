---
id: TASK-0015
type: task
status: ready
priority: P1
owner: runtime-core/runtime-storage/apps-desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, packages/runtime-storage, packages/runtime-node, apps/desktop]
write_paths: [packages/runtime-core, packages/runtime-storage, packages/runtime-node, apps/desktop]
exclusive_paths: [packages/runtime-core/src/task]
depends_on: [TASK-0008]
conflicts_with: [TASK-0016]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# Task/Artifact 最小纵向切片（implementation-plan 阶段 1）

## 目标

把 `@vetta/runtime-core/task` 的冻结合同接到真实 Session/Turn 生命周期上：
Task 创建/计划/运行/暂停/完成/失败/取消绑定 root Session 与 Turn；
Artifact descriptor 与事件 projection 落盘到已有 JSONL/ConversationRepository；
Desktop Activity Panel 消费 Task observation；重启后可从事件日志恢复。

## 范围

### 并发评估

- 结论：不支持并发（占住 `runtime-core/task` 合同与 Activity Panel 投影）
- 执行方式：serial
- 前置依赖：TASK-0008（合同已冻结）
- 冲突：TASK-0016（Approval 事件将复用 Task observation 通道）
- 集成负责人：coordinator

### 做

- Task 生命周期服务：绑定既有 Session/Turn，驱动 `RuntimeTaskEvent` 状态机（start/resume/审批放行必须带 turnId）；
- Artifact descriptor 投影 + `resolveArtifactAvailability` 接真实文件存储；
- Task/Artifact 事件写入 Conversation 事件日志，重启经 `rebuildRuntimeTaskSnapshot` 恢复；
- Activity Panel 新增 Task tab（计划/当前步/终态/恢复入口），消费 Runtime observation 而非 Agent 私有状态。

### 不做

- 独立 Task Runner / 第二套模型循环；
- Renderer 持有最终 Task 状态；
- Plugin 私自持久化 Artifact；
- 新数据库；
- L0-L4 风险策略（阶段 2）。

## Given / When / Then

- Given：用户在会话里发出一个多步骤请求；
- When：系统升级为 Task 并执行，期间用户暂停/取消/关闭应用再重启；
- Then：Task 状态随 Session/Turn 正确流转，Activity Panel 可见实时进度与终态，重启后 Task 与 Artifact 引用完整恢复。

## 必须保持

- Task 不拥有第二套 Session/Turn 执行循环；
- Artifact 文件内容是唯一事实源，descriptor 可重建；
- 事件顺序 = 状态机提交顺序；`identity.generation` 全程不变；
- 取消/失败进入明确终态（复用 BUG-0001/0002 的 deadline 合同）。

## 测试与验证

- 定向：`runtime-core` task 集成测试（真 Session/Turn + 内存存储）、桌面 projection 组件测试；
- 用户流程：发起多步骤任务 → 看 Activity → 重启恢复；
- 质量检查：`bun run check:quick`、desktop tsc、runtime-core 全包。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
