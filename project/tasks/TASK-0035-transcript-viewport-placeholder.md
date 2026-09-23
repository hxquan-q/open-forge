---
id: TASK-0035
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-1 第 1 步 / TASK-0034 合同
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0031]
conflicts_with: []
integration_status: integrated（forge/dev 工作区，未提交）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# transcript 窗口化第 1 步：视口外消息元数据占位

## 目标

在 `chatMessagesAtom` 与消息列表中为视口外持久化消息保存轻量占位，而不继续驻留完整 `blocks`/`text`。Renderer 保留全历史顺序和可定位性；本步不分页历史条目，后续由 TASK-0050 将元数据窗口化。

## 范围

### 并发评估

- 结论：不支持并发；与 TASK-0050、TASK-0051、TASK-0038 同属 transcript 顺序链。
- 执行方式：共享 `forge/dev` 工作区串行。
- 可并行 Task：无（本链内）。
- 前置依赖：TASK-0034 合同定稿、TASK-0031 媒体引用化（done）。
- 冲突文件/独占路径：`chat-atoms.ts`、conversation MessageList/ViewModel、`MessageTimeline`、消息快照 reconcile；release note 按提交独占。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不建独立 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0035 → TASK-0050 → TASK-0051 → TASK-0038。

### 做

- 新增显式占位 ViewModel，保留完整消息相同的稳定 id/render key、role/kind、时间、entryId、分支导航信息、最多 120 Unicode 字符的文本摘要及轻量 usage/model 元数据。
- 占位不保存完整 blocks、text、thinking、tool args/results 或媒体字节；现有 `src` 引用与旧会话 `data:` 回退行为不变。
- 消息进入 Virtuoso 的当前 overscan 窗口（上 320px、下 80px）时恢复完整消息；离开后降级。流式尾项、焦点/选区和正在交互的卡片保持完整。
- 更新 MessageTimeline、model-switch、usage、fork 来源和插件卡片等消费者，使占位由明确定义的摘要元数据驱动；对占位执行复制/展开等需全文操作时先恢复目标消息。
- 保持 `preserveMessagesAddedAfterSnapshot` 在预览回填与 live/optimistic reconcile 下按稳定 ID 保留未持久化行；不能因占位变体重复或丢失消息。

### 不做

- 不实现 `beforeEntry` 分页和 `subscribeViewer` delta（TASK-0050）。
- 不改变 compaction 边界重放、JSONL 持久化或模型上下文语义（TASK-0051）。
- 不重写渲染管线或把全量历史搜索/导出绑定到当前占位数组。

## Given / When / Then

- Given：用户打开含数百条消息、工具结果和媒体引用的长会话。
- When：从尾部向上滚动，再返回尾部并切换到另一会话。
- Then：视口及 overscan 内消息完整且显示一致，视口外消息仅保留约定元数据；滚动、目录跳转、usage、分支操作与单条复制可正常工作，所有消息仍可恢复，切换后旧会话重型 blocks 可释放。

## 必须保持

- 每个历史消息恰有一个稳定 id 和原有时间线位置；占位不得被误认作空的完整消息。
- 消息块完整性和已发送消息可见性不变；占位触发恢复后显示内容、分支、usage、plugin card 与媒体行为和当前一致。
- session switch、快速滚动、恢复请求重排或失败时不得把其他 session 的消息写入当前窗口；失败后占位可重试且不丢摘要。
- 单一事实源仍为 JSONL；本步骤仅释放 Renderer 对完整对象的引用。

## 测试与验证

- 定向：占位/还原映射、摘要与轻量字段保留、禁止携带 blocks/text/media payload、稳定 render key；快速进出视口与过期/乱序恢复不会覆盖新状态。
- 用户流程：打开长会话 → 向上浏览/搜索目录 → 点击占位并复制或打开分支操作 → 返回尾部 → 切换会话再返回；断言用户可见内容一致且无跨会话串写。
- 性能：同一固定合成长会话对比完整 blocks 驻留数及 Renderer `privateBytes` 峰值/稳态；DOM 虚拟化不是内存验收替代。
- 质量：根目录 `bun run test:impact -- <改动文件...>`、`bun run check:quick -- <改动文件...>`；完整代码轮完成后 `bun run check`。补当前版本 Release Notes。

## 交付记录

