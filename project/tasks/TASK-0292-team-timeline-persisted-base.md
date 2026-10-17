---
id: TASK-0292
type: task
status: done
priority: P2
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0291]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: c9c514622
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.test.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队时间线投影持久基座分离（BUG-0127 修复路线 5 第二片）

## 目标

TASK-0291 消除了投影内部的二次扫描后，每个流式 delta 仍触发 `projectTeamConversationTimeline` 全量重算，其中**只依赖 snapshot 的持久侧投影**每次被重复支付：`projectLegacySnapshotMessages`（O(C) 重分配）、`projectMemberConversation`（O(M×history) 重分配）、排序/去重/注解映射——这是流式期间渲染端 GC 压力的主源。把这些抽成**持久基座**（`computeTeamTimelineBase(snapshot, memberId)`），在 `useTeamChatModel` 中走独立 memo（deps 仅 `[snapshot, memberViewId]`），流式 delta 期间跨重算复用；公共投影函数签名不变（可选注入 `base`），既有 50 例直接单测零改动。

基座内容（全部纯 snapshot+memberId）：coordination 消息投影、注解映射、可见用户项过滤、`mergeTeamAgentTurns` 后的持久 agent 项、显示项排序、成员会话投影（含 latest 项）、委派列表与判定闭包、聚合过滤结果、活动回复索引。留每 delta 计算的：成员稳定化 live 分支、活动循环的流状态、可见 leader 工具集合、流合并循环、等待占位、items 组装。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：TASK-0291 已合入（索引在本片迁入基座）
- 冲突文件/独占路径：teamChatModel.ts / useTeamChatModel.ts
- Branch：`main`
- Worktree：不拆出
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- `computeTeamTimelineBase` 导出 + `projectTeamConversationTimeline` 增可选 `base` 入参（缺省内部计算，行为等价）。
- `useTeamChatModel` 增基座 memo 并传入 feedItems。
- 新增等价性测试：带/不带 base 输出逐项一致；同一 base 跨不同 streams 的两次投影正确反映流差异（证明基座不捕获流状态）。

### 不做

- 不改 memo 依赖语义以外的 React 结构；不动 `members` memo（其重算廉价，且 feedItems 本就需随 delta 重算）。
- 不改视图模型类型与 UI。

## Given / When / Then

- Given：同一 snapshot、不同 streams 的两次投影，When：传入同一预计算 base，Then：输出与各自不带 base 的投影逐项一致（等价性），且流内容差异正确呈现。
- Given：流式 delta 连续到达（snapshot 不变），When：feedItems 重算，Then：基座 memo 不失效，持久侧投影零重算。

## 必须保持

- `projectTeamConversationTimeline` 不带 base 时的行为与既有 50 例单测完全一致。
- 基座纯度：不读 streams/pending/members（memberMap 属活动循环标签，留投影内）。
- 排序稳定性（JS 规范保证的 stable sort）确保基座与内联计算逐项一致。

## 测试与验证

- 定向测试：teamChatModel.test.ts（含新增等价性用例）+ 渲染端团队连接器全套（apps/desktop cwd）。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：通过；渲染端团队连接器 11 文件 157 例全绿（155 既有 + 2 新增等价性测试：带/不带 base 输出逐项一致、同一 base 跨不同 streams 正确呈现流差异）；完整 `bun run check` exit 0（首轮未用解构变量与两处格式红，修复后复跑全绿）。
- 技术评审：自审；基座纯度复核（不读 streams/pending/members，memberMap 留投影内）；公共函数缺省内联计算保证既有 52 例直接单测语义不变。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：随 BUG-0127 用户侧复测。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：团队会话流式回复进行中。
- 预期行为：无可见变化；流式期间渲染端分配速率显著下降（不再每个 delta 重建全部持久项视图模型）。
- 不通过表现与已知限制：行为差异由 155 例基线捕获；基座在 snapshot 更新时全量重建（预期，snapshot 更新远稀于 delta）。

## 交付记录

- 实际修改：`teamChatModel.ts` 新增导出 `TeamTimelineBase` 接口与 `computeTeamTimelineBase(snapshot, memberId)`（coordination 投影、注解、可见用户项、merge 后 agent 项、显示项排序、成员会话投影、委派列表/判定闭包/聚合过滤、活动回复索引、hasMemberConversations），`projectTeamConversationTimeline` 增可选 `base` 入参（缺省内联计算）；`useTeamChatModel.ts` 增基座 memo（deps `[snapshot, memberViewId]`）传入 feedItems；`teamChatModel.test.ts` 增 2 例等价性测试。
- 实际运行：渲染端团队连接器 11 文件 157 例全绿；完整 `bun run check` exit 0。
- 未运行及原因：真实 Desktop 流式期间渲染端分配速率对照待用户侧复测（随 BUG-0127 人工验收）。
- Worktree：未拆出（serial 切片）。
- 剩余风险：每 delta 仍重算 items 组装与活动循环（O(I)+O(A)，廉价指针操作）；snapshot 每次更新（含被采纳的 session-updated 末帧）全量重建基座（预期，频率已由 TASK-0290 压低）。
