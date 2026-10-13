---
id: BUG-0096
type: bug
status: verifying
priority: P2
owner: packages/runtime-core
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（coding subagent issue notification-delivery/report-delivery 反复失败）
related_requirement: []
related_plan: []
related_tasks: [TASK-0231]
related_issues: []
related_bugs: [BUG-0091]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 异步上下文投递被瞬态拒绝时记录永久丢失，子代理完成通知/报告静默消失

## 用户流程

- Given：后台任务/子代理完成，向父会话 `deliverAsyncContext` 注入完成通知或报告上下文（唤醒注入）。
- When：父会话恰好在 `cancelling`（用户按停止）、`recovery_required`（终态持久化失败待恢复）或关闭中时。
- Then：期望记录随下一次 Turn 送达或恢复后投递；实际 `requestContinuation` 的瞬态拒绝路径直接丢弃记录——子代理跑了数分钟得出的结果，父代理永远不知道，无任何重试/落账。

## 实际行为

`agent-session.ts` `requestContinuation`：

- `cancelling` → 拒绝 `turn_interrupted`，记录未注册即丢；
- `recovery_required` → 拒绝持久化首因，记录未注册即丢；
- `cancel()` 调 `rejectContinuationWaiters` → `continuationContext.length = 0`，已登记记录连同 waiter 一起清（该拒绝本身是设计行为：注释明示「取消后的续跑属该 Turn 背景结果，放任会在停止后产生隐形 Turn」）——但拒绝语义顺带把**数据**也丢了；
- `closed` → `session_closed`（真不可达，丢弃合理）。

投递调用方（`composed-runtime-factory.deliverAsyncContext` → `runtime-subagents`）对拒绝只记 warn/observation——无 journal、无重试。对照组：team 侧有 `team-notification-journal` + `awaits recovery` 持久化重投，普通子代理路径没有任何等价物。日志实证 17 次 `coding subagent issue { operation:'notification-delivery'/'report-delivery', errorCode:'turn_interrupted' }` + `Session is closing or closed`。

## 期望行为

区分「不自动唤起 Turn」与「数据可丢」：

- `cancel()`/`cancelling` 拒绝：记录转入 `nextTurnContext`——不唤起隐形 Turn（保留设计意图），随下一次发送作为 trailingContext 送达；
- `recovery_required` 拒绝：记录转入 `nextTurnContext`——下一次入坞恢复（BUG-0091 自愈）的 Turn 即携带送达；
- `closed`：真死信，维持拒绝（死会话无从投递）；
- 排空期被拒（记录已消费进 Turn）：不动，避免重复投递。

## 环境与失败证据

- `temp/log/openforge-main-*.log`：`[coding-agent-subagents] coding subagent issue` ×17，`operation:'notification-delivery'`/`'report-delivery'`，`errorCode:'turn_interrupted'`；`failed to deliver background task notification: Session is closing or closed`。
- 该日志窗口恰是检查点超时/取消高发期——子代理在用户停止会话瞬间完成，通知撞 `cancelling` 即丢。

## 最小复现

```ts
// 会话 running → requestContinuation([record]) 登记 → cancel() → 记录被清
// 或 running → cancel() → cancelling 期间 requestContinuation([record]) → 拒绝且记录丢
// 下一次 send 的 trailingContext 不含该记录（旧实现）；新实现应包含
```

## 影响

后台任务/子代理的完成结果在父会话忙碌或被停止的窗口内静默蒸发；用户视角是「子代理跑完没下文」，且无任何日志能指到丢失的记录本身（只有投递失败的 warn）。

## 根因证据

- [`agent-session.ts`](../../packages/runtime-core/src/kernel/agent-session.ts) 282-287 行：cancelling/recovery_required 两条拒绝路径在登记前返回；474-477 行 `cancel()` 的 `rejectContinuationWaiters` 与 765-769 行实现：`continuationRequested=false` + `continuationContext.length=0` 数据级联清。
- `nextTurnContext` 仅在 `close()` 清空（496/510 行），取消/恢复路径天然保活——降级缓存语义成立。
- `composed-runtime-factory.ts` 145-172、276-281：`pendingContinuationContext` 只覆盖「session 接线前」窗口，接线后拒绝无任何兜底。
- 置信度：高（代码级确定；`closed` 丢弃属合理死信不在修复面）。

## 回归测试

`test/kernel/agent-session-async-continuation.test.ts`：cancel 清 pending 后记录进入下一次 send 的 `trailingContext`；cancelling 期间新投递同样落 `trailingContext` 且不唤起隐形 Turn。旧实现下 `trailingContext` 为空（红基线）。`test/kernel/turn-pipeline.test.ts`：`recovery_required` 期间投递的记录随恢复后首次发送送达。

## 修复与验证

- 修复：见 [TASK-0231](../tasks/TASK-0231-continuation-context-preserve.md)。`requestContinuation` 在 `cancelling`/`recovery_required` 拒绝前把 `context` 转入 `nextTurnContext`；`cancel()` 的 `rejectContinuationWaiters` 新增 `preserveContext` 选项把已登记记录转存（`close()` 不传——死会话不缓冲）。对外拒绝语义全部不变，无隐形 Turn 唤起。
- 测试：`agent-session-async-continuation.test.ts` 更新 cancel 用例——拒绝不变、`continue` 不唤起、下一次 send 的 `trailingContext` 携带两条被保留记录；`turn-pipeline.test.ts` 新增 recovery 用例——`recovery_required` 投递拒绝 `TURN_PERSISTENCE`，恢复后首个 Turn 的 `context.appended` 事件携带该记录。
- 全量：kernel + runtime-host 335/335 过；impact（agent-session.ts）340 例过。
- 检查：root `tsgo --noEmit` + runtime-core `tsconfig.build.json` 绿；`check:lint` 绿。
- 验证边界：排空期被拒（记录已 splice 进 Turn）与 `closed` 投递仍按死信处理（前者已部分消费防重复，后者真不可达）；记录持久化到 `context.appended` 事件随会话文档落盘，但「进程退出前的投递」仍只在内存排队——跨进程重启级持久化未覆盖（与 team-notification-journal 同级的 journal 属后续演进）。
