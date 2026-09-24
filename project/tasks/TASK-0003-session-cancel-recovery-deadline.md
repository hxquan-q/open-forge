---
id: TASK-0003
type: task
status: done
priority: P0
owner: packages/runtime-core/apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source_bug: BUG-0001
execution: parallel
branch: forge/dev
worktree: unassigned（直接在 forge/dev 主工作区执行）
base_commit: forge/dev
read_paths: [packages/runtime-core, apps/desktop]
write_paths: [packages/runtime-core, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0002]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-22
---

# Session 取消与恢复 Deadline

## 目标

Provider、Tool、MCP、Approval 或 Compaction 不响应取消时，Session 切换、新建和恢复不能永久等待。

## 必须保持

- 旧 Turn 未安全结束前不静默启动新 Turn；
- UI 不得只把 running 改成 false；
- 超时必须进入明确的 failure/cancelled/recovery_required 终态；
- 旧事件和资源释放结果可重建。

## 测试

使用忽略 AbortSignal 的 Fake Provider/Tool，覆盖取消、Session 切换、重复停止、重启恢复和资源释放。

## 实施摘要（2026-09-22）

- `AgentSession` 新增 `cancelDeadlineMs`（默认 `DEFAULT_CANCEL_DEADLINE_MS = 10_000`）与
  `onCancelDeadlineExceeded` 回调；`cancel()`、外部 `AbortSignal`、`close()` 共用同一宽限计时。
- 引入 per-Turn「release barrier」：Turn 结算或宽限到期都会放行
  `cancel`/`close`/`sendRequestWhenAvailable`/`sendQueuedNow` 的等待者；到期后取消路径收敛到
  `recovery_required`，关闭路径收敛到 `closed`，排队输入暂停保留。
- 修复两个既有缺陷：`finishActiveTurn` 曾把强制的 `closed` 回跳成 `idle`；`sendQueuedNow`
  在 Session 收敛到终态后会静默启动新 Turn（现回滚取出的队列条目并抛出状态错误）。
- `SessionInputQueue.takeById` 返回 `{behavior, input}` 并新增 `requeue` 支持回滚。
- 宿主接线：`ComposedRuntimeFactory` 新增 `cancelDeadlineMs` 选项，宽限到期投影为
  `error`（`SESSION_CANCEL_DEADLINE_EXCEEDED`，non-retryable，origin=runtime）+
  `agent_end` 两条 `session.observation` 事件，UI 获得真实终态而非只翻 running 标志。
- 晚结算的「僵尸 Turn」不伪造终态：其终态事件由 `appendTerminalEvent` 的
  existingTerminal 防护保证至多落盘一次，`resumeAgentSession` 可对未闭合 Turn 追加
  `turn.failed(TURN_INTERRUPTED)`。

### 验证

- `test/kernel/agent-session-cancel-deadline.test.ts`：11 用例覆盖忽略 abort 的
  Turn/队列操作、显式取消、waitMs 与 deadline 的分层语义、重复 cancel 幂等、close
  有界收敛、resume 恢复、晚结算幂等、队列回滚、非有限 deadline 兼容旧行为。
- `test/runtime-host/composed-runtime-factory.test.ts`：新增 deadline→观察事件接线用例。
- 定向 14/14 通过；runtime-core 全包 449/449 通过；`check:quick` 与 `tsgo --noEmit` 通过。
- 未运行：全量 `bun run check`（含 desktop tsc/mobile lint，超出影响面）。
