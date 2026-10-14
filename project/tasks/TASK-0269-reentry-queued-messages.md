---
id: TASK-0269
type: task
status: ready
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream 61072cbb3 + 64c3ff927（重进会话面）
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0260, TASK-0261]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: 待实施时定（依赖收口后的干净基线）
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md]
write_paths: [apps/desktop/src/renderer/domains/conversation, project/tasks/TASK-0269-reentry-queued-messages.md]
exclusive_paths: []
depends_on: [TASK-0260, TASK-0261]
conflicts_with: [TASK-0260, TASK-0261]
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 重进运行中会话的排队消息显示（对照上游 61072cbb3，defer 至依赖收口）

## 目标

上游修复：回复过程中排队的消息被自动发出后，离开再回到该会话时全部堆到列表末尾、后续回复被并进第一条回复。上游修在其 feed 架构上；本仓消息列表与队列路径已分叉（TASK-0185 等），先对照证伪/证实本仓是否同病，证实才适配。

## 范围

### 并发评估

- 结论：不支持并行——`SessionMessageList.tsx`/`MessageListFooter.tsx` 正是 TASK-0260/0261 在途改动
- 执行方式：serial，等依赖收口后从干净基线开始
- 前置依赖：TASK-0260、TASK-0261
- Branch：main；Worktree：视届时主树状态定

### 做

- 依赖收口后按本仓队列/重挂载路径写最小复现（重进运行中会话 + 在途排队消息）；证实则修复使重进与持续停留显示一致；证伪则记录证据关闭。

### 不做

- 不搬上游 feed/attach 架构；不动发送队列本身的顺序语义（TASK-0185 成果）。

## Given / When / Then

- Given：会话回复中用户排队的消息已被自动发出；When：切走再切回该会话；Then：消息位置与一直停留时一致，后续回复不并入第一条。

## 必须保持

- 本仓乐观消息因果顺序与队列修复不回退。

## 测试与验证

- 定向：conversation 组件测试（重进场景）；质量：`test:impact`、批末 `bun run check`。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。人工功能验收：待验收。发布：未授权。

## 功能验收包

- 入口：运行中会话排队消息 → 切换会话 → 切回。
- 预期：显示一致；不通过：排队消息堆尾或回复并段。

## 交付记录

- 实际修改：待回填；实际运行：待回填；未运行及原因：待回填；Worktree：待回填；剩余风险：待回填
