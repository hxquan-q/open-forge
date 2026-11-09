---
id: TASK-0477
type: task
status: in_progress
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0476]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f3c3335a6
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/host-protocol/src/port-bridge.ts
  - packages/host-protocol/src/stream.ts
  - packages/host-protocol/src/host.ts
write_paths:
  - packages/host-protocol/src/port-bridge.ts
  - packages/host-protocol/src/host.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-events-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/preload/host-transport.ts
  - apps/desktop/src/preload/apis/session.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0477-session-event-subscription-primitive.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0476]
conflicts_with: []
integration_status: pending
created: 2026-11-08
updated: 2026-11-08
---
<!-- Copyright The Open Forge contributors. -->

# 会话事件订阅原语：port 事件帧与 session.subscribe（Phase 3 第 4 批入口）

## 目标

TASK-0465 组 2 的解锁件：在 Host port 上建立事件推送原语，迁走 `vetta:session:{subscribe,unsubscribe}` 两通道与 `vetta:session:event` 推送；为 queue-state/sessions-changed/running-changed 等其余事件通道的后续迁移奠基。

## 设计（调查定稿，2026-11-08）

现状三件套：
1. 旧订阅（ipc/session.ts SUBSCRIBE）：`{subscriptionId} = sessionId + randomUUID()`，`runtime.subscribe` 回调经 `webContents.send(CHANNELS.EVENT, subscriptionId, slimSessionEventForIpc(event))` 下发；订阅时回放三份快照（后台任务/激活工具/子代理观察，extension observation 事件形态）；UNSUBSCRIBE 摘除。
2. port-bridge 帧格式：`{id, request?}` / `{id, response?}`，单调 id 关联；close 拒绝 pending。
3. reduceHostStream（ADR-0152 §6）：snapshot+delta、revision 连续才接受、断档进 stale。

设计：
- **帧扩展**：PortFrame 增加 `event` 变体 `{id, event: {subscriptionId, payload}}`；`portHostTransport` 暴露 `onHostEvent(port, subscriptionId, handler)` 订阅面；`serveHostOnPort` 返回的句柄增加 `emitEvent(subscriptionId, payload)`（host 侧）。
- **调用上下文注入**：HostDispatcher.handle 增加可选 per-call `events` 发射器（HostCallContext 扩展 `emitEvent(subscriptionId, payload): void`）；ipc.invoke 回退通道无 port，emitEvent 为 no-op 并记警告（bootstrap 期仅请求面，事件仍走旧通道直至端口建立）。
- **合同**：`session.subscribe {sessionId} → {subscriptionId}`、`session.unsubscribe {subscriptionId} → Null`。事件 payload 先保持 SessionEvent 原样透传（slim 后），不强钉形状——读取面（get-state/get-messages）与其享同一"快照+增量"故事，形状钉定随 reduceHostStream 域迁移逐步收窄。
- **域实现**：subscribe 注册 `runtime.subscribe` → ctx.emitEvent + 三份快照回放（沿用旧序）；unsubscribe 摘除；端口关闭（serveHostOnPort 句柄）时全量摘除，语义对齐旧 render-process-gone 清理。

## 实施切片（后续周期）

1. host-protocol：帧扩展 + transport/serve 事件面 + HostCallContext emitEvent + conformance 测试（内存端口对）。
2. desktop：session-events-domain（subscribe/unsubscribe + 回放）+ desktop-host 注册 + preload `subscribe` 切 `host.call` + `onSessionEvent` 改从 port 事件帧收。
3. 迁移后删旧 SUBSCRIBE/UNSUBSCRIBE/EVENT 三通道，IPC 计数 628 → 625。

## 不做

- 本片不迁 queue-state/sessions-changed 等其余事件（逐通道后继切片）；不动 viewer 流。

## Given / When / Then

- Given 端口已建立 / When renderer `host.call("session.subscribe")` 并经 port 事件帧收事件 / Then 事件流与旧 `vetta:session:event` 一致（含订阅时三份快照回放）；unsubscribe/端口关闭后不再收事件。

## 测试与验证

- host-protocol conformance（帧往返、事件投递、close 清理）；desktop 定向（desktop-host、preload）；双侧 typecheck；`check:quick`；`test:impact`；IPC 计数下降；门禁链 + quality 过滤核实。

## 交付记录

- 第一步完成（2026-11-08，提交 `56c37736c`）：host-protocol 帧扩展（event 变体）、`HostEventSink` 连接级发射器、`serveHostOnPort → {stop, events}` 句柄、`HostCallContext.events`（`HostDispatcher.handle(raw, {events})`）、客户端 `portHostEvents` 分发面；conformance 3 例新增（17/17 绿），desktop 两处调用点适配，双侧 typecheck 0，门禁全量绿（6348 例）。
- 第二步待做：desktop `session-events-domain`（subscribe/unsubscribe + 三份快照回放，经 `ctx.events.emitEvent`）；preload `subscribe` 切 `host.call` 并加端口就绪门（bootstrap 期未建端口时回退旧 ipc，待验证后第三步删除）；`onSessionEvent` 改从 `portHostEvents` 收。
- 第三步待做：删旧 SUBSCRIBE/UNSUBSCRIBE/EVENT 三通道，IPC 628 → 625。
