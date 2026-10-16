---
id: BUG-0122
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的 dev 日志（desktop-app/logs/2026-10-16，main/render 双侧同刻记录）
related_requirement: []
related_plan: []
related_tasks: [TASK-0279]
related_issues: []
related_bugs: [BUG-0109]
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 会话忙碌时续跑条仍可点击，点击必被内核拒绝且只弹笼统失败

## 用户流程

- Given：某普通会话在上一轮之后仍有排队输入（`streamingBehavior=followUp`），随后该轮以可恢复错误收尾，消息列表底部出现「上次回复未完成：[继续]」续跑条。
- When：会话其实仍在忙（活动轮次或刚落地的排队派发），用户点击「继续」，并在失败提示后继续点击。
- Then：期望忙碌期间不提供可点击的续跑入口；若确实被拒，提示应说明真实原因（会话正在运行），而不是笼统的「稍后重试」。

## 实际行为

- 续跑条依据渲染端自己的忙碌信念渲染：`MessageListFooter.tsx:46` 的 `showResumeBar` 只由 `interruptedErrorKind && runtimeSessionId && !retryLabel && !pendingLabel` 决定；`interruptedErrorKind` 来自 `interrupted-resume.ts:31` 在 `isStreaming || isCompacting` 时返回 `undefined`。
- 按钮无 `disabled`、无在途点击锁（`MessageListFooter.tsx:47-53`），失败只落一条通用提示 `messageList.resumeBar.failed`（「继续失败，请稍后重试」），且不修正渲染端的忙碌信念，用户会继续点。
- 内核侧拒绝点：`packages/runtime-core/src/kernel/agent-session.ts:267`（`retry()` 中 `state !== "idle"` → `sessionBusyError()`，消息 `Session already has an active turn`），经 `runtime-host/session-retry.ts:75-77` → `main/ipc/session.ts:1026-1030` 原样抛出。

## 期望行为

- 忙碌期间（活动轮次、或已有排队输入即将派发）不渲染可点击的续跑条。
- 续跑失败时按真实原因给出可操作文案：忙碌 → 「会话正在运行，请等当前回复结束后再试」；`recovery_required` → 说明需恢复的文案。
- 同一次失败不因用户重复点击而反复打到主进程。

## 环境与失败证据

- Open Forge 0.1.3 dev 实例，Windows 11；日志 `desktop-app/logs/2026-10-16`（main 与 render 两侧同刻记录）。
- 三对同刻记录，错误均为 `Session already has an active turn`：09:36:50.493 / 09:36:55.661 / 09:38:39.193（main 598/608/653，renderer 33/34/35）。
- 上下文时间线：09:33:56 用户以 `streamingBehavior=followUp` 提交（排队）；09:35:50 该轮因 `net::ERR_CONNECTION_RESET` 失败（`retryable:false`，故出现错误块 → 续跑条可见）；09:36:50 起的三次点击均被内核以忙碌拒绝；09:36:59 的下一条 prompt 同样只被排队接受；09:38:10 该轮再次失败。即内核在忙、渲染端认为空闲、按钮可点。

## 最小复现

1. 让某会话在活动轮次期间排队一条输入（`followUp`）。
2. 让当前轮次以可恢复错误（如网络中断）收尾，使续跑条出现。
3. 在排队派发落地前后的窗口内点击「继续」。

## 影响

续跑条是该场景下用户唯一的续跑入口；忙碌期间可点且失败文案误导（「稍后重试」暗示重试有用），用户会反复点击并持续失败，日志中出现成组的 `SESSION_BUSY`。

## 根因证据

已确认的接线缺口（含源码锚点）：

1. 门控只反映渲染端忙碌信念，未纳入主进程真值中的「排队待派发」窗口：`markRunning`（`runtime-host-session-event-relay.ts:380-398`）只在 `agent_start`/`agent_end`/`release` 触发，`queue.changed`（同文件 109-111）只做持久化、不进入运行集；因此 agent_end 与下一轮 agent_start 之间（排队派发窗口）明显不在 `runningSessionPaths` 内。
2. 渲染端已有队列镜像（`message-queue-atoms.ts:17` 的 `messageQueueBySessionAtom`，按 runtimeId 隔离），但续跑条门控没有消费它。
3. 失败原因未分类，`MessageListFooter` 对任何 rejection 都落通用文案。

**待调查（不假设唯一）**：渲染端在具体某一帧为何判空闲（agent_end→agent_start 窗口 / `next-prompts.generate` 辅助轮 / 内核 `cancelling`），日志无 `agent_start`/`agent_end` 与会话状态快照，无法判定唯一。本次修复不依赖区分三者：无论哪种，忙碌期间都不应提供可点击入口。

## 回归测试

- 组件层：真实 `SessionMessageList` + 可恢复错误场景，断言 `isStreaming` 为真时不渲染续跑条；断言会话存在未暂停排队输入时不渲染续跑条。
- 交互层：以 `window.vetta.session.retry` 拒绝（消息含 `Session already has an active turn`）断言 (a) 按钮进入 disabled/加载态、(b) 只发出一次调用、(c) 展示忙碌专属文案而非通用重试文案。

## 修复与验证

- 修复：见 TASK-0279——`MessageListFooter` 在途点击锁 + 按钮 `disabled`；`resume-failure` 分类后按忙碌/需恢复措辞；`resolveInterruptedErrorKind` 增 `hasPendingQueue`，`SessionMessageList` 据队列镜像门控。
- 测试：`resume-failure.test.ts` 12 例、`interrupted-resume.test.ts` 表驱动、`MessageListFooter.test.tsx`（忙碌文案 / 在途锁只发一次 + disabled）、`SessionMessageList.resume.test.tsx`（排队门控 + 清空恢复）——包内 4 文件 35 例全绿（旧实现下忙碌文案与门控用例必红）。
- 检查：`bun run test:impact` 101 例、`bun run check:quick`、`bun run check` 全绿。
- 未运行及原因：`verify:ui:*` 未获授权，交人工验收（需真实会话触发续跑条与排队窗口）。
- 剩余风险：失败归类依赖内核稳定文案片段；暂停队列同样隐藏续跑条；「渲染端为何判空闲」三种候选未加测点区分。
