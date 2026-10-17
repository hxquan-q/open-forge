---
id: TASK-0293
type: task
status: verifying
priority: P2
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0292]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 6ad47f2d5
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 聚合视图跳过成员历史投影（BUG-0127 路线 5 收尾守卫）

## 目标

`computeTeamTimelineBase` 的 `projectedMemberItems`（`projectMemberConversation` 对全部成员历史的 O(M×history) 重分配投影）唯一消费者是成员视图的稳定化循环；聚合视图（`memberId === undefined`）下整体丢弃。被采纳的 session-updated 每帧重建基座时，聚合视图为观看中的长任务白付全部成员历史投影。加与 TASK-0291 稳定化守卫同型的 `memberId === undefined ? []` 守卫。

## 范围

### 并发评估

- 结论：不支持并行；serial，main 串行；单文件切片。

### 做

- 基座成员投影加聚合视图守卫；`hasMemberConversations` 仍取原始全集长度。

### 不做

- 不改接口字段与其它逻辑；不动主进程。

## Given / When / Then

- Given：聚合视图且 display 携带成员会话，When：基座计算，Then：不执行成员历史投影，输出不变（该结果本就未被消费）。
- Given：成员视图，When：基座计算，Then：照常投影（稳定化仍需）。

## 必须保持

- 既有 157 例渲染端基线全绿（含成员视图稳定化路径）。

## 测试与验证

- 定向：渲染端团队连接器全套（apps/desktop cwd）；完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（消费链已核）；集成：pending；人工验收：随 BUG-0127；发布：未授权。

## 功能验收包

- 聚合视图长任务流式期间基座重建的分配压力下降；无可见行为变化。

## 交付记录

- 实际修改：`computeTeamTimelineBase` 的成员历史投影加 `memberId === undefined ? []` 守卫（消费链已核：projectedMemberItems/latestProjectedMemberItem 唯一消费者是成员视图稳定化循环）；`hasMemberConversations` 仍取原始全集长度。
- 实际运行：渲染端团队连接器 11 文件 157 例全绿 + 完整 `bun run check` exit 0（单轮通过）。
- 未运行及原因：真实 Desktop 聚合视图基座重建分配对照待用户侧复测（随 BUG-0127 人工验收）。
- Worktree：未拆出（serial 单文件切片）。
- 剩余风险：无——守卫分支与既有稳定化守卫同型，行为由全量基线锁定。
