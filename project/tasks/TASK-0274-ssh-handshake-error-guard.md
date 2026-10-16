---
id: TASK-0274
type: task
status: ready
priority: P1
owner: ssh-transport
requirement:
plan:
source: BUG-0117
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0117]
execution: parallel
branch: task/TASK-0274-ssh-handshake-error-guard
worktree: ../open-forge-wt/task-0274-ssh-handshake-error-guard
base_commit: 3c0662f32
read_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts, packages/ssh-transport/src/errors.ts]
write_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts, project/tasks/TASK-0274-ssh-handshake-error-guard.md]
exclusive_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts]
depends_on: []
conflicts_with: [TASK-0197]
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 握手失败后的 Client 销毁不再让 error 逃逸为全局未捕获异常

## 目标

消除握手失败时的 error 监听空窗：销毁未完成握手的 Client 前先挂终止性监听，使迟到的 ssh2 `error` 被局部吸收；同时让测试替身忠实模拟真实 Client，避免同类回归再次被掩盖。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel
- 可并行 Task：TASK-0271 / TASK-0272 / TASK-0273
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；与其它三个 Task 无文件交集；与 TASK-0197 的 `project/tasks` 目录级声明重叠，按合同登记 `conflicts_with`
- Branch：`task/TASK-0274-ssh-handshake-error-guard`
- Worktree：`../open-forge-wt/task-0274-ssh-handshake-error-guard`
- 集成负责人：Coordinator
- 集成顺序：任意（文件不相交）

### 做

- 新增「安静销毁」路径（如 `destroyQuietly(client)`）并在所有失败/清理处使用：先挂一个终止性 `error` 监听（记日志或显式丢弃）再 `destroy()`。覆盖 `tryConnect` 的 `catch`（`packages/ssh-transport/src/ssh2-runner.ts:571-573`）、`connectWithAuth` 失败后的跳机销毁（`:365`）、`installClient` 的失效路径（`:373-374`）与 `:381`。
- 保留既有语义：`cleanup()`（`:555-558`）摘掉 `ready`/`error` 一次性监听的做法可以保留，但销毁前必须补上终止性监听；不要改成「永不摘监听」而改变换方法与上抛行为。
- 测试替身改为忠实：移除 `ssh2-runner.test.ts` 中 `FakeClient.emitError` 在无监听时自动补 no-op 的行为，使「无监听即抛」与真实 Client 一致。
- 新增回归测试：覆盖「握手前失败 → 销毁 → 迟到 error」不产生全局未捕获异常。建议两条互补用例：
  1. 受控替身：`destroy()` 之后触发 socket close 语义并 `emit('error')`，断言不逃逸到全局（用子进程或显式捕获 `uncaughtException` 探针，不能只断言「没有抛到调用方」）。
  2. 真实 `ssh2.Client` + 本机回环 TCP 服务器（accept 后立即关闭）：断言调用方拿到失败，且同期无进程级未捕获异常。
- 若某条用例无法做到确定性（时序或环境不允许），不要提交无法失败的测试；改为在交付记录中写明未覆盖原因与替代证据。

### 不做

- 不公开/复用 `ssh2` 内部错误文案做断言（除既有的 `isAgentError` / `isAuthFailure` 分类路径）。
- 不改认证方法顺序、超时预算（`readyTimeout` / `budgetMs`）与交互式提示语义（BUG-0057 相关行为不得回归）。
- 不改 `installClient` 对已建立连接的常驻监听语义。
- 不新增全局 `process.on('uncaughtException')` 兜底（那会掩盖问题而不是修掉空窗）。

## Given / When / Then

- Given：对一个新主机发起 SSH 连接，且首个认证方法失败（例如 ssh-agent 不可用）。
- When：连接器换下一个认证方法并销毁这次未完成握手的 Client。
- Then：失败被局部处理（按既有语义换方法或上抛），销毁过程产生的迟到 `error` 不逃逸为全局未捕获异常。

## 必须保持

- `agent unavailable, trying next method` 与 `auth attempt failed, trying next method` 的换方法语义与日志文案。
- 用户答指纹/口令/2FA 的交互预算语义（`readyTimeout = budgetMs ?? DEFAULT_ESTABLISH_TIMEOUT_MS`）。
- ProxyJump 链的跳机 Client 清理语义。
- 成功连接的常驻 `error` 日志监听不变。

## 测试与验证

- 定向测试：`bun run test:pkg ssh-transport`，并附 `bun scripts/quality/run-vitest.mjs --run packages/ssh-transport/src/ssh2-runner.test.ts`。
- 用户流程：连接新主机（agent 不可用）→ 换方法成功或给出可操作失败；不出现进程级未捕获异常。
- 质量检查：`bun run test:impact -- packages/ssh-transport/src/ssh2-runner.ts packages/ssh-transport/src/ssh2-runner.test.ts`；完整 `check` 由集成后统一跑。
- 不连真实主机：隔离复现只用回环 TCP 与替身；真实主机现象由用户在功能验收包里自测。

## 验收分层

- 工程验证：待执行
- 技术评审：待执行
- 集成：pending
- 人工功能验收：待验收（真实新主机首次连接）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例；一个尚未记录主机密钥的真实 SSH 主机；ssh-agent 未运行或不可用。
- 操作步骤或 AI 任务输入：新建/连接该主机 → 按提示完成认证。
- 预期行为与最终产物：连接按既有语义换方法或给出可操作失败；`dev/main/*.log` 不再出现 `[diagnostics] uncaughtException Error: Connection lost before handshake`。
- 不通过表现与已知限制：出现未捕获异常、或原有换方法/提示语义被打断。
- 验收反馈及回归案例：待填写。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：创建/初始化/检查/清理结果
- 剩余风险：
