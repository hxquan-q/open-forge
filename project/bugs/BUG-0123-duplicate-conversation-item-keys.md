---
id: BUG-0123
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的 dev 日志（desktop-app/logs/2026-10-16，render 侧）
related_requirement: []
related_plan: [PLAN-0020]
related_tasks: [TASK-0353]
related_issues: []
related_bugs: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 消息列表出现重复渲染 key，React 反复告警且无法定位来源

## 用户流程

- Given：用户在一个长会话中正常浏览（含向上翻页加载更早历史）。
- When：消息列表渲染。
- Then：期望列表项身份唯一、无 React 重复 key 告警；若确有重复，诊断信息应直接指明是哪两个来源、哪一层。

## 实际行为

- render 日志中出现 252 条 React「Encountered two children with the same key」告警，只涉及**两个** key：`event-1215`（172 次）与 `event-1229`（80 次），跨 14:23:01–14:39:33 稳定重现——是列表里稳定存在的两对重复项，不是每帧竞态。
- 告警是 React 的通用开发态提示，不含 item 身份（kind / id / entryId / renderKey / 来源层），无法据此定位是哪条合并路径产生了重复。

## 期望行为

- 列表项渲染键唯一。
- 出现重复时给出结构化诊断：重复键、出现次数、每个重复项的身份字段与数组下标、所属会话，能直接区分「头部翻页重叠」与「live/canonical 双留」。

## 环境与失败证据

- Open Forge 0.1.3 dev 实例（Windows 11），`desktop-app/logs/2026-10-16` render 日志。
- 252 条告警，key 分布：`event-1215` 172、`event-1229` 80，时间跨度 14:23:01–14:39:33。

## 最小复现

1. 打开一个足够长的会话（消息条数超过一页窗口）。
2. 持续向上滚动触发更早历史翻页（`loadOlderTranscriptPage`）。
3. 观察 render 日志中的重复 key 告警。

## 影响

重复 key 会使 React 在同一位置复用/错配列表项，表现为消息错位、状态串台与重挂；告警数量随重渲染累积（本例 252 条）淹没日志，且当前无任何定位手段。

## 根因证据

身份规则（已确认）：`conversationItemRenderKey = renderKey ?? entryId ?? id`（`renderer/shared/conversation/item-key.ts:11-17`）；`event-N` 是文档/事件身份（`packages/runtime-core/src/conversation/document.ts:221`、`runtime-node/.../conversation-file-codec.ts:168,305`），且编解码器对同一文件内的重复隐式 id 有硬校验（`codec.ts:167-171` 抛 `duplicate document entry`）。→ 可排除「持久层写了重复事件」，重复必然来自**多个来源合并进同一个列表数组**。

已定位的合并不设防点（对照）：

- `renderer/domains/conversation/services/transcript-window.ts:269-272` `prependTranscriptPage = [...page.history, ...windowEntries]`，**零去重**，正确性完全依赖注释里「游标来自该窗口且排他」的假设；分页游标与窗口边界一旦重叠即产生同 entryId 的两份。
- 对照：尾部合并 `mergeTranscriptHeadPage`（同文件 288-325）按内容签名比对重叠，是有防守的一侧。
- `reconcileWindowedProjection`（同文件 392-486）用 `consumed` + 对象身份去重 live 消费，但 `adoptLive`（:439）原样复用 live 对象——live 项自带 `entryId=event-1215` 且另有一条同 key canonical 时是否双留，需隔离测试显式覆盖。

**待调查**：产生本次 252 条告警的唯一路径未隔离。日志没有列表内容快照，无法区分「头部翻页重叠」与「live/canonical 双留」。因此本轮只补结构化诊断（零行为变更），不先改去重逻辑。

## 回归测试

- 纯函数表驱动：`findDuplicateConversationKeys` 覆盖「无重复 / 两同 key / 多组重复 / 同一键三项」并断言身份字段与下标。
- 组件层：`MessageListView` 喂含重复 key 的列表时发出结构化诊断，无重复时不发。

## 修复与验证

- 修复：本轮只加诊断（TASK-0280）——`findDuplicateConversationKeys` + `reportDuplicateConversationKeys`，`MessageListView` 在列表接缝运行。去重逻辑待诊断结果落地后另立切片（唯一路径未隔离）。
- 测试：`conversation-key-diagnostics.test.ts` 7 例、`MessageListView.test.tsx` 2 例（有重复发出 / 唯一不发）——包内 2 文件 22 例全绿。
- 检查：`bun run --cwd apps/desktop typecheck:incremental`、`bun run test:impact` 137 例全绿。
- 未运行及原因：`verify:ui:*` 未获授权；真实复现交人工验收。
- 剩余风险：重复本身未消除，仅可定位；一旦拿到现场诊断即可按「头部翻页重叠」或「live/canonical 双留」定向修复。

## 2026-10-22 TASK-0353 实现与隔离回归

重叠durable历史只入列一次，无ID合法重复marker保留；await后读取当前backlog，同路径reset淘汰陈旧请求。成功提交推进尾部序号，reset失败也清loading；诊断序列化白名单身份避免[object Object]。首次分页4红→59绿，诊断合并4文件84绿；复审新增3红→controller24绿。

定向与独立复审通过；候选完整check通过，组合测试最终结果见PLAN-0020。相关Task为TASK-0353，本地main原子提交绑定；仍待真实用户流程验收，未发布。