- 实际修改：
  - `services/transcript-window.ts`（新）：`TranscriptPlaceholderItem` 占位构造/还原/驱逐判定、`applyTranscriptWindow` 视口窗口化、`materializeTranscriptItem` 按 span 切片重投影、backlog 注册表（每 session 上限、LRU 淘汰）；占位保留 id/entryId/renderKey/parentId/turnId/authorId/timestamp/role/branch/usages/phase/model/deliveryPhase 与 ≤120 Unicode 字符摘要，不携带 `text`/`blocks`/媒体 payload。
  - `services/transcript-window-controller.ts`（新）：`registerActiveTranscriptBacklog`（canonical 全量投影提交点统一登记原始 entries+spans）与 `ensureTranscriptItemRestored`（消费方同步还原）。
  - `services/chat-service.ts`：`fullHistoryToChatWithSpans` 返回 `{messages, spans}`（`fullHistoryToChat` 委托之），span 记录每个渲染 item 的 entry 区间（含 marker 续段、assistant 折叠、user/assistant 边界）。
  - `chat-atoms.ts`：`ChatTimelineItem = ChatConversationItem | TranscriptPlaceholderItem`，时间线边界全面放宽；canonical 历史投影仍只产 `ChatConversationItem`。
  - `MessageListView`/`MessageItem`/`MessageRendering`/`MessageTimeline`/`message-list-derived`/`messageNavigationModel`/`message-height-estimates`/`ForkOriginBanner`：union 适配 + 占位行渲染 + Virtuoso `rangeChanged` 回调触发窗口化；timeline 跳转目标为占位时先 `ensureTranscriptItemRestored` 避免摘要闪烁。
  - backlog 注册点：`useSessionOpener`（canonical backfill）、`useSessionEventController`（agent_end/compaction 全量刷新）、`useSessionMessageSender`、`useUserMessageActions`（编辑/重载）。
  - `conversation-projection.ts`：flush 边界放宽为 `ChatTimelineItem[]`，内部收窄保证只有完整 agent item 进入 reducer；`buildRecentConversation` 用占位 `summary` 兜底。
  - `optimistic-user-message-cache.ts`/`chat-message-snapshot.ts`：泛型化 `T extends ChatConversationItem`/`T extends ChatTimelineItem`，canonical 契约不被占位污染；乐观用户消息调和保持原语义。
  - `plugin-host-bridge.ts`、导出组件、`useChatExportHostModel` 等消费方签名放宽，占位行导出以摘要文本呈现。
- 实际运行：
  - `transcript-window.test.ts`（新）14/14 绿：占位构造字段白名单、窗口化、span 还原保 id、乱序/过期恢复不覆盖新状态、跨 session 隔离、backlog LRU。
  - `chat-service-error` 15、`chat-service-turn` 6、`conversation-projection` 7、`useSessionManager.session-switch` 9、`useSessionManager.queue` 9、`useSessionManager.cross-session-leak` 1、`failed-resend-rollback` 6、`useMessageCardsHostModel` 6、`useUserMessageActions.runtime-readiness` 2、`MessageExtensions.flow` 6、`MessageListView` 12（补 `NewSessionBackground` mock 后）全绿。
  - `bun run test:impact -- <本任务 18 文件>`：除他人 RED（见下）与本任务已修复项外通过。
  - `tsc --noEmit`（desktop）：本任务文件 0 错误。
- 未运行及原因：
  - `bun run check` 全量：工作区存在多个其他 Agent 在途改动，全量门禁目前因非本任务文件失败；本任务文件已过 `check:quick` 相关 lint/format。
  - `privateBytes` A/B：占位机制已就位但窗口化默认仅在 backlog 注册且列表上报 range 后生效；Renderer 内存峰值对比建议随 TASK-0050 元数据窗口化一起做端到端测量，避免重复埋点。
- 剩余风险：
  - `chat-service-agent-text.test.ts`（他人在途新增）断言历史消息 `text` 应为 undefined（blocks 派生去重契约），当前 HEAD 语义仍累积 `text`——该测试属其作者的 RED，落地时需同步更新 `chat-service-error.test.ts:88` 旧断言；本任务 `summarizeItem` 已兼容 `text===undefined` 路径。
  - Virtuoso 未上报 `rangeChanged`（如导出/打印路径）时占位不触发还原；已用 `ensureTranscriptItemRestored` 覆盖导航/操作入口，但非常规消费方需留意。
  - 超大单会话首次打开仍全量投影一次（窗口化释放的是驻留引用，不是首屏成本）；TASK-0041 的 tail 加载模式与之正交互补。
