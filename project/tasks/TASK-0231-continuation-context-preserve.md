---
id: TASK-0231
type: task
status: verifying
priority: P2
owner: packages/runtime-core
requirement:
plan:
source: BUG-0096（异步上下文投递瞬态拒绝时记录永久丢失，子代理通知/报告静默消失）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0096]
execution: serial
branch:
worktree:
base_commit: 96f3ae527
read_paths: [packages/runtime-core/src/kernel/agent-session.ts, packages/runtime-core/test/kernel/agent-session-async-continuation.test.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, packages/runtime-core/src/runtime-host/composed-runtime-factory.ts, project/bugs/BUG-0096-continuation-context-dropped.md]
write_paths: [packages/runtime-core/src/kernel/agent-session.ts, packages/runtime-core/test/kernel/agent-session-async-continuation.test.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0096-continuation-context-dropped.md, project/tasks/TASK-0231-continuation-context-preserve.md, project/tasks/README.md]
exclusive_paths: [packages/runtime-core/src/kernel/agent-session.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 异步上下文投递瞬态拒绝时记录降级为 next-turn 投递

## 目标

把「不自动唤起 Turn」与「数据可丢」解耦：`requestContinuation` 的瞬态拒绝路径保留投递记录。

1. **cancel 清 pending**：`cancel()` 经 `rejectContinuationWaiters` 拒绝 waiter 前，把 `continuationContext` 中已登记记录转入 `nextTurnContext`——不唤起隐形 Turn（保留 474-476 注释的设计意图），随下一次 send 作为 trailingContext 送达。`close()` 路径不保留（死会话）。
2. **cancelling 入坞**：登记前先拒的路径改为——记录入 `nextTurnContext`，waiter 仍拒 `turn_interrupted`（对外拒绝语义不变，仅补数据保留）。
3. **recovery_required 入坞**：同上——记录入 `nextTurnContext`，拒绝不变；下一次入坞恢复（BUG-0091）的 Turn 即携带送达。
4. **closed 保持死信**：不缓冲。

## 约束

- `nextTurnContext` 在 `close()` 清空属既有语义，不动；取消/恢复路径天然保活。
- 不新增端口/持久化 journal——本次只做「记录不丢」的降级投递；跨进程重启持久化属后续演进。
- 排空期（记录已 `splice` 进 Turn）失败的 waiters 不动——记录已部分消费，重投会重复。
- runtime-core AGENTS：Session 状态/Queue 变化需覆盖合法转换、拒绝转换与重复调用语义。

## 验收（Given/When/Then）

- Given：running 会话已登记 continuation 记录 → When：`cancel()` → Then：waiter 拒 `turn_interrupted`；下一次 `send` 的 `trailingContext` 含该记录，且无 `continue` 隐形 Turn。
- Given：`cancelling` 期间新 `requestContinuation([record])` → Then：拒绝 `turn_interrupted`；下一次 send 的 `trailingContext` 含该记录。
- Given：`recovery_required` 期间投递 → Then：拒绝持久化首因；下一次入坞恢复后的 send `trailingContext` 含该记录。
- Given：`closed` 会话投递 → Then：仍拒 `session_closed`，不缓冲。
- Given：旧实现 → Then：上述 `trailingContext` 断言全为空（红基线）。

## 交付记录

- 红基线：cancel 用例旧断言 `trailingContext` 为空（记录随 waiter 拒绝一并清空）；改语义后测试更新为断言保留送达。
- 实际修改：`agent-session.ts`——`requestContinuation` 的 `cancelling`/`recovery_required` 两条拒绝分支在拒绝前 `this.nextTurnContext.push(...context)`；`rejectContinuationWaiters` 增 `preserveContext` 选项（`cancel()` 传 `true` 把已登记记录转存，`close()`/closed 调度路径不传——死会话不缓冲）。对外拒绝语义、waiter 错误码、无隐形 Turn 全部不变。
- 测试：`agent-session-async-continuation.test.ts` cancel 用例更新（两条被拒记录经下一次 send 的 `trailingContext` 按序送达、`continue` 零调用）；`turn-pipeline.test.ts` 新增「recovery_required 期间投递 → 恢复后 turn-2 `context.appended` 含该记录」用例。
- 全量：kernel + runtime-host 335/335 过；impact（agent-session.ts）46 文件 340 例过。
- 检查：root `tsgo --noEmit` + runtime-core `tsconfig.build.json` 绿；`check:lint` 绿。
- 未运行：`bun run check` 全量（`.ua/` 既有 guard 残留会红，与本次无关）。
- 遗留演进项：跨进程重启级投递持久化（journal 化）未覆盖，本次保证的是「内存存续期不丢 + 送达即落 `context.appended` 事件」。
