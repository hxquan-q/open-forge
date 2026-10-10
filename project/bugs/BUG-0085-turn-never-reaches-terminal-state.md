---
id: BUG-0085
type: bug
status: verifying
priority: P1
owner: apps/desktop conversation / packages/ai
source: VERIFY-0017 组一续测（2026-10-08 排 TASK-0191 时发现并确定性复现）；2026-10-10 用户点名修复
requirement:
plan:
related_requirement: [REQ-0001]
related_plan: []
related_tasks: [TASK-0191, TASK-0223]
related_issues: [ISSUE-0022]
related_bugs: [BUG-0018]
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# provider 连接被切断后回合长时间不进终态：停滞重试级联把 30 分钟预算烧在死连接上

> 编号说明：原记录以未提交的 `BUG-0082-turn-never-reaches-terminal-state.md` 存在于主工作区；
> 集成 `origin/dev` 时 `BUG-0082` 已被 dev 的 ac-fence 记录占用，本记录改为 **BUG-0085** 入库。

## 用户流程

正常使用会话；provider 连接在回合中途被粗暴切断（生产等价物：provider 进程崩溃、网络中断、主进程被杀）。

## 期望行为（BUG-0018 已 done 的合同面）

当前 Turn 应在**有限且用户可接受的时间内**进入明确的 `interrupted`/`aborted` 终态；后续消息应能正常发送；不应长时间卡在「处理中」。

## 实际行为（原证据）

- **态 A（严重；无自救手段）**：会话「分步慢输出」的 `turn-eecb181d` 在落盘记录里**只有 `turn.started` + 两条 `message.appended`，没有任何终止事件**（无 `turn.completed`/`turn.cancelled`/`turn.failed`）。UI 同屏呈现「处理中…｜正在处理 · 31分16秒」与错误卡片「网络没连上／检查一下网络或代理，然后重新发送」；composer aria 为「正在思考…」、模型选择器被禁用，**「停止生成」与「发送消息」都不在**——既不能取消回合也不能发新消息。渲染进程重载无效；重启应用后恢复可发送。⇒ 忙态由主进程内存在途回合持有，非从落盘记录推导。截图：`<artifactDir>\stuck-turn-wedged-session.png`。
- **态 B（确定性复现；有自救手段）**：新会话发一条走 `/control/slow` 的消息，流式中杀掉夹具进程 → 60 秒内「停止生成」一直在、无终态事件、计时器持续增长；点「停止生成」后 3 秒内恢复，会话记录写入 `turn.cancelled reason="This operation was aborted"`。

## 复现步骤（态 B，确定性）

1. Debug Profile 连接夹具 provider，发一条路由到 `/control/slow` 的消息进入流式态。
2. 杀掉夹具进程（模拟 provider 粗暴断连）。
3. 观察 60 秒：无 `turn.*` 终态事件、无错误卡片；点「停止生成」可恢复。

## 根因（2026-10-10 定位）

死连接不会立刻报错，而是让每次 attempt 走到**零事件看门狗**：

- `packages/ai/src/provider-kit/provider-retry.ts`：单次 attempt 的空闲看门狗默认 `PROVIDER_STREAM_IDLE_TIMEOUT_DEFAULT_MS = 180_000`；停滞（`STREAM_IDLE_STALLED`）被 abort+drain 后，**与普通瞬态故障共用同一条 transient 预算**（`PROVIDER_TRANSIENT_MAX_RETRIES = 10`）。
- 于是「连接被接受但永不发数据」的死连接：**10 次重试 × 180 秒 ≈ 30 分钟**都停在「处理中」。态 A 的「31 分 16 秒」正是这条级联的时长（级联结束后才会落 `error` 终态）。
- `packages/coding-agent/src/execution/session-interrupt-health.ts` 的 240s 悬挂阈值只做「提示」不做终止，且其注释明确把重试活动当作活性证据（`SESSION_INTERRUPT_STREAM_STALL_IDLE_MS` 必须大于 180s + 退避）——即巡检器**不会**终止这条级联。
- ISSUE-0022 已修「停滞重连对用户不可见」的缺陷面，但其收尾记录也指出：页脚指示仍只由 runtime 级 `retry.start/end` 驱动，provider 级 `retry` 事件不产生界面副作用 ⇒ **30 分钟级联期间用户只看到转圈**，与态 A 现象一致。

## 影响

- P1：死连接下回合「假死」最长约 30 分钟，期间不能发新消息、不能取消（态 A）；托盘/模型选择器等一并被禁用。
- 数据不丢：重启后由 `turn-recovery` 记录中断，落盘可恢复（态 A 的恢复路径）。

## 仍未定位（本记录保留，另行诊断）

态 A 的「停止生成与发送都不在」是 UI 侧问题，与级联时长相关但不能由本次修复直接保证：

- `packages/theme-ui/src/chat/SendButton.tsx`：`externalPending`（发送前准备态）存在时按钮被禁用、点击被摘掉 ⇒ 该状态若驻留，用户就没有 abort 入口；
- 桌面侧 composer 的 `isStreaming` 来自 `@shared/store` 的 `isConversationBusyAtom`，而态 A 屏幕同时出现忙态指示与「两个按钮都不在」，需要一次实机复现才能确定是哪个状态位驻留（`isConversationBusyAtom` 未置位 vs `sendPending` 未清除）。

## 回归测试

`packages/ai/test/provider-retry.test.ts`：新增「停滞重试有专用上限」用例——provider 每次都停滞时，最多再开 1 次 attempt 就落 `error` 终态（`stream_idle_timeout`），不再烧满 transient 预算；既有「停滞消费 transient 预算」「预算耗尽后落终态」两例保持通过。

## 修复与验证

- 修复：见 [TASK-0223](../tasks/TASK-0223-turn-terminal-stall-bound.md)：停滞增加专用重试上限 `PROVIDER_STREAM_STALL_MAX_RETRIES = 1`（停滞仍走既有 abort+drain 与 transient 预算，但级联最多 2 个看门狗窗口）。
- 测试：新增回归用例先红（旧实现 4 次 attempt）后绿；`packages/ai` 全量 516 例、impact 321 例、完整 check 全绿（详见 TASK-0223 交付记录）。
- 验证边界：态 B 的实机复现与态 A 的 UI 入口属人工验收；编号变更（原 BUG-0082 → BUG-0085）见文首说明。
