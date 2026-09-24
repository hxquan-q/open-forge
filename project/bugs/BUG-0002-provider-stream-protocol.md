---
id: BUG-0002
type: bug
status: done
priority: P1
owner: packages/ai
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\desktop-app\logs\main\2026-09-22.log
created: 2026-09-22
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# DeepSeek Responses 流事件关联错误

## 实际行为

日志出现 `AI_STREAM_PROTOCOL_FAILED`，错误为 `response.content_part.added targeted the wrong output item`。

## 期望行为

Provider 协议错误应快速投影为稳定的 Provider/Team Member terminal failure，不得让父 Coordinator 无限等待。

## 证据与边界

这是原版 `0.5.58` 的真实日志证据；尚未在脱敏 fake stream fixture 中完成独立最小复现。

## 回归测试

覆盖 output item 关联、未知事件、partial stream、取消和 retryable/non-retryable 分类。

## 修复记录

- Provider 流协议层：TASK-0002 的脱敏 fixture 已覆盖关联错误、未知事件、partial stream、取消与可重试分类（`packages/ai/test/provider-stream-regression.test.ts`）。
- Team Member 投影：Coding Agent child handle 现在把 session `error`（非 assistant 通道，即终态失败）+ `agent_end` 投影为 `reason:"failed"` 并携带 `errorMessage`/`errorCode`；`aborted` 相位投影为 `reason:"interrupted"`；`prompt()` 对 `status:"failed"` 回执抛错兜底（`packages/coding-agent/src/composition/subagent/child-handle.ts`）。
- Coordinator 收敛：`SubagentRun` 按 `reason` 记 `failed`/`interrupted` 终态并走正常 onTerminal 投递；父级 `wait()`/`onNotify` 均能拿到稳定失败快照（`packages/runtime-subagents/test/coordinator-terminal-state.test.ts`）。
- 无限等待防护：成员创建、中断收尾与子句柄释放由 `startDeadlineMs`/`settleDeadlineMs` 约束，协议异常导致的子会话失控不再让 Coordinator 永久等待。
