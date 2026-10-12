---
id: BUG-0091
type: bug
status: verifying
priority: P1
owner: packages/runtime-core
requirement:
plan:
source: 用户提供的他人实机日志巡检（main 2026-09-28）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# Turn 终态持久化失败一次后 session 永久滞留 `recovery_required`，用户无任何可见恢复手段

## 用户流程

- Given：某会话的一次 turn 在写终态时持久化失败（锁竞争/IO 错误等任一原因）。
- When：用户继续在该会话发送消息（prompt）、按队列立即发送（queue-send-now）或恢复队列（resumeQueue）。
- Then：应获得可操作的恢复路径或明确指引；实际所有后续操作立即抛 `KernelError: Turn terminal state could not be persisted; session recovery is required`，会话事实死亡。

## 实际行为

0.1.1 打包版日志中同一会话在 15:38、15:40、16:04 连续三次（不同入口）抛同一 `KernelError`：prompt、queue-send-now、resumeQueue 全部秒败。日志只见包装后的 message，不含首个持久化失败的 cause；用户侧表现为「发了没反应」且无任何恢复入口，只能弃会话。

## 期望行为

终态持久化失败应有界：首个失败连同 cause 落盘；session 进入降级态时给出明确的恢复动作（重试持久化/安全重建会话上下文/提示用户开新会话），而不是把每个 API 入口都变成同一个死锁报错。

## 环境与失败证据

- Open Forge 0.1.1 打包版（`%LocalAppData%\Programs\vetta`），Windows。
- `temp/log/main/2026-09-28.log`：`conversation-kernel … Turn terminal state could not be persisted; session recovery is required` 在 prompt/queue-send-now/resumeQueue 三个入口重复出现，同 sessionId。
- 同一日志另见 `ConversationOwnershipConflictError`（delete-session 报「owned by another runtime」）与会话文件锁超时——该机两个安装共用 `~/.openforge`，跨实例锁竞争是首个持久化失败的合理诱因假设（未证实）。

## 最小复现

1. 打开会话，使一次 turn 的终态持久化失败（如对 conversation 文件持锁再结束回合）。
2. 对该 session 再发任意消息 → 立即 `KernelError: Turn terminal state could not be persisted`。
3. 观察：日志无首因；UI 无恢复动作。

## 影响

一次瞬时持久化失败把会话永久打成不可用（状态机无出路），数据与用户预期双重损失；且因首因不落日志，线上无法区分是锁竞争、磁盘还是损坏导致。

## 根因证据

- [`packages/runtime-core/src/kernel/agent-session.ts`](../../packages/runtime-core/src/kernel/agent-session.ts)：持久化失败后 session 进入 `recovery_required`，此后 `prompt`/`enqueue`/`resumeQueue` 等所有 guard 均直接 `throw turnPersistenceError()`——无 cause、无恢复分支。
- [`turn-pipeline.ts`](../../packages/runtime-core/src/kernel/turn-pipeline.ts) 718/746 行首次失败抛出的是带 cause 的 `turnPersistenceError(cause)`，但 guard 分支复用同一错误类型却不携带 cause，上游日志只能看到包装 message。
- [`errors.ts`](../../packages/runtime-core/src/kernel/errors.ts) `turnPersistenceError` 本身支持 cause 透传——缺口在 guard 调用方与日志记录层。
- 置信度：卡死机制高（状态机无出口确定）；首个失败诱因中（跨实例锁竞争为假设）。

## 回归测试

`packages/runtime-core/test/kernel/turn-pipeline.test.ts`（2 例新增）：(a) `failTerminalAppend` 卡死后存储恢复，下一次 `send` 自动经 `resumeSession` 为悬挂回合补 `turn.failed`(TURN_INTERRUPTED)、session 回 `idle` 并完成新回合，中断终态幂等唯一；(b) 同步 guard 以首个持久化原因（cause 进消息）拒绝而非裸模板错误。旧实现下 (a) 同错拒绝、(b) 消息无 cause 红基线。既有「持续失败仍拒」「取消宽限悬挂仍拒」断言保持通过。

## 修复与验证

- 修复：见 [TASK-0227](../tasks/TASK-0227-session-recovery-admission.md)。kernel 存首个 `TURN_PERSISTENCE` 原因；异步 admission（send/sendRequest/sendRequestWhenAvailable/queueRequestIfRunning/continue/retry/sendQueuedNow/resumeQueue）在 `recovery_required` 先走 `recoverIfRequired()`（`activeTurn` 悬挂时拒绝原地恢复，仍由宿主重建）；同步入口透传首因拒绝。
- 测试：kernel + runtime-host 334 例、runtime-core 全量 339 例过；新增回归用例含并发 drain 去重与悬挂拒绝语义。
- 检查：`check:types`/`check:lint` 全绿；`check:quick` 被 `.ua/` 既有 guard 残留阻断（非本改动）。
- 验证边界：首个失败的真实诱因（跨实例文件锁竞争假设）与 UI 侧无感恢复属人工验收。
