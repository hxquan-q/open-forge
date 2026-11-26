---
id: BUG-0198
type: bug
status: fixing
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: upstream-equivalence-check-2026-11-26（PLAN-0032 D4 核对，上游修复 c83d5c220）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 失败的定时任务仍被记成成功，列表与历史误显绿色

## 用户流程

- Given：一个已启用、非一次性或一次性的定时任务。
- When：任务到点触发，执行轮次因 Provider 错误等原因失败（runtime 发出 `error` 事件后以 `agent_end` 收尾）。
- Then：任务「最近运行」状态与执行历史记录应为失败，并带错误摘要。

## 实际行为

记录与最近运行状态都显示成功（绿色）。用户打开历史才可能在会话正文里发现实际失败；一次性失败任务照常自动停用。

## 期望行为

失败轮次记 `failed`：执行记录 `status: "failed"`、`error` 带失败消息；任务最近运行状态为失败。中止（aborted）与成功路径不变。

## 环境与失败证据

- 上游已修复：`c83d5c220 fix(desktop): 失败的定时任务不再记成成功`（在 PLAN-0032 调查基线 `641aaf694` 内，但 fork 此前未择优合入该行为）。
- 本地机制（`apps/desktop/src/main/scheduler/task-executor.ts`）：`session.lifecycle` 到达 `agent_end` 分支时无条件 `record.status = "success"`（约 line 227 附近）；订阅回调没有任何 `error` 事件分支，runtime 发出的 `error(turnId)` 被完全忽略（`packages/runtime-core/src/runtime-host/kernel-session-events.ts:139`、`:166` 确认失败轮次确实先发 `error` 再发 `agent_end`）。

## 根因

失败的一轮同样以 `agent_end` 生命周期收尾，执行器只看生命周期就把失败记成成功。

## 修复方向

与上游 `c83d5c220` 等价：执行器捕获带 `turnId` 的 `error` 事件记入 `turnFailure`；`agent_end` 时按 `aborted / turnFailure / 否则` 落到 `aborted / failed / success`；`record.error` 写入失败消息；`record.updated` 事件与 preload 类型加宽 `"failed"`。渲染侧 `record.updated` 仅触发重载、`record.error` 已被历史页消费，无需改渲染代码。

## 修复与验证

由 TASK-0517 实施（2026-11-26）：`turnFailure` 捕获 + 三态收口，红灯先行（失败用例在未修复代码上复现 `success` 误记），修复后定向 3/3、impact 108/108、`bun run check` 全绿。待独立复查与实机验收。
