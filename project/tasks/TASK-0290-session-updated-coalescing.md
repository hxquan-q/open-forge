---
id: TASK-0290
type: task
status: done
priority: P1
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0283, TASK-0288, TASK-0289]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: c189ae15a
read_paths:
  - apps/desktop/src/main/agent-teams/
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
write_paths:
  - apps/desktop/src/main/agent-teams/team-session-update-publisher.ts
  - apps/desktop/src/main/agent-teams/team-session-update-publisher.test.ts
  - apps/desktop/src/main/agent-teams/team-session-service.ts
exclusive_paths:
  - apps/desktop/src/main/agent-teams/team-session-service.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队 session-updated 发布合并与无订阅跳过（BUG-0127 修复路线 6 第一片）

## 目标

`session-updated` 是携带**全量** `TeamSessionSnapshot`（session + 整份协调会话公开消息投影 + activities，IPC 层再附加 display 投影）的刷新通道。当前 `publishSessionUpdated` 被 12 处调用（投递状态每次变化、工作项结算、成员调度、迁移、重试等），长任务期间每次调用都：构建全量快照 → IPC 序列化整包 → 渲染端全量 setSnapshot 触发 React 重渲染。会话内容随任务线性增长，这条通道的每次成本 O(会话规模)，且渲染端对旧帧本来就按 revision 拒收——中间帧是纯浪费。

本片做**零合同变更**的降本（主进程侧）：

1. **短窗合并**：同一 team 会话的多次发布请求在一个短窗口（缺省 32ms）内合并为一次，flush 时用 `sessionState` 中的**最新** session 构建快照——爆发式投递状态迁移只发末帧。
2. **无订阅跳过**：flush 时无订阅者则完全跳过（连快照构建都省）——团队任务在后台跑、用户不在看时这是纯 CPU 浪费；迟来的订阅者由 `subscribe()` 既有的一次性初始 `session-snapshot` 补齐，语义不变。
3. **删除/逐出清理**：`deleteSession` 与空闲逐出 drop 挂起中的 flush；flush 时 session 已不在内存则跳过（不发布陈旧快照）。

安全依据：渲染端 `session-updated` 处理按 `session.revision`/`conversationRevision` 判新拒旧（`useTeamChatModel.ts:360-377`），中间帧缺失只影响被末帧覆盖的瞬态；流式增量走独立事件通道不受影响；`setStatus("ready")` 的末帧延迟 ≤ 窗口时长（不可感知）。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`team-session-service.ts` 与新调度器文件
- Branch：`main`
- Worktree：不拆出（单切片，无并行写者）
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- 新增 `team-session-update-publisher.ts`：按 sessionId 的挂起表 + 定时 flush（缺省 32ms），`request(session)` / `flush(sessionId)` / `drop(sessionId)`。
- `team-session-service.ts`：12 处 `publishSessionUpdated` 调用点改走调度器；`deleteSession` 与空闲逐出调用 `drop`。
- 单元测试：同窗多次 request 合并为一次且用最新 session、不同会话独立、无订阅者跳过、session 移除后 flush 跳过、drop 取消。

### 不做

- 不改 `DesktopTeamSessionStreamEvent` 合同（preload/渲染端零改动）——真正的增量协议留待后续独立切片评估。
- 不动 `subscribe()` 的初始 `session-snapshot`（首帧必须同步完整）与 `publishSessionSnapshot`。
- 不做渲染端投影 O(n²)（路线 5）。

## Given / When / Then

- Given：同一会话在合并窗口内发生 N 次状态变更，When：窗口到期，Then：恰好发布一次 `session-updated`，快照取最新 session。
- Given：flush 时该会话无订阅者，When：窗口到期，Then：不构建快照也不发布。
- Given：会话在挂起期间被删除/逐出，When：窗口到期（未被 drop），Then：不发布陈旧快照。
- Given：渲染端正在观看（有订阅者），When：状态变更，Then：末帧在窗口时长内到达，revision 新于本地即被采纳。

## 必须保持

- 事件合同与载荷形状不变；渲染端零感知（除事件更少、末帧至多多延迟一个窗口）。
- `session-snapshot`（订阅首帧）保持同步完整。
- 调度器属 agent-teams 领域层，不放 `main/ipc/`（IPC 层保持薄）。
- flush 先移除挂起项再发布，发布异常不破坏后续调度。

## 测试与验证

- 定向测试：新调度器单元测试（fake timers）+ `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/agent-teams`。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：通过；新调度器单元 5/5（fake timers：爆发合并取末帧、跨会话独立、无订阅跳过、内存移除后不发布陈旧快照、drop 取消）；agent-teams 目录 35 文件 240 例全绿（既有团队流零回归，证实无同步依赖 session-updated）；完整 `bun run check` exit 0（首轮仅导入排序红，修复后复跑全绿）。
- 技术评审：自审；渲染端消费语义复核（`useTeamChatModel.ts` 按 revision 判新拒旧、prune 与流事件次序不因延后产生新风险类别）；`session-snapshot` 订阅首帧保持同步完整。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：随 BUG-0127 用户侧长任务复测一并覆盖。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：桌面端团队会话长任务运行（投递/工作项状态频繁迁移）。
- 预期行为：无可见行为变化；主进程 IPC 序列化量与渲染端全量重渲染次数显著下降（后台运行时趋零）。
- 不通过表现与已知限制：末帧至多延迟一个合并窗口（≤32ms）；跨窗口的稀疏更新不合并（每窗一帧，预期）。

## 交付记录

- 实际修改：新增 `team-session-update-publisher.ts`（按 sessionId 挂起表 + 32ms 窗口定时 flush，request/flush/drop）与 5 例单元测试；`team-session-service.ts` 12 处发布调用点改走 `requestSessionUpdate` 调度器（注入协调器/成员执行器的回调同路），`deleteSession` 与空闲逐出补 `drop`，`publishSessionUpdated` 保留为 flush 目标。
- 实际运行：agent-teams 目录 35 文件 240 例全绿；完整 `bun run check` exit 0。
- 未运行及原因：真实 Desktop 长任务下 IPC 序列化量/渲染端重渲染次数的量化对照待用户侧复测（随 BUG-0127 人工验收）。
- Worktree：未拆出（serial 单切片）。
- 剩余风险：末帧至多延迟一个窗口（≤32ms，刷新通道不可感知）；跨窗口稀疏更新不合并（每窗一帧，预期）；真正的增量协议（载荷瘦身）留待后续独立评估——本片只减帧不减帧大小。
