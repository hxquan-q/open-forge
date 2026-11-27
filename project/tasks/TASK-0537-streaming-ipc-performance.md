---
id: TASK-0537
type: task
status: done
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ca4a42399
read_paths: []
write_paths:
  - apps/desktop/src/main/conversations/
  - apps/desktop/src/main/host/
  - apps/desktop/src/main/ipc/
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
  - .github/release-notes/fragments/v0.1.5/
  - .github/release-notes/v0.1.5.md
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 流式事件性能三连：工具参数合批、团队事件精简 partial、团队流式节流

## 合同

- 来源与目标：PLAN-0032 基线外增量，RESEARCH-0052 分诊性能批的第一组（流式/IPC），按 fork 实际手工合并三个上游提交：
  - 上游 `f0c003de0`：单聊工具调用参数流式时只发正在流式的那一块（稀疏数组），同一调用增量合并后最多 50ms 发一次，其它事件先冲刷保证顺序——大文件 write 时主进程结构化克隆量不再随参数长度平方增长。
  - 上游 `4dc9f15f8`：团队成员流式事件发往界面前精简 partial，与单聊共用同一套精简逻辑（`slimAssistantEventForIpc` 泛化）。
  - 上游 `61c5c72ce`：团队会话流式 token 按 100ms 节流推给界面——增量先写入 ref，首个增量立即显示、其后最多每 100ms 推一次 React，其它事件立即生效；与单聊既有 flushDeltas 同构。
- 做 / 不做：只做上述三项及其回归测试；性能批其余提交（计算/渲染批、设计画廊 iframe）属 TASK-0538/0539。
- Given / When / Then：
  - Agent 用 write 写大文件（数千个参数增量）→ 主进程 IPC 洪峰被合批到每 50ms 一次，且工具调用事件的 partial 只含当前 contentIndex 的块；渲染端工具参数照常累计展示、顺序不乱。
  - 团队成员写长回答 → 每个 token 不再携带完整公开消息过 IPC；渲染端只收到 delta 或正在流式的工具调用块。
  - 团队会话流式输出 → React 重渲染频率封顶 100ms 一次，首个 token 立即显示无延迟；非增量事件（end/discard/快照）立即冲刷。
- 保留：本地 port 事件帧架构（TASK-0477）保留——上游接线点 `ipc/session.ts forwardSessionEvents` 已不存在，合批接线落在 `host/session-events-domain.ts` subscribe 的 emitEvent 链路上；订阅清理（unsubscribe 与端口 onClose）同时 dispose 合批器。上游 `isDestroyed` 刷屏防护不迁移：本地 `serveHostOnPort` 的 postMessage 失败已按端口关闭处理并摘除订阅。
- 验证：定向 vitest（coalesce-tool-call-deltas、slim-session-event-for-ipc、agent-teams、useTeamChatModel、session-events-domain 相关）；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：无独立实机验收要求；性能效果随日常使用感知。

## 交付

- 状态：2026-11-27 完成实施与工程验证；无独立实机验收要求，性能效果随日常使用感知。
- 实施内容：
  - `f0c003de0` 工具参数合批：新增 `main/conversations/coalesce-tool-call-deltas.ts`——同一调用（turnId+modelCallIndex+contentIndex）的 `toolcall_delta` 最多滞留 50ms 并合并 `delta`（`partial` 取最新一帧），其它事件先冲刷再发送，保持顺序；订阅退订/端口关闭时 `dispose()` 丢弃待发增量并清计时器。接线落在 `host/session-events-domain.ts` 的 subscribe→emitEvent 链路，替代上游已不存在的 `ipc/session.ts forwardSessionEvents`。
  - `4dc9f15f8` 团队事件精简：`slim-session-event-for-ipc.ts` 泛化为 `slimAssistantEventForIpc`——`text_delta`/`thinking_delta` 只留 `delta`；`toolcall_*` 只保留当前 `contentIndex` 的块（稀疏 content 数组），不再随参数长度平方克隆；`ipc/agent-teams.ts` 的 `conversation.agent-message-event` 复用同一函数。
  - `61c5c72ce` 团队流式节流：`useTeamChatModel.ts` 增量先写 `streamsRef`，首个增量立即发布、其后最多 100ms 发布一次 React；end/discard/快照等非增量事件立即冲刷。`t` 改走 `tRef`，避免无关重渲染重建订阅时 cleanup 清掉待发计时器。
- 工程验证（全部实际执行）：
  - 定向 vitest（`apps/desktop` 包内）：coalesce-tool-call-deltas、slim-session-event-for-ipc、agent-teams、useTeamChatModel、TeamChatDelegationFlow 共 5 文件 65 用例通过。
  - `bun run test:impact --` 五个改动源文件：desktop 20 个测试文件 196 用例全部通过。
  - `bun run check` exit 0（lint/types/guards/mobile-lint 全绿；release-notes 存量风格 warning 非本次新增）。
- 复查：改动与直接消费方（main 订阅链、团队 IPC enrich、renderer 团队 reducer）逐点核对；合批/节流均保留原有事件顺序与清理语义，无新增吞错或降级路径。
- 发布说明：`.github/release-notes/fragments/v0.1.5/streaming-ipc-performance.md` 一条用户可见改进，已并入 `v0.1.5.md`。
