---
id: BUG-0073
type: bug
status: verifying
priority: P1
owner: apps/desktop
source: code-review(max)@c9db5fa27; source inspection
related_requirement: []
related_plan: []
related_tasks: [TASK-0194]
related_issues: []
related_bugs: [BUG-0068]
depends_on: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# BUG-0068 修复提交引入的锚定/派发序号回归

## 用户流程（稳定合同）

- Given：进行中的会话回合，用户消息经 kernel 队列排队、消费或「立即发送」插队。
- When：消息气泡经 queue.changed 消费上屏、`agent_end` 历史重拉、窗口化提交或会话重开对账。
- Then：气泡必须保持因果位置——已发送消息不得跑到其触发的回复之后；未发送的排队内容不得插进更早的已发送消息之前；`agent_end` 重拉判活不得被失败派发误杀；同形输入在窗口化与快照两层必须得到一致落位。

## 实际行为（4 项，均由 /code-review max 对 c9db5fa27 复审发现并经源码复核确认）

1. **并发「立即发送」时 unbump 误杀最新轮重拉**：turn-A 流式中点击 q-1（bump，kernel 开 turn-B）后再点 q-2（bump→IPC 返回 `missing`→unbump）；turn-B 的 `agent_start` 快照落在膨胀窗口内时，其 `agent_end` 判活 `current !== snapshot`（2≠1）为真 → `refreshTranscriptTail` 被跳过。turn-B 是最后一轮、无下一轮补偿，entryId 回填/时长/镜像吸收全部悬置到下次会话切换。
2. **未消费排队气泡被锚进历史中段**：`reconcileWindowedProjection` (b) 分支对「无已消费后继但有已消费前驱」的 live-only user 项一律锚到 canonical 下一个 user 之前。未消费排队气泡（孪生永远不会出现在该槽位，如取消失败回队留下的镜像）被插到比它更晚的已发送消息之前，且紧贴同槽内容形成瞬时重复；旧实现留在尾部才是未发送项的因果位。
3. **首部 live-only 项污染 `prependedCount`**：首部锚定的 live-only 项被 `+=` 进 `prependedCount`，唯一消费方 `loadOlderTranscriptPage` 把它当「新前插的历史页行数」前移 Virtuoso `firstItemIndex`，多移 anchor 造成翻页滚动跳行。当前产出首部组的路径恰好丢弃返回值，属潜伏缺陷。
4. **无可锚定 live-only user 项两层回退方向相反**：`useSessionOpener` 把 reconciled 中先于首个 canonical 项的未决气泡放到合并结果绝对头部（先于 preserve 保留的因果更早行）；`preserveMessagesAddedAfterSnapshot` 对同形输入走尾部追加。同形数据两层结果不一致，后续修一层漏一层。

## 期望行为

1. 失败派发的 bump/unbump 不得使任何已开启回合的 `agent_end` 重拉被判过期；只有真正发生过「跨到下一轮」的派发（序号净增长越过快照）才跳过。
2. (b) 分支仅在锚定槽位确为该气泡的规范孪生（文本一致）时锚定中段；否则维持尾部。
3. `prependedCount` 只统计新前插的 projected 条目，live-only 重排不计数。
4. 两层共用同一锚定/回退规则，同形输入必得同形落位。

## 环境与失败证据

- apps/desktop @ c9db5fa27（审查时 HEAD=48b8e487f），Windows。
- 证据：/code-review max 十项发现（4 项 CONFIRMED 缺陷 + 2 项根因建议 + 4 项质量项），主会话逐文件复读源码确认机制成立；回归用例随 TASK-0194 落地，旧实现先红。
- CI run URL：无（本地评审）。

## 最小复现

