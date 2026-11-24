---
id: TASK-0494
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0477]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 043494c23
read_paths:
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/session-events-domain.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - packages/host-protocol/src/port-bridge.ts
  - packages/host-protocol/src/client.ts
write_paths:
  - packages/host-protocol/src/domains/session-events.ts
  - packages/host-protocol/src/domains/session-queue.ts
  - apps/desktop/src/shared/session-global-event-codec.ts
  - apps/desktop/src/main/host/session-events-domain.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/apis/session.test.ts
  - apps/desktop/src/renderer/shared/store/running-sessions-atoms.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0494-session-global-event-push.md
exclusive_paths: []
depends_on: [TASK-0477]
conflicts_with: []
integration_status: pending
created: 2026-11-09
updated: 2026-11-24
---
<!-- Copyright The Open Forge contributors. -->

# 全局会话事件推送迁移到 Host 事件原语（TASK-0465 推送面第 1 片）

## 目标

把 `vetta:session:sessions-changed` 与 `vetta:session:running-changed` 两个全局推送从旧 `webContents.send` 通道迁到 Host 事件面 `session.subscribeGlobal`，主窗口 renderer 签名不变。IPC 通道计数保持 622（推送不走 `ipcMain.handle`，不计入口径）。

## 做

- `SESSION_EVENTS_HOST_METHODS` 新增 `subscribeGlobal`：`NoParams`（`additionalProperties: false`）、结果 `{ subscriptionId: string }`；`session-events-domain.ts` 生成连接级订阅 id `global:<uuid>`，挂载会话列表变更、runtime 运行态变更、team 服务运行态变更三个监听，payload 用带 `kind` 标签的联合（`sessions-changed` / `running-changed`），`session.unsubscribe` 或端口关闭时一次摘除全部监听且幂等；`ctx.events` 缺失时返回 `CAPABILITY_UNAVAILABLE`；不重放快照。
- 新增 `apps/desktop/src/shared/session-global-event-codec.ts`：`decodeSessionGlobalEvent(payload: unknown)` 按标签校验并抛出 `TypeError`，供 preload 校验收窄；`session-queue.ts` 修正“队列状态有推送”的过期注释（实际为 `session.getQueueState` 拉取）。
- preload `createSessionApi`：`onSessionsChanged`/`onRunningChanged` 改为按事件种类各自维护监听集合，首次注册懒建立唯一连接级订阅，两类推送共用；解码失败共享同一连续计数（`MAX_CONSECUTIVE_DECODE_FAILURES`）；建立失败（端口等待超时/端口已关）只记录一次并重置启动态，后续注册监听时重试；窗口生命周期内不退订连接级订阅，避免重建窗口期间的事件空档。
- `ipc/session.ts`：`sessions-changed` 旧广播整体删除（仅主窗口消费）；`running-changed` 旧广播收窄为非主窗口（快捷面板 preload 直接订阅该通道），同时修掉此前对主窗口的重复发送。

## 不做

- 不改 `subscribeSessionEvents`（按 sessionPath 的事件订阅）及其端口帧协议。
- 不迁快捷面板自身的 `running-changed` 直订阅：快捷面板是独立 BrowserWindow、preload 未走 Host 客户端，留给后续推送面切片。
- 不改事件语义：不新增快照重放、不改变原因枚举与字段。

## Given-When-Then

- Given Host 端口可用且 `ctx.events` 存在，When renderer 注册 `onSessionsChanged` 与 `onRunningChanged`，Then 只发出一次 `session.subscribeGlobal` 请求，两类事件按 `kind` 分发到各自监听。
- Given 首批事件在监听注册前到达，When 注册监听，Then 按注册顺序回放不超过上限的待处理事件。
- Given `ctx.events` 缺失，When 调用 `session.subscribeGlobal`，Then 返回 `CAPABILITY_UNAVAILABLE`，preload 记录一次并保留后续重试能力。
- Given 订阅建立后调用 `session.unsubscribe` 或端口关闭，When 三类源各再触发一次变更，Then 不再发出事件帧，且重复退订幂等。
- Given 解码连续失败达到阈值，When 下一帧仍无法解码，Then 抛出 `TypeError` 终止坏流；期间任一成功解码重置共享计数。

## 测试与验证

- 定向：`bun run vitest --run apps/desktop/src/preload/apis/session.test.ts` 18/18 通过（新增共享订阅/分发、安装失败重试、注册前端口关闭、共享解码容忍 4 例）。
- 定向：`bun run vitest --run apps/desktop/src/main/host/desktop-host.test.ts` 新用例通过；独立单跑仍有 4 个既有环境依赖失败（models 配置 provider-key 拷贝、models 探测 2 例、会话执行模式切换缺少 `getAllWindows` mock），与本次改动无关；全量套件未复现。
- `bun run check:quick -- <changed files>`：通过（`ratchet: waived=623 new=0`）。
- `bun run test:impact -- <7 个变更文件>`：exit=0；desktop `vitest related` 271 文件 / 1438 例全通过（1256s），host-protocol 1 文件 / 7 例通过。
- `bun run test:changed`：exit=1；desktop 1130 文件 / 6389 例（1118 文件、6356 例通过，18 例跳过，15 例失败），host-protocol 通过。15 例失败均为本机既有环境问题、与本次改动无关：13 例走 Windows 回环 SSH 路径映射（`/bin/sh: 1: cd: can't cd to /c/...`；隔离复跑 `filesystem-service.remote-flow`、`skill-presentation-read` 同样失败）；`weknoraExport.cp3-reverify`（5s 超时）与 `useSessionManager.session-switch`（断言偶发）各 1 例隔离复跑转为通过。7 个变更文件的下游 271 文件 / 1438 例在 `test:impact` 中全通过。
- `bun run check`：exit=1，仅两项与本次改动无关的历史遗留：`WAIVER-0011`/`WAIVER-0012` 于 2026-11-11 过期，需负责人重新评审或撤销；工作区未跟踪的 `ui/allstar.op`（2026-11-09 遗留设计稿）未归类。types（root/desktop/mobile/docs/cli）、lint、mobile-lint、package-boundaries 等其余目标全绿，`ratchet: waived=623 new=0`。

## 交付记录

- 实际修改（2026-11-24）：如“做”所列——`session.subscribeGlobal` 合同与 `session-events-domain.ts` 三类监听、`session-global-event-codec.ts` 标签解码、preload 唯一连接级订阅与失败重试、`ipc/session.ts` 删 `sessions-changed` 广播并把 `running-changed` 收窄到非主窗口。
- 实际验证：定向 preload 18 例、host-protocol 7 例、desktop related 1438 例通过；`check` 的 types/lint/guards（除上述 waiver 与未跟踪文件）通过；IPC 通道数保持 622（推送不计 `ipcMain.handle` 口径）。
- 未运行与风险：`bun run check` 与 `test:changed` 的失败项为上列历史/环境原因，未在本任务内处理；Desktop 手工 UI 走查需授权，未执行。
