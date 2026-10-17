---
id: TASK-0291
type: task
status: verifying
priority: P2
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0283, TASK-0288, TASK-0289, TASK-0290]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: ddafc8d8f
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
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

# 团队时间线投影 O(n²) 扫描索引化（BUG-0127 修复路线 5 第一片）

## 目标

`projectTeamConversationTimeline`（teamChatModel.ts）是渲染端每个流事件/快照事件后的全量重算入口（`useTeamChatModel` 的 `feedItems`/`members` memo 依赖 `streams`，流式期间每个 delta 触发一次）。其内部多处嵌套线性扫描随会话规模二次增长（BUG-0127 报告 §7.1 第一轮逐行核实的代码事实，当时渲染端 idle 只是主进程阻塞掩盖）：

- 活动循环 `coordinationAgentItems.find(matchesActivityReply)`（:569，O(A×C)）与 `Object.values(streams).map().find`（:573，O(A×S)）；
- `leaderDelegations.some(matchesActivityReply)` 两处（:510 过滤 O(C×D)、:665 流过滤 O(S×D)）；
- 流循环文本兜底 `persistedAgentItems.some(authorId && publicAgentText ===)`（:692，O(S×A'×文本长度)，全文字符串比较是最大常数）；
- 成员稳定化循环 `coordinationAgentItems.find(sameMemberTurnEvidence)`（:478，O(M×C)）在聚合视图（`memberId === undefined`）下**结果未被使用**却照常计算（display 投影恒存在）。

本片全部索引化/惰化，判等语义逐条等价：

- 活动回复查找：按 `authorId:turnId` / `authorId:id` / `authorId:parentId` 建首现位置索引，四子句各自最早命中位置取最小 = 原-find 的首个匹配项；
- 委派成员判定：`Map<targetMemberId, {requestIds, sourceTurnIds}>` 一次构建，逐条 O(1) 查；
- 文本兜底：`Map<authorId, Set<text>>` 每次投影只算一遍各持久项文本（原实现每个流回合重复计算全部持久项文本）；
- 聚合视图跳过成员稳定化（其副作用 `consumedPublicRenderKeys`/`consumedLiveMessageIds` 均不出该闭包，live 分支本就要求 `memberId !== undefined`）。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`teamChatModel.ts`
- Branch：`main`
- Worktree：不拆出（单文件纯函数切片）
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- 上述四处索引化 + 聚合视图惰化；纯函数行为保持。
- 渲染端行为基线（useTeamChatModel / TeamChatDelegationFlow / TeamChatFailureTerminalLoop 等既有套件）全绿复验。

### 不做

- 不改 `useTeamChatModel` 的 memo 依赖结构（React 语义风险，留待独立切片）。
- 不动 `mergeTeamAgentTurns`、`projectMemberConversation` 等线性投影本体。
- 不改任何视图模型类型或 UI 展示。

## Given / When / Then

- Given：任一既有渲染端行为测试场景（委派流、失败终态、流式重放等），When：投影重算，Then：输出 items 与改造前逐项一致（基线即证明）。
- Given：聚合视图（无 memberId）且 display 含成员会话，When：投影，Then：不再执行成员稳定化循环，输出不变。
- Given：长会话大 activities/coordination 条目数，When：投影，Then：活动循环与流循环成本线性于条目总数而非乘积。

## 必须保持

- `matchesActivityReply` / `sameMemberTurnEvidence` 的判等语义（含 undefined turnId/parentId/sourceTurnId 的边界）。
- find 的"数组序首个匹配"语义（首现位置索引 + 取最小位置等价）。
- 文本兜底只对非空文本生效（空文本不是内容证据）。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/connectors/team`。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：通过；渲染端团队连接器行为基线 11 文件 155 例全绿（含 teamChatModel 直接单测 50 例、useTeamChatModel 流式流 32 例、TeamChatDelegationFlow 委派流 6 例——正是被索引替换的判等语义的行为覆盖；渲染端套件需以 `apps/desktop` 为 cwd 运行，仓库根运行的收集期红为 `@shared/*` 别名解析的既有 cwd 依赖，与本改动无关）；完整 `bun run check` exit 0（首轮 parentId `string | null` 守卫与两处格式红，修复后复跑全绿）。
- 技术评审：自审；索引等价性逐子句复核（四子句首现位置取最小 = find 的数组序首个匹配；`parentId` 可空已显式排除 null；文本兜底 Set 与原 some 扫描同一快照集、懒构建零闲置成本；聚合视图跳过稳定化的副作用封闭性论证记录于代码注释）。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：随 BUG-0127 用户侧长任务复测一并覆盖。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：桌面端团队会话（聚合与成员视图）长任务流式运行。
- 预期行为：无可见变化；流式期间渲染端每 delta 的投影成本从二次降线性。
- 不通过表现与已知限制：行为差异由既有基线捕获；memo 频率未变（下一片）。

## 交付记录

- 实际修改：`teamChatModel.ts`——活动回复查找改 `ActivityReplyIndex`（byTurnId/byId/byParentId 首现位置，持久项与流消息各一）；两处 `leaderDelegations.some` 改 `buildDelegationReplyCheck` 闭包（target→requestIds/sourceTurnIds 集合）；流循环文本兜底改懒构建的 `Map<authorId, Set<text>>`；聚合视图（`memberId === undefined`）跳过成员稳定化循环（副作用封闭性已论证并注释）；删除无调用者的 `matchesActivityReply`（语义并入索引文档注释）。
- 实际运行：渲染端团队连接器 11 文件 155 例全绿；完整 `bun run check` exit 0。
- 未运行及原因：真实 Desktop 长任务下渲染端投影耗时对照待用户侧复测（随 BUG-0127 人工验收）。
- Worktree：未拆出（serial 单文件切片）。
- 剩余风险：投影重算频率未变（`useTeamChatModel` memo 依赖 `streams`，每流事件全量重算——这是路线 5 第二片的候选）；`sameMemberTurnEvidence` 的成员稳定化查找在成员视图仍为线性（M、C 为单成员会话规模，量级小）。
