---
id: RESEARCH-0029
type: research
status: done
priority: P2
owner: coordinator
source: user-request; upstream openvetta/open-vetta 7c7589c02（ADR-0146/0147 及其实现提交）对照
created: 2026-10-18
updated: 2026-10-18
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 上游消息列表重构（ADR-0146/0147）同步评估

## 问题与范围

用户要求评估上游 0.5.60–0.5.64 窗口内落地的桌面端消息列表架构重构是否值得、以及以何种方式同步到本仓。范围限非手机（REQ-0008），只评估不实施。

## 事实来源

- 上游 `docs/adr/0146-desktop-conversation-feed-single-source.md`（含两批实施记录）、`0147-composable-conversation-view.md`（已实施）。
- 实现提交：ADR-0146 系列（09-28～09-30，含 59f227b25 等）与 ADR-0147 系列（10-02，0b00d284f…15fe01d0a 共 9 个 refactor/docs 提交）。
- 本仓对照基线 `d217984c72`（2026-09-22，声明头门禁快照点）。
- 量化：`apps/desktop/src/renderer/domains/conversation` 目录，上游窗口内改动 **237 个文件 / 51 个提交**；本仓同期改动同目录 **84 个提交**；**79 个文件双方都改过**（comm 交集实测）。

## 当前结论

**不建议整体同步；按价值拆小件吸收，重构本体作为独立 PLAN 在 BUG-0127 批次完全收口后再评估是否立项。**

依据：

1. **本仓已有其中两块的等价物，且已合入**：
   - 事件合同治理（删死事件类型 + 生产者登记 + 墓碑守卫）：本仓 f39c3430e（TASK-0204）已实现同型机制，`bun run check` 里 `session event tombstones` 与 `conversation-message-architecture` 两道守卫在跑——上游第二批的治理成果本仓已等价持有。
   - P2 的 `SessionFacade.attach`（回合重放 + 快照）：TASK-0205/0206 已同步（保留本仓 4096 有界回放，未引入上游无界缓冲）。
2. **正确性收益本仓已用自研路径兑现**：上游 0.5.61 的切会话拆段/漏段/乐观残留/滚动记忆等修复，本仓 PLAN-0014 稳定性批次（TASK-0185/0189/0191/0193 等）以自己的方式修完并实测闭合；剩余两个 deferred 候选（自动压缩回复内步骤、重进会话排队消息）已是登记在案的定向任务（RESEARCH-0025 候选 6/7）。
3. **冲突面大且不对称**：79 个双改文件集中在 MessageList/SessionMessageList/ChatView/输入栏/团队投影——本仓 BUG-0127 性能批（时间线投影索引化 d2b66f20a、持久基座 4bb034f15、聚合守卫 abde52806、成员历史记忆化 b48785be9、性能护栏 288ee2ca9）恰好叠在上游 0147 组合层重排与 0146 P7（Team 收敛）的落点。cherry-pick 不可行，只能按 ADR 文本重新实现再搬测试。
4. **上游自己也未做完**：P2 尾部（running 状态按 `conversation.turn.*` 界定、`message.appended` 带文档坐标）、P6 滚动瘦身、P7 Team/Viewer 收敛上游明确 deferred。P7 恰是本仓冲突最重的区域——即使将来同步，上游也还没给出可搬的 P7 形态。

## 建议的吸收顺序（按价值/冲突比）

1. **先做已登记的定向项**（无架构耦合）：RESEARCH-0025 候选 6（0.5.64 自动压缩改回复内步骤，上游 a98f55365+2d4fb93d9+64c3ff927）、候选 7（重进会话排队消息，上游 61072cbb3，先对照本仓是否同病）。
2. **低耦合修复随日常同步**：0.5.61 的散件（如「重复回合结束信号不改写已完成回复」）若本仓同病可单独搬，参照 TASK-0263/0264 先例。
3. **重构本体**：若 BUG-0127 批次全部收口后仍决定吸收，按 PLAN 立项（参照 PLAN-0014 形态：护栏先行、分片可回滚），以 ADR-0146/0147 为规格、上游实现为参照重写，不追提交历史；预计是多任务周级工程（上游两批实现 + 0147 九个提交的量，叠加 79 文件冲突适配）。
4. **反向机会**：本仓团队投影的性能层（索引化/持久基座/护栏）是上游没有的；P7 将来上游动手时，可考虑把本仓实现回馈上游（Upstreamable），减少双向分叉。

## 被否决的方案

- **整体 merge / 大范围 cherry-pick 上游重构**：79 个双改文件的冲突必然手工重解，且会掀翻已实测验收的 BUG-0127 性能层，违反 REQ-0008 择优原则。
- **放着不动**：0.5.61/62 的正确性修复本仓虽已等价，但两个 deferred 候选与后续上游修复会持续累积分叉成本；按上面顺序小步吸收可以把分叉压在可控范围。

## 代码/测试/指标锚点

- 上游 feed 单源：`apps/desktop/src/renderer/domains/conversation/conversation-feed.ts`（upstream tip 存在，本仓无）。
- 上游控制器拆分后：`useSessionStateEvents` / `usePromptPrediction` / `session-event-routes.ts`（本仓无）。
- 本仓独有性能层：团队时间线投影（`apps/desktop/src/renderer` team 投影文件群，TASK-0291–0294）、性能护栏 `288ee2ca9`。
- 守卫对照：本仓 `scripts/quality/check-session-event-tombstones.mjs` ↔ 上游同名校卫（等价）；本仓 conversation-message-architecture 守卫禁直写 chatMessagesAtom（上游第二批同型）。

## 失效条件与置信度

- 上游 P7/滚动瘦身落地后，第 3 条的成本估算需重评（可能变贵也可能给出可搬形态）。
- 本仓 BUG-0127 批次若实测回退，第 3 条的前提变化。
- 置信度高：冲突面与等价物均为逐文件/逐提交实测，非推测。

## 下一步触发信号

- 用户决定启动重构吸收时，先建 PLAN 与护栏任务（P0 等价物：本仓已有场景回放型测试可扩展）。
- 上游发布包含 P7 的版本时，重读本评估第 3/4 条。
