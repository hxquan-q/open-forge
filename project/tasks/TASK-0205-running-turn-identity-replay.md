---
id: TASK-0205
type: task
status: done
priority: P1
owner: runtime-core
source: user-request（继续参考上游完善）；RESEARCH-0022 缺口 #4 第一片
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0204, TASK-0152, TASK-0185]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f39c3430e575e0867474a9c049378051577e9ba62
read_paths: [packages/runtime-core/src/runtime-host, packages/runtime-core/src/contracts.ts, apps/desktop/src/main]
write_paths: [packages/runtime-core/src/contracts.ts, packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts, packages/runtime-core/src/runtime-host/runtime-host-session-operations.ts, packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.test.ts, project/tasks/TASK-0205-running-turn-identity-replay.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0204]
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行，随本片提交）
created: 2026-10-04
updated: 2026-10-04
---
<!-- Copyright The Open Forge contributors. -->

# 暴露运行中回合身份并重放本轮工具事件

## 目标、范围与适配策略

适配上游 422983be7（缺口 #4 feed/attach 的底座第一片，本仓事件面等价）：中途接入的订阅方（桌面端切回运行中的会话）目前只能拿到 `currentTurnStartedAt`，只能把末尾消息当成当前回合，续跑回合会接到上一轮气泡上；工具执行不在重放缓冲里，切回后运行中的工具状态丢失。本片：

1. `SessionStateSnapshot.currentTurnId?: string`——relay 从 assistant 通道事件的 `turnId` 学习当前回合身份（本仓 runtime 通道 lifecycle 不携带 turnId，与上游 `conversation.turn.started` 事件不同源），`agent_end` 清除；`readCurrentTurnId` 暴露给 operations 快照。
2. in-flight 重放缓冲收录 `tool.start`/`tool.phase`/`tool.end`（display-only，沿用既有 4096 有界上限与尾部丢弃，不设 terminalReason）——保留本仓内存保护，不引入上游无界 recordTurnReplay（RESEARCH-0022 拒绝项）。

不做：不引入 `conversation.*` 事件系列；不改 IPC/desktop 打开会话路径（后续片：9e18d7f84 attach 接入 → c28c4d4d1 IPC → 1203755a7 desktop 切换 → feed reducer 大切片）；不动 message-stream/投影层。

### 并发评估

- 结论：不支持并行（runtime-core 底座小片）
- 执行方式：serial
- 可并行 Task：无（relay 与 contracts 为共享写面）
- 前置依赖：TASK-0204（事件合同登记表——本片新增/变更行为不改合同类型集合，登记表不受影响；`SessionStateSnapshot` 非 SessionEvent）
- 冲突文件/独占路径：`project/tasks` 与 TASK-0197 泳道共享，已登记 conflicts_with
- Branch：main
- Worktree：无（主工作区串行）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：直接入 main；feed/attach 后续片依赖本片

## Given / When / Then

- Given 会话正在运行回合（agent_start 后 assistant 事件携带 turnId）；When 新订阅者中途 subscribe；Then 可读 `currentTurnId`，重放含本轮已发生的 tool.start/phase/end 事件（有界尾部）。
- Given 回合以 agent_end（或 aborted 终止路径）收尾；When 读取；Then `currentTurnId` 已清除，下回合从新 assistant 事件重新学习。
- Given 本轮工具事件超过 4096 上限；When 重放；Then 只保留尾部，缓冲有界性不回退。

## 必须保持

- 重放缓冲有界（4096 尾部）不撤销；工具事件不改变 terminalReason 语义。
- 不为等待 turnId 阻塞事件流：assistant 事件到达前的窗口内 `readCurrentTurnId` 为 undefined，属真实语义（身份随首个 assistant 事件可观察）。
- 既有断言与测试不放松；TASK-0204 墓碑/登记表门禁保持绿。

## 测试与验证

- 红测先行：relay 测试新增"暴露运行中回合身份并重放工具事件"（对照上游同名用例，按本仓事件面构造：agent_start → assistant 带 turnId → tool.start/end → 中途订阅断言重放与身份 → agent_end 后身份清除）。
- 定向：relay 全文件 + operations 相关；`test:impact`。
- 质量：完整 `bun run check`。

## 验收分层

- 工程验证：通过（2026-10-04）。红测先行（`readCurrentTurnId is not a function` 判红 → 转绿）；relay 全文件 8/8；`test:impact`（relay/operations/contracts）命中 runtime-core 20 文件 121 项通过；完整 `bun run check` exit 0；墓碑守卫与声明头 ratchet new=0。
- 技术评审：自审完成——与上游 422983be7 行为逐项对照：turnId 来源不同（上游 conversation.turn.started 事件 vs 本仓 assistant 事件学习）、清除时机等价（回合终态）、工具重放语义一致（display-only、有界、不影响 terminalReason）；本仓 4096 有界缓冲保留，未引入上游无界 recordTurnReplay。
- 集成：integrated（main 主工作区串行，随本片提交）。
- 人工功能验收：工具状态重放为即时可感知改进（desktop 订阅即收重放），待用户实机验收；`currentTurnId` 的消费在 feed/attach 后续片（IPC/desktop 切片）接入后一并验收。
- 发布：v0.1.3「改进」已补条目。

## 验证进展（2026-10-04）

- 红测：新用例 `exposes the running Turn identity and replays its tool executions to late subscribers` 首跑 `readCurrentTurnId is not a function` 判红；实现后转绿（含格式化修订后复跑 8/8）。
- 实现：`SessionStateSnapshot.currentTurnId`（contracts）；relay `currentTurnIds` 学习/清除（agent_start 清空待学习、assistant 事件带 turnId 且回合活跃时学习、agent_end 清除）与工具事件入重放缓冲（有界沿用 4096 尾部丢弃，不设 terminalReason）；operations 快照暴露 `currentTurnId`。

## 交付记录

- 实际修改：`packages/runtime-core/src/contracts.ts`（快照字段）、`runtime-host-session-event-relay.ts`（身份学习 + 工具重放）、`runtime-host-session-operations.ts`（快照暴露）、relay 测试新用例、发布说明 v0.1.3、本记录与焦点表。
- 实际运行：见验收分层工程验证。
- 未运行及原因：desktop 消费端未接线（后续片），实机切回场景验收随整链进行。
- 剩余风险：`currentTurnId` 在回合首个 assistant 事件到达前为 undefined（真实语义：身份随首个事件可观察）；desktop 切片消费时需处理该窗口。feed/attach 后续片：9e18d7f84 attach 接入 → c28c4d4d1 IPC → 1203755a7 desktop 切换 → feed reducer 大切片（renderer 分叉冲突面大，需按本仓窗口化/队列修复适配）。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
