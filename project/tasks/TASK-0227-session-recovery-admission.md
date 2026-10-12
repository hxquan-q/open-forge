---
id: TASK-0227
type: task
status: verifying
priority: P1
owner: packages/runtime-core
requirement:
plan:
source: BUG-0091（turn 终态持久化失败一次后 session 永久滞留 recovery_required，prompt/queue/retry 全拒且无恢复出口）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0022]
related_bugs: [BUG-0091]
execution: serial
branch:
worktree:
base_commit: 254796d87
read_paths: [packages/runtime-core/src/kernel/agent-session.ts, packages/runtime-core/src/kernel/turn-pipeline.ts, packages/runtime-core/src/kernel/errors.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, packages/runtime-core/test/kernel/agent-session-cancel-deadline.test.ts]
write_paths: [packages/runtime-core/src/kernel/agent-session.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0091-session-stuck-recovery-required.md, project/tasks/TASK-0227-session-recovery-admission.md, project/tasks/README.md]
exclusive_paths: [packages/runtime-core/src/kernel/agent-session.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# recovery_required 的入坞恢复：存首因 + 下一次 admission 经 resumeSession 原地收敛

## 目标

一次终态持久化失败后 session 不再永久卡死。Kernel 内两点改动：

1. **存首因**：`persistenceError` 记下首次 `TURN_PERSISTENCE` 的原始错误（含 cause），后续同步拒绝路径透传它而不是裸 `turnPersistenceError()`——日志里不再只见「recovery is required」而不见病因。
2. **入坞恢复**：异步 admission 入口（`send`/`sendRequest`/`sendRequestWhenAvailable`/`queueRequestIfRunning`/`continue`/`retry`/`requestContinuation`/`sendQueuedNow`/`resumeQueue`）在 `recovery_required` 时先走 `recoverIfRequired()`——复用 `pipeline.resumeSession`（与宿主同一原语：重跑恢复策略、为悬挂回合补 `turn.failed` 中断终态、幂等），成功后回 `idle` 继续正常 admission；恢复失败保持 `recovery_required` 并把恢复失败作为新首因抛出。并发调用共享同一恢复 drain。
   - **拒绝原地恢复的情形**：`activeTurn` 仍悬挂（取消宽限收敛路径，僵尸回合随时可能回写终态）——两个管线并发写同一会话日志会破坏事件序，此情形维持拒绝，仍由宿主重建 Session。
   - **同步入口不恢复**：`queueContext`/`queueOperation`/`queueNextTurnContext`/`steer`/`followUp` 等同步 guard 无法 await，维持拒绝但抛存下来的首因。

## 范围

### 并发评估

- 结论：支持（kernel 单文件，main 工作区串行）。
- 执行方式：serial
- 冲突文件/独占路径：`agent-session.ts` 独占；runtime-core 公开合同面不变（不新增导出 API，行为语义变化）。
- 集成顺序：定向测试 + 包内全量 + impact + check:quick 通过后随批集成

### 做

- `agent-session.ts`：`persistenceError` 字段 + `persistenceRequiredError()`（首因透传）；`recoverIfRequired()`（activeTurn 检查 + `pipeline.resumeSession` + drain 去重 + 成功后 `scheduleRequestedContinuations`）；两处进入 `recovery_required` 的 catch 记首因；异步 admission 各入口 guard 前接恢复调用；`sendQueuedNow`/`resumeQueue` 同样接入。
- `turn-pipeline.test.ts` 新增回归：failTerminalAppend 卡死后翻回正常 → 下一次 `send` 自动恢复成功、会话补写 `turn.failed` 中断终态、state 回 idle；旧断言（持续失败仍拒、取消宽限悬挂仍拒）保持通过。
- 发布说明：`v0.1.3.md`「修复」一条（持久化抖动的会话自愈，不再假死）。

### 不做

- 不改 `TurnPersistenceError`/`KERNEL_ERROR_CODES` 形状；不新增导出恢复 API（宿主侧显式 recover 另行评估）。
- 不引入 IPC/UI 恢复按钮：恢复由 admission 自动完成，用户无感。
- 不改取消宽限语义、`sendRequestWhenAvailable` 等待者唤醒逻辑、queue pause/resume 规则。
- `recordContext`/`recordTaskFacts` 等非 turn 写入在 recovery_required 下仍拒绝（透传首因），由下一次 turn admission 恢复后才放行。

## Given / When / Then

- Given 终态 append 一次性失败后 `state==="recovery_required"`；When 下一次 `send`（存储已恢复）；Then `resumeSession` 为悬挂回合补 `turn.failed`(TURN_INTERRUPTED)，session 回 `idle`，send 正常开 turn。
- Given 同样的卡死；When 同步 guard（如 `queueContext`）被调；Then 以首次持久化错误的 `TurnPersistenceError`（带原 cause）拒绝，病因进日志。
- Given 取消宽限路径卡死且 `activeTurn` 未结算；When `send`；Then 拒绝（不原地恢复），与既有 cancel-deadline 测试一致。
- Given 持续无法 append；When `send`；Then 恢复尝试失败，仍抛 `TURN_PERSISTENCE` 且 cause 为最近一次恢复失败。

## 必须保持

- `TurnPipeline.resumeSession` 语义：只负责持久层收敛；内存态切换由 AgentSession 负责，不双写事件。
- 恢复 drain 并发去重：并发 admission 共享一次恢复，不重复 append。
- 恢复成功必须补 `scheduleRequestedContinuations()`（与正常终态 settle 后一致）。
- 事件顺序不变：恢复写的中断终态经既有 `publish` 通道。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-core/test/kernel/turn-pipeline.test.ts packages/runtime-core/test/kernel/agent-session-cancel-deadline.test.ts`。
- 用户流程：持久化抖动后的会话下一次发消息自动恢复并可继续对话（旧行为：所有操作同错假死）。
- 质量检查：`bun run test:pkg runtime-core`（或该包对应 runner）+ `bun run test:impact -- packages/runtime-core/src/kernel/agent-session.ts` + `bun run check:quick`。

## 验收分层

- 工程验证：通过（2 例新回归 + kernel/runtime-host 334 例 + runtime-core 全量 339 例 + types/lint 全绿）。
- 技术评审：自审（kernel 状态机边界：仅持久层卡死可原地恢复，悬挂 turn 仍拒；`requestContinuation` 保持同步 latch 语义不做原地恢复——cancel 必须先拒绝已登记 waiter，恢复后由 `scheduleRequestedContinuations` 自然排空）。
- 集成：待集成。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：会话因一次性持久化失败进入 recovery_required（可用故障注入/测试夹具）。
- 操作步骤：再发一条消息。
- 预期行为：自动恢复，悬挂回合以中断终态归档，新消息正常处理；日志含首次失败 cause。
- 不通过表现：所有操作持续同一条 `recovery is required`（旧行为）。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：`agent-session.ts` 新增 `persistenceError`/`recoveryDrain` 字段、`recoverIfRequired()`（activeTurn 悬挂时直接返回不恢复；否则 `pipeline.resumeSession` 收敛后回 `idle` 并 `scheduleRequestedContinuations`，恢复失败记为新首因）与 `persistenceRequiredError()`（首因透传）；`startTurn`/`startRequest` 两处 TURN_PERSISTENCE catch 记首因；`send`/`sendRequest`/`sendRequestWhenAvailable`/`queueRequestIfRunning`/`continue`/`retry`/`sendQueuedNow`/`resumeQueue` guard 前接 `await this.recoverIfRequired()`；同步入口（queueContext/queueOperation/queueNextTurnContext/queueInput/recordContext/recordTaskFacts/requestContinuation）改抛 `persistenceRequiredError()`。`turn-pipeline.test.ts` +2 例（原地恢复含幂等终态断言、首因透传）。
- 实际运行：
  - 定向：`run-vitest turn-pipeline.test.ts agent-session-cancel-deadline.test.ts conversation-recovery.test.ts` → 45 例过。
  - 包内：`run-vitest test/kernel/ test/runtime-host/` → 334 例过（首轮 1 例回归——`requestContinuation` 改 async 破坏「cancel 拒绝已登记 waiter」同步语义，还原为同步 guard 后复验全绿）。
  - impact：`bun run test:impact -- packages/runtime-core/src/kernel/agent-session.ts` → runtime-core 46 文件 339 例过。
  - `bun run check:types` 全绿；`bun run check:lint` 全绿（biome format 已修复）。
- 未运行及原因：`bun run check:quick`/`bun run check` 被 `.ua/` 既有 guard 失败阻断（非本改动）；UI 实机验证未授权未跑。
- Worktree：未拆出（serial，main 工作区串行集成）
- 剩余风险：取消宽限+僵尸 turn 已结算的场景也可经同一路径恢复（终态已落盘则 resumeSession 判 ready，幂等无副作用）；`requestContinuation` 在 wedged 状态仍以首因拒绝——后台续跑唤醒需等下一次异步 admission 恢复（按合同设计）。
