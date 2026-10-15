---
id: BUG-0082
type: bug
status: investigating
priority: P1
owner: apps/desktop conversation
source: VERIFY-0017 组一续测（2026-10-08 排 TASK-0191 时发现并确定性复现）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: [TASK-0191]
related_issues: []
related_bugs: [BUG-0018]
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# provider 连接中断后回合不进入终态：态 A 无自救手段、态 B 确定性复现

## 用户流程

正常使用会话；provider 连接在回合中途被粗暴切断（生产等价物：provider 进程崩溃、网络中断、主进程被杀）。

## 期望行为（BUG-0018 已 done 的合同面）

当前 Turn 应在有限时间内进入明确的 `interrupted`/`aborted` 终态；后续消息应能正常发送；不应长时间卡在「处理中」。

## 实际行为

- **态 A（严重；无自救手段）**：会话「分步慢输出」的 `turn-eecb181d` 在落盘记录里**只有 `turn.started` + 两条 `message.appended`，没有任何终止事件**（无 `turn.completed`/`turn.cancelled`/`turn.failed`）。UI 同屏呈现「处理中…｜正在处理 · 31分16秒」与错误卡片「网络没连上／检查一下网络或代理，然后重新发送」；composer aria 为「正在思考…」、模型选择器被禁用，**「停止生成」与「发送消息」都不在**——既不能取消回合也不能发新消息。渲染进程重载无效；重启应用后恢复可发送。⇒ 忙态由主进程内存在途回合持有，非从落盘记录推导。截图：`<artifactDir>\stuck-turn-wedged-session.png`。
- **态 B（确定性复现；有自救手段）**：新会话发一条走 `/control/slow` 的消息，流式中杀掉夹具进程 → 60 秒内「停止生成」一直在、无终态事件、计时器持续增长；点「停止生成」后 3 秒内恢复，会话记录写入 `turn.cancelled reason="This operation was aborted"`。⇒ provider 连接中断后回合不会自动进入终态，用户可手动中断。

## 复现步骤（态 B，确定性）

1. Debug Profile 连接夹具 provider，发一条路由到 `/control/slow` 的消息进入流式态。
2. 杀掉夹具进程（模拟 provider 粗暴断连）。
3. 观察 60 秒：无 `turn.*` 终态事件、无错误卡片；点「停止生成」可恢复。

## 触发条件与边界

触发条件**不是**「用户点停止」，而是 provider 连接在回合中途被粗暴切断。态 A 同时违反 BUG-0018 的「有限时间内终态」与「后续消息应能正常发送」两条且连中断入口都没有；态 B 违反前者、保留后者。夹具自身在客户端断开后 `enqueue` 抛 `Invalid state: Controller is already closed` 的缺陷已修（`try/catch push` + `cancel()` 清表），态 B 复现不依赖该缺陷。

## 回归验证

待修复：同条件下（中断→不点停止）回合应在有限时间内自动写入终态事件，UI 恢复可发送；态 A 的「既不能取消也不能发送」不应出现。
