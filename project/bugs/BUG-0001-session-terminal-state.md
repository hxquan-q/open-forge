---
id: BUG-0001
type: bug
status: done
priority: P0
owner: runtime-core/desktop/ai
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\desktop-app\logs\main\2026-09-22.log
created: 2026-09-22
updated: 2026-09-24
---

# Session 长任务取消/压缩后的终态与性能问题

## 当前证据

- 原版 `0.5.58` 日志出现 DeepSeek `AI_STREAM_PROTOCOL_FAILED`。
- Agent Team 成员 Turn 出现约 248 秒耗时。
- Context Compaction 出现约 34–43 秒耗时和失败。
- App Monitor 的 compaction 汇总与主日志不一致。

这些是本地证据和用户报告，不等同于已经完成的独立最小复现。

## 期望行为

取消、失败、压缩失败和 Session 切换必须在有限时间内产生明确终态，不得永久等待或只重置 Renderer loading 状态。

## 回归测试方向

- Provider/Tool 忽略 AbortSignal；
- Compaction single-flight 和取消；
- Team Member 失败向父 Coordinator 收尾；
- Session 切换不永久等待；
- 重启后恢复 interrupted Turn；
- 性能快照与主流程事件一致。

## 根因状态

`AI_STREAM_PROTOCOL_FAILED` 已有明确 Provider 证据。永久卡死已用可控 Fake 在 Team Member 链路确定性重现并修复：

- **成员收尾无界**：`SubagentRun.settleInterruptedExecution` 无条件等待 `handle.abort()` + `handle.waitForIdle()` + `beforeStop`，忽略 AbortSignal 的子会话会让并发槽位永不释放、`Coordinator.dispose()` 永不返回。已加 `settleDeadlineMs`（默认 10s）整段约束，超时经 `onError` 上报后强制 `markSettled` 释放槽位。
- **创建/重开无界**：`factory.create`/`reopen` 悬挂会同时挂死 `spawn()`/`followUp()` 与 dispose 的 `startOperations`。已加 `startDeadlineMs`（默认 30s），超时按启动失败收敛成员终态，迟到句柄到达即释放。
- **子句柄释放无界**：`handle.dispose()` 悬挂会挂死 `releaseHandle`/`clearFinished`/dispose。已用 `settleDeadlineMs` 约束 `disposeForeignHandle`。
- **失败被遮蔽**：`agent_end` 不携带结局，Turn 失败的 `error`+`agent_end` 事件对被记成 `completed`。`SubagentChildEvent` 增加 `reason`/`errorMessage`/`errorCode`，Coding Agent child handle 按 session `error`（终态失败）与 `aborted` 相位投影 `failed`/`interrupted`。

回归覆盖（`runtime-subagents`/`coding-agent` 定向测试）：Provider/Tool 忽略 AbortSignal 的槽位释放、create/reopen/dispose 超时收敛、成员失败/外部中止的终态投影与父级通知、失败回执抛错。Session 取消宽限见 TASK-0003，Compaction 并发/取消见 TASK-0005，重启恢复见 coordinator-recovery 用例，App Monitor 汇总缺口在 BUG-0003 跟踪。

未决边界：0.5.58 日志里 248s 成员 Turn 的具体 Provider 慢响应无法用日志反证；有界收尾保证的是「取消/关闭路径不再永久等待」，不限制成员正常长 Turn 本身。
