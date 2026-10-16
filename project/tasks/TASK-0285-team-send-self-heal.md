---
id: TASK-0285
type: task
status: ready
priority: P1
owner: apps/desktop agent-teams
requirement:
plan:
source: BUG-0116（2026-10-16.log 三个 requestId 相隔 20 分钟连续必败实证）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0116, BUG-0115, BUG-0091]
execution: serial
branch: main
worktree: 未拆出（main 串行实施）
base_commit: 1ebf8ea6e
read_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts, apps/desktop/src/main/agent-teams/team-member-runtime-manager.ts, apps/desktop/src/main/ipc/agent-teams.ts, packages/runtime-core/src/runtime-host/runtime-host-session-directory.ts, apps/desktop/src/main/agent-teams/team-turn-coordinator.ts]
write_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts, apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/main/agent-teams/team-session-service.test.ts, apps/desktop/src/main/ipc/agent-teams.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0116-team-session-no-self-heal-send-always-fails.md, project/bugs/README.md, project/tasks/TASK-0285-team-send-self-heal.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话 send 路径对 runtime 损坏态自愈或给出可读恢复指引

## 目标

修复 BUG-0116：团队会话 runtime session 损坏（目录无注册）后，send 不再恒败 `SESSION_NOT_FOUND`——优先自动重载/重建成员 runtime session 再投递；无法自愈时归一为可读错误并附明确恢复指引（重启/重开会话），渲染端可见。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（与 TASK-0284 同域串行；0284 落地后损坏态产生源收窄，但本 Task 独立成立——任意原因损坏仍需兜底）
- 前置依赖：无硬依赖（建议在 TASK-0284 后实施以减小实机触发面）
- 冲突文件/独占路径：`team-session-service.ts` send 链独占
- Branch：main
- Worktree：未拆出
- 集成负责人：Coordinator（本会话托管）
- 集成顺序：main 串行

### 做

- send 链（`team-session-service.ts` 解析 runtime session key 处）捕获 `SESSION_NOT_FOUND`：先尝试按 coordination 文档重建/重载目标成员 runtime session，重试一次投递。
- 重建失败（文档不可读等）时归一错误：保留 code，message 含「会话数据损坏，重启应用或删除重开该会话可恢复」指引；渲染端经既有错误呈现路径显示（与 TASK-0286 的翻译层协同）。
- 结构化日志记录自愈尝试与结果（attempted/recovered/failed + 原因码）。

### 不做

- 不改 `recovery_required`（BUG-0091）的单聊语义。
- 不做跨进程目录写入迁移；不自删会话数据。

## Given / When / Then

- Given：团队会话 coordination 文档可读但成员 runtime session 不在宿主目录（损坏态，如 BUG-0115 竞态或进程重启后）。
- When：用户在该会话 send。
- Then：旧实现每次必败 `SESSION_NOT_FOUND` 仅重启可恢复；新实现自动重载成员 runtime 后投递成功；文档不可读时返回含恢复指引的可读错误，不再裸抛。

## 必须保持

- 正常会话 send 路径零额外开销（仅异常分支生效）。
- coordination 文档为恢复事实源：不自造会话状态，重载走既有加载/恢复路径。
- 取消与错误语义（turn 终态、usage）不变。

## 测试与验证

- 定向测试：`team-session-service.test.ts` 注入 `resolveSessionKey` 抛 `SESSION_NOT_FOUND`——断言触发重载且投递成功（旧实现红：恒败）；文档不可读时断言错误 message 含恢复指引且不含裸 `[object Object]`。
- 质量检查：desktop 包内测试 + `test:impact` + 完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行，push origin main:dev。
- 人工功能验收：待验收（损坏会话实机 send 一条）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：runtime 损坏的团队会话（可由重启应用后直接 send 构造）。
- 操作步骤或 AI 任务输入：向该会话发送一条消息。
- 预期行为与最终产物：消息正常投递（自愈成功）或得到含恢复指引的可读错误。
- 不通过表现与已知限制：恒败 `SESSION_NOT_FOUND`、无任何指引。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：（实施后回填）
- 实际运行：（实施后回填）
- 未运行及原因：（实施后回填）
- Worktree：未拆出（串行小改，main 直接实施）
- 剩余风险：（实施后回填）
