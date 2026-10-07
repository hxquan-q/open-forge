---
id: BUG-0068
type: bug
status: verifying
priority: P1
owner: apps/desktop
source: user-report; screenshot; source inspection
related_requirement: []
related_plan: []
related_tasks: [TASK-0185]
related_issues: []
related_bugs: [BUG-0021]
depends_on: []
created: 2026-10-03
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 会话结束后用户消息仍显示在回复末尾（队列消费变体）

## 用户流程

- Given：一个进行中的会话回合，用户发送的消息经 kernel 队列排队后被该回合消费（followUp 自然停止点接力 / steering 工具间隙注入 / 立即发送）。
- When：消息被消费、Assistant 继续/结束回复，`agent_end` 历史重拉与会话重开完成乐观对账。
- Then：用户消息必须排在它触发的 Assistant 回复之前；任何对账、窗口化提交或历史回填都不得把它挪到回复末尾。

## 实际行为

会话结束后，用户消息“两个爆破最凶的能不能找到是谁吗”显示在回答该问题的 Assistant 回复末尾，视觉上像刚新发。截图中回复已完整结束（含操作栏与建议 chips），用户气泡在其下方。BUG-0021 已标记 done，本记录跟踪同症状的残余变体。

## 期望行为

乐观/镜像用户气泡按因果位置呈现：未对账时保持其 live 相对位置或按 user 序号插入；规范历史到达后按文本吸收，绝不在回复之后追加。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：apps/desktop 工作区，Windows。
- 失败测试/CI 用例与命令（若适用）：复现用例随 TASK-0185 新增。
- CI run URL 与脱敏后的关键输出（若适用）：无。
- 基线对照或重跑结果：无。

## 最小复现

1. 在已有会话中发起一轮需要较长处理的请求（或会话已进入窗口化 transcript）。
2. 回合运行中发送第二条消息使其进入 kernel 队列并被回合消费；随后可再排队一条不消费的消息。
3. 回合结束 / 会话重开后观察：被消费的用户消息显示在它触发的回复之后。

## 影响

对话因果顺序不可信，用户难以判断回复对应哪条请求；与 BUG-0021 相同的 P1 合同违约。

## 根因证据

多条已确认的尾部追加/跳过重拉路径（按代码阅读证据置信度排序）：

- `apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts` `flush()`：`queue.changed` 消费处理调用 `reset()` 切断 assistant 草稿，但 `targetMessageId` 复位后仍按确定性 `assistant:{sessionId}:{turnId}` 计算——kernel 单 turn 内 turnId 不变，`findIndex` 命中消费前的同 id 消息并原位替换，消费后的回复内容落回用户气泡之前，气泡孤立在尾部。
- `apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.ts` `insertUnresolvedOptimisticMessages`：`precedingUserCount !== canonicalUserCount` 时走 `tailFallback` 把未决气泡追加到历史绝对末尾；规范历史里该序号被其他消息占用或文本不一致（如 prompt 展开后 displayText 与落盘文本不同）即触发。
- `apps/desktop/src/renderer/domains/conversation/services/transcript-window.ts` `reconcileWindowedProjection`：未消费的 live-only 项一律平铺追加尾部；`reconcileOptimisticUserMessagesTail` 的尾对齐按「pending 数对齐尾部 user 数」严格对位——pending 中存在其后入队但未被消费的幽灵条目时，被消费消息的镜像气泡对位落空，经 live-only 追加到回复末尾。
- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts` `sendQueuedNow`：无论 kernel 返回 `started` / `missing` 都先 `bumpQueuedDispatchSeq`；未真正派发新一轮时本轮 `agent_end` 重拉被判过期跳过，未对账气泡停在原错位位置。
- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts` 与 `chat-message-snapshot.ts` `preserveMessagesAddedAfterSnapshot`：会话打开/回填路径把 canonical 之外的 current 项与未决乐观气泡平铺追加尾部。

根因置信度：中高；错序行为由截图确认，尾部追加机制由源码确认，具体触发链待回归用例固定。

## 回归测试

随 TASK-0185 在真实入口补用例（新用例均在旧实现下先红）：

- `conversation-projection.test.ts`：消费 reset 后同 `turnId` 事件派生新消息行，不原位替换。
- `optimistic-user-message-cache.test.ts`：`precedingUserCount < canonicalUserCount`（序号被更早发送占用）时按发送序号落位而非尾部；`>` 保留尾部兜底；未决条目 `MAX_UNRESOLVED_RECONCILES` 过期。
- `transcript-window.test.ts` / `transcript-window-controller.test.ts`：live-only 用户气泡按已消费后继/前驱锚定归位；尾部 pending 幽灵不再把镜像挤到回复后。
- `chat-message-snapshot.test.ts`：快照保留路径同套锚定规则；非 user live-only 项维持尾部。
- `useSessionManager.queue.test.ts`：事件级复现「排队消费 → assistant 流 → agent_end 重拉」，断言气泡在回复前；`sendQueuedNow` 非 `started` 结果撤回派发序号。

## 修复与验证

- 修复：五处尾部追加/原位替换路径按「因果锚点归位、无锚点才尾部」收口——`ConversationProjection.flush` 目标 id 被占用时派生 `…#N` 新 id；`insertUnresolvedOptimisticMessages` 按发送序号钳制落位；`reconcileWindowedProjection` 与 `preserveMessagesAddedAfterSnapshot` 按已消费/持久化邻居锚定；`sendQueuedNow` 非 `started` 结果经 `unbumpQueuedDispatchSeq` 撤回序号；`useSessionOpener` 未决乐观气泡按 reconciled 锚点插入。详见 TASK-0185 交付记录。
- 测试：定向 6 文件 96 例、hooks 11 例；conversation 域 177 文件 956 例；`test:impact` direct 6/96 + related 56/397 全绿。
- 检查：`check:quick` 绿；完整 `bun run check`（lint/types×5/guards/mobile-lint）全绿，`ratchet: new=0`。
- 未运行及原因：verify:ui 未获任务授权；真实会话人工验收待用户回归。

## 人工复现（2026-10-08，VERIFY-0017 组一续测十四）

在隔离 Debug Profile 的真实会话里复现同族症状；操作是正常用户流程（回合流式中连发两条消息使其排队），无需注入内核事件。

- **复现 2/2 个会话**：回合结束、队列抽屉已不再显示「N 条待发」之后，实时视图仍比落盘多出**两个重复用户气泡**并追加在尾部——DOM 8 行 `GHOST-1 / 回复 / GHOST-A / 回复 / GHOST-B / GHOST-A / 回复 / GHOST-B`，而会话记录只有 6 条（`MDA0YTMzODgt…conversation.jsonl` seq2–7）。
- **命中本记录列的机制**：重复行的 `data-entry-id` 是乐观 id（`user-16-1791391810833`、`user-17-1791391811301`），正牌行是规范 id（`event-4`/`event-6`）⇒ 未决乐观气泡未被规范历史吸收。
- **只存在于渲染端**：刷新后重开同一会话恢复为 6 行，幽灵未落盘。
- 与原始症状（会话结束后用户消息显示在回复末尾）同族的**重复**变体：本条 `verifying` 状态与处置（归入本 Bug 还是另立新缺陷）待用户/后续 Task 裁定。
- 证据：`0194-ghost-duplicate-tail.png`、`0194-ghost-session-conversation.jsonl`（artifactDir）。
