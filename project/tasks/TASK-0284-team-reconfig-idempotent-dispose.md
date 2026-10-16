---
id: TASK-0284
type: task
status: ready
priority: P1
owner: apps/desktop agent-teams
requirement:
plan:
source: BUG-0115（2026-10-16.log 三轮 reconfiguration failed + SESSION_NOT_FOUND 实证）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0115, BUG-0108, BUG-0114]
execution: serial
branch: main
worktree: 未拆出（main 串行实施）
base_commit: 1ebf8ea6e
read_paths: [apps/desktop/src/main/agent-teams/team-member-runtime-reconfiguration.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.ts, packages/runtime-core/src/runtime-host/runtime-host-session-directory.ts, apps/desktop/src/main/agent-teams/team-member-attempt-runner.ts]
write_paths: [apps/desktop/src/main/agent-teams/team-member-runtime-reconfiguration.ts, apps/desktop/src/main/agent-teams/team-member-runtime-reconfiguration.test.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0115-team-task-finalize-reconfig-session-not-found.md, project/bugs/README.md, project/tasks/TASK-0284-team-reconfig-idempotent-dispose.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 收尾重配对 runtime 未加载的成员会话幂等化

## 目标

修复 BUG-0115：团队长任务收尾阶段对「runtime session 未加载」的成员执行重配时，`disposeSession` 抛 `SESSION_NOT_FOUND` 掀翻收尾；改为幂等 no-op（或先确保加载再重配），收尾静默完成，结算失败与重配竞态相互隔离。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（与 TASK-0285/0286 同目录不同文件面，main 串行）
- 前置依赖：无
- 冲突文件/独占路径：`team-member-runtime-reconfiguration.ts` 独占
- Branch：main
- Worktree：未拆出
- 集成负责人：Coordinator（本会话托管）
- 集成顺序：main 串行

### 做

- `team-member-runtime-reconfiguration.ts` 的 dispose 分支：目标 runtime session 未在目录注册（`SESSION_NOT_FOUND`，retryable: false）时按「无可清理」处理——记录含错误码的结构化 debug/info 日志后继续重配，不再抛出。
- 保留 `Team member runtime not found`（成员不在 coordination 文档）与 `SESSION_NOT_FOUND` 的错误区分，日志可辨。
- 结算失败与重配失败互不连带：任一失败仅标记自身结果，不掀翻收尾事务（对照现有 turn/attempt 错误传播面收敛）。

### 不做

- 不改 `runtime-host-session-directory.ts` 的通用抛点语义（BUG-0108/0114 的删除路径已由 TASK-0260 处理）。
- 不实现 BUG-0116 的 send 自愈（另 Task）。

## Given / When / Then

- Given：团队长任务收尾窗口，成员 runtime session 未加载（如进程重启后 attempt 收尾）。
- When：`ensureMemberConfiguration` → `reconfigureTeamMemberRuntime` → `disposeSession(current.sessionId)`。
- Then：旧实现抛 `SESSION_NOT_FOUND` 使收尾失败、会话损坏（BUG-0116 连锁）；新实现记录结构化日志后继续，收尾完成，会话保持可用。

## 必须保持

- 真实需要 dispose 的活跃 session 仍被正常释放（不漏清理）。
- 非 `SESSION_NOT_FOUND` 的 dispose 失败仍按错误处理（不吞真故障）。
- TASK-0260 已落的删除路径降级语义不变。

## 测试与验证

- 定向测试：`team-member-runtime-reconfiguration.test.ts` 新增「dispose 目标未注册 → 幂等继续 + 结构化日志」回归（旧实现红：抛 SESSION_NOT_FOUND）；既有 team 套件零回归。
- 质量检查：desktop 包内测试 + `test:impact` + 完整 `bun run check`。

## 验收分层

- 工程验证：待执行（定向测试 + check）。
- 技术评审：自审。
- 集成：main 串行，push origin main:dev。
- 人工功能验收：不适用（需真实收尾竞态，以确定性测试替代；实机观察归 BUG-0115 验收包）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：团队会话长任务跑完进入收尾。
- 预期行为与最终产物：收尾静默完成，无 reconfiguration failed / SESSION_NOT_FOUND，会话可继续使用。
- 不通过表现与已知限制：收尾失败、会话损坏、send 必败。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：（实施后回填）
- 实际运行：（实施后回填）
- 未运行及原因：（实施后回填）
- Worktree：未拆出（串行小改，main 直接实施）
- 剩余风险：（实施后回填）
