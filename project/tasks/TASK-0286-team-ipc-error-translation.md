---
id: TASK-0286
type: task
status: verifying
priority: P2
owner: apps/desktop agent-teams + renderer
requirement:
plan:
source: BUG-0117（2026-10-16.log 与 2026-10-14(2).log 多处 error: '[object Object]' 实证）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0117, BUG-0092]
execution: serial
branch: main
worktree: 未拆出（main 串行实施）
base_commit: 1ebf8ea6e
read_paths: [apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/main/logger/describe-error.ts, apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts, apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts, apps/desktop/src/main/agent-teams/team-session-service.ts]
write_paths: [apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts, apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts, apps/desktop/src/main/ipc/agent-teams.test.ts, apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0117-team-ipc-session-error-object-object.md, project/bugs/README.md, project/tasks/TASK-0286-team-ipc-error-translation.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# team 链 IPC 错误接入 describeError 翻译层，消灭 [object Object]

## 目标

修复 BUG-0117：team 链错误从主进程到渲染端日志/呈现全程结构化——主进程记录 error 字段不再 `'[object Object]'`，渲染端消费 IPC rejection 走与单聊链同款的 `describeError` 翻译，code/message 可读、可诊断。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（与 TASK-0285 同域串行，避免 ipc/agent-teams.ts 冲突）
- 前置依赖：无
- 冲突文件/独占路径：`ipc/agent-teams.ts`、team 渲染端连接器
- Branch：main
- Worktree：未拆出
- 集成负责人：Coordinator（本会话托管）
- 集成顺序：main 串行（安排在 TASK-0284/0285 之后，减少同文件交叠）

### 做

- 盘点 team 链全部 `error` 字段落盘点：主进程 `team message failed`/`team send-message failed`/`team member runtime reconfiguration failed`/`could not be loaded during delete` 等 logger 调用改用 `describeError`（`apps/desktop/src/main/logger/describe-error.ts`）输出结构化 code/message/errorName。
- 渲染端 team 连接器（`useTeamChatModel.ts` / `teamChatModel.ts`）消费 IPC rejection 处接入翻译层（复用 BUG-0092/TASK-0236 模式），不再把裸对象进 console/日志。
- 保持错误对象本身的 code/message 不变（翻译只在呈现/记录层）。

### 不做

- 不改单聊链已落地的翻译（`session-interrupt-monitor.ts`）。
- 不改错误码枚举与 IPC 合同形状（preload API 签名不变）。

## Given / When / Then

- Given：team 链任意入口（send / reconfig / delete / get-session）抛普通对象 `SessionError`。
- When：主进程记录该失败、渲染端经 IPC 收到 rejection。
- Then：旧实现日志 error 字段与渲染端 console 均为 `[object Object]`；新实现输出含 code/message/errorName 的结构化文本，全链无 `[object Object]`。

## 必须保持

- 错误对象跨 IPC 的合同不变（仍是可结构化克隆对象；翻译仅呈现层）。
- 单聊链与 BUG-0092 既有行为零回归。
- 用户可见文案语义不变（仅从不可读变可读，不新增弹窗）。

## 测试与验证

- 定向测试：主进程 logger 调用断言 error 字段含 code/message（旧实现红：'[object Object]'）；渲染端翻译函数对普通对象 SessionError 返回结构化描述；`describe-error.test.ts` 既有用例零回归。
- 质量检查：desktop 包内测试 + `test:impact` + 完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行，push origin main:dev。
- 人工功能验收：不适用（mock 可复现；实机触发一次 team 错误观察日志归 BUG-0117 验收包）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：触发任意 team 链错误（如向损坏会话 send）。
- 预期行为与最终产物：日志与渲染端诊断信息含 code/message，可定位根因。
- 不通过表现与已知限制：日志仍见 `[object Object]`。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：七个 agent-teams 模块各自的 `errorMessage`（`String(plainObj)` 反模式）统一替换为 `logger/describe-error.ts` 的 `describeError`（Error 走 name+cause 链，普通对象走 inspect），删除六份重复本地助手；`team-member-attempt-runner.ts:387` 的用户可见 discard 载荷保留原 message 语义不动（`6bac5db4a`）。
- 实际运行：`team-turn-coordinator.test.ts` 新增「裸对象拒绝 → 日志字段含 code/message、不含 [object Object]」回归，4/4 绿；agent-teams 34 文件 250 例全绿；desktop typecheck 通过。
- 未运行及原因：渲染端消费路径核实为 `console.info(..., attempt)`（对象打印，不产 [object Object]），无需新增渲染端翻译；实机触发一次 team 错误观察日志归 BUG-0117 验收包。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：Error 输出从 `message` 变为 `Name: message`（含 cause 链），日志字段格式略变——属诊断信息增强，无消费方解析该自由文本。
