---
id: TASK-0274
type: task
status: verifying
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
base_commit: 96fbe05c1f18a3b662ab659db5162f533562fd9d
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

- 工程验证：已完成（本 Worktree 独立运行，见「实际运行」；自审，无独立评审）
- 技术评审：自审——复核了四处销毁点与 `dropClient` 的区别，结论见「实际修改」；无独立评审机制可用
- 集成：pending（尚未进本地 `main`）
- 人工功能验收：待验收（真实新主机首次连接）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例；一个尚未记录主机密钥的真实 SSH 主机；ssh-agent 未运行或不可用。
- 操作步骤或 AI 任务输入：新建/连接该主机 → 按提示完成认证。
- 预期行为与最终产物：连接按既有语义换方法或给出可操作失败；`dev/main/*.log` 不再出现 `[diagnostics] uncaughtException Error: Connection lost before handshake`。
- 不通过表现与已知限制：出现未捕获异常、或原有换方法/提示语义被打断。
- 验收反馈及回归案例：待填写。
- 说明：除「不再出现未捕获异常」外，被吸收的迟到 error 仍会记一行 `ssh2 <target>: <message>`（与既有常驻监听同口径），不是静默丢弃——日志里看到这行属预期，不是失败。

## 交付记录

- 实际修改：
  - `packages/ssh-transport/src/ssh2-runner.ts`：新增 `Ssh2Session.destroyQuietly(client)`——销毁前先挂终止性 `error` 监听（复用常驻监听的日志形状 `ssh2 <target>: <message>`）再 `destroy()`。四个销毁点改走它：`tryConnect` 的 `catch`（握手失败的 Client，`:588` 附近）、`establish` 的 `catch`（跳机 Client）、`installClient` 的失效路径（目标 Client + 跳机 Client）、`installClient` 的 `close` 监听（跳机 Client）。`dropClient()` 保持原样并补了原因注释——已装进会话的 Client 由 `installClient` 挂的常驻监听兜底，不需要第二个监听。
  - `packages/ssh-transport/src/ssh2-runner.ts` 未改：`ready`/`error` 一次性监听与 `cleanup()`、认证方法顺序与 `authAttemptConfigs`、`readyTimeout` 预算取值、指纹/口令/2FA 提示语义、`installClient` 的常驻监听。
  - `packages/ssh-transport/src/ssh2-runner.test.ts`：`FakeClient` 忠实化——`emitError` 去掉「无监听自动补 no-op」，`destroy()` 按真实 ssh2 同序在「连上了但没握手完成」时异步补发一次 `error`（模拟 socket close 语义，故不会被调用方 promise 收走）；新增 `uncaughtProbe()` 全局未捕获异常探针；新增两条回归用例（`describe("ssh2 传输：握手失败的销毁不留监听空窗")`）：受控替身（agent 不可用 → 换方法 → 销毁 → 迟到 error）、真实 `ssh2.Client` + 回环 TCP（读到客户端 banner 后 `resetAndDestroy()` 制造握手前 RST）。
- 实际运行（均在 `task-0274-ssh-handshake-error-guard` Worktree）：
  - 失败基线（只改测试、未改实现）：`bun scripts/quality/run-vitest.mjs --run packages/ssh-transport/src/ssh2-runner.test.ts` → `Tests 2 failed | 25 passed`，另 3 条 `Uncaught Exception: Connection lost before handshake`；两条新用例分别以 `probe.errors` 非空与 `outcome === "escaped"` 失败。既有的「公钥方法失败后退回口令提示」「ssh-agent 未运行时跳过代理方法」「主机密钥被拒绝」同时因空窗逃逸被判负，说明忠实替身确实打开了这一类缺陷。
  - 修复后同一命令：`27 passed`，无 unhandled error；连跑 8 次均 `27 passed`（回环 RST 用例无抖动）。
  - `bun run test:pkg ssh-transport`：19 file passed | 1 skipped、227 passed | 25 skipped（skipped 为包内既有的平台条件跳过：Go helper 与 Windows 下的 `/bin/sh`、进程类）。
  - `bun run test:impact -- packages/ssh-transport/src/ssh2-runner.ts packages/ssh-transport/src/ssh2-runner.test.ts`：direct 27 passed、related 38 passed。
  - `bun run check`：exit 0（lint / types / guards / mobile-lint 四线全绿，含 `task-worktrees`、`project-indexes`、`package-boundaries` 与声明头 ratchet `new=0`）。
- 未运行及原因：
  - 真实主机连接：任务明令不连真实主机；隔离复现只走回环 TCP 与替身，真实主机现象由用户在功能验收包里自测。
  - `verify:ui:*` 与 Desktop 实机：本任务未获授权，改动落在传输层包内，无 UI 面。
  - 下游消费方包（`apps/desktop` ssh 面、`packages/runtime-ssh`）的定向测试：`test:impact` 判定的受影响面只有本包 direct/related；消费方只把 `logger` 接到应用日志，未断言这些行（已检索 `ssh2-runner` 引用方确认）。
  - `project/tasks/README.md` 当前焦点表与 `BUG-0117` 记录：本任务约束禁止改动，Bug 的「修复/验证」回写留给协调者。
  - 声明头 ratchet 提示「基线中已修复 3 条，可运行 `--write-baseline` 收缩快照」：`check` 已 exit 0，快照是共享文件且非本任务范围，未改。
- Worktree：`../open-forge-wt/task-0274-ssh-handshake-error-guard`；本任务全程在此提交，未触碰主检出；未创建、未删除 Worktree。
- 剩余风险：
  - 修复依赖「socket 的 `close` 晚于握手期 error、且晚于调用方 promise 续体」这一既有顺序：真实 Client 回环用例已固定该顺序，但若将来 ssh2 改成同步补发，需要用例复核。
  - 跳机 Client 与失效路径的迟到 error 记在会话 target 名下，日志不区分跳机身份——与 `installClient` 常驻监听同一口径；要区分跳机身份属独立切片。
  - 未覆盖：ProxyJump 链在真实远端下的销毁时序（无真实主机授权）、`budgetMs` 到期路径（`readyTimeout` 触发的 `sock.destroy()`）的迟到 error——它与本次同源，但触发要等真实预算，不在隔离用例内。
  - 两条新用例的非空洞断言锚在「被吸收的迟到 error 会记一行 `ssh2 <target>: …`」：将来若 ssh2 不再补发该 error，用例会连同锚点一起失败，属预期的提醒而非缺陷。