1. 竞态：turn-A 流式中 `sendQueuedNow(q-1)` 不等回返回即 `sendQueuedNow(q-2)`；在两次 IPC 返回之间让 turn-B `agent_start` 落地，随后 q-2 返回 `missing`；turn-B `agent_end` 观察重拉被跳过。
2. 幽灵锚定：live=[已持久化 u-1, pending 镜像(文本 X), pending 幽灵(文本 Y)]，canonical=[u-1, user X, assistant]；投影后 Y 出现在 user X 之前。
3. `prependedCount`：live=[pending, 已消费 u, 已消费 a]，canonical=[u, a]；(a) 锚定到 0 时 `prependedCount` 返回 1。
4. 回退不一致：同一 missing 气泡分别在 opener 与 snapshot 路径对账，一个落头一个落尾。

## 影响

对话因果顺序与历史重拉可靠性回退：最新轮回合结束后 entryId/时长/镜像吸收悬置（缺陷 1，P1，同 BUG-0068 症状等级）；未发送内容显示位置错乱（缺陷 2）；窗口化翻页滚动锚点跳行（缺陷 3，潜伏）；双层规则漂移使后续任一单侧修复必然复发（缺陷 4）。

## 根因证据

- 缺陷 1：`useSessionMessageSender.ts` `sendQueuedNow` 先 bump 后 IPC、失败 unbump（684-699 行）；`useSessionEventController.ts` `agent_start` 快照（262 行）与 `agent_end` 两处 `!==` 判活（297、324 行）；`message-queue-atoms.ts` `unbumpQueuedDispatchSeq` 盲减（95-100 行）。膨胀窗口内的快照在回撤后必然失配。
- 缺陷 2：`transcript-window.ts` 509 行 (b) 分支无孪生校验；`chat-message-snapshot.ts` 104 行同型实现同样无校验。
- 缺陷 3：`transcript-window.ts` 531 行 `prependedCount += (insertBefore.get(0) ?? []).length`。
- 缺陷 4：`useSessionOpener.ts` 764-770 行 headGroup 绝对头插 vs `chat-message-snapshot.ts` 112 行尾部兜底。
- 共性：因果锚点管线在 transcript-window / chat-message-snapshot / useSessionOpener 三处平行实现（约 55 行 ×3），任一修正只落在单侧即复发——抽取共享助手是本次修复的一部分，不是可选重构。

## 回归测试（随 TASK-0194 落地，旧实现先红）

- `transcript-window.test.ts`：幽灵气泡保持尾部（文本不匹配不锚中段、镜像仍锚孪生槽）；首部锚定项不计入 `prependedCount`。
- `chat-message-snapshot.test.ts`：同套幽灵尾部用例（同型 (b) 分支）。
- `pending-user-anchor.test.ts`（新）：共享锚定助手合同；两层对同形输入产出一致（head missing 气泡落 canonical 首项之前、先于它的 preserve 行之后）。
- `useSessionManager.queue.test.ts`：并发立即发送 unbump 落在 `agent_start` 快照之后时，最新轮 `agent_end` 重拉仍落地（事件级复现）。

## 修复与验证

- 修复（TASK-0194，重构 120b6af80 + 修复 24579b588）：先把三层锚定管线收编为共享助手 `pending-user-anchor.mergeWithCausalAnchors`（行为保持）；随后 `agent_end` 判活收紧为只认净增长（缺陷 1）、(b) 分支加孪生槽文本校验（缺陷 2）、`prependedCount` 语义还原（缺陷 3）、opener 合并改走共享助手使两层回退一致（缺陷 4）。
- 验证：5 组回归用例在旧实现确认红、修复后全绿；定向 4 文件 64/64，conversation 域 177 文件 965/965，`test:impact` 52 文件 282/282；`check:lint` / `check:types` / mobile lint 绿。
- 剩余风险：深层根因（镜像气泡消费点尾部追加迫使下游猜测、全局序号计数器本身）维持现状，turn 身份判活重构登记为后续；(b) 孪生校验按文本判等，displayText 漂移的镜像退到尾部、经既有对账上限后清理，行为等级与修复前持平。
