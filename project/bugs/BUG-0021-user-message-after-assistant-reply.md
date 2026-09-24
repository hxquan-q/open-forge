---
id: BUG-0021
type: bug
status: investigating
priority: P1
owner: apps/desktop
source: user-report; screenshot; source inspection
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 用户消息可能在 Assistant 回复之后显示

## 用户流程

- Given：用户在会话中发送一条消息，Assistant 开始并完成回复。
- When：会话流式事件、规范历史与乐观用户气泡完成同步。
- Then：时间线上用户消息必须排在由该消息触发的 Assistant 回复之前；不能在回复后再像新消息一样出现。

## 实际行为

用户报告对话已完成，但自己的消息显示在回复后面，视觉上像是刚刚新发。截图中，Assistant 已完成一段报告答复，而用户消息“我需要你给我整理出一份报告”出现在该答复下方。

## 期望行为

用户消息与其触发的 Assistant Turn 按因果顺序呈现；历史重载、队列消费或乐观消息对账不得将该用户消息追加到已包含对应 Assistant 回复的历史末尾。

## 最小复现

1. 在现有会话发送一条需要较长处理的请求。
2. 等待 Assistant 完成回复。
3. 观察时间线中该请求是否仍显示在 Assistant 回复之后；如复现，记录消息 ID、Turn ID、消息时间戳和 `agent_end` 前后的历史加载结果。

## 影响

对话因果顺序变得不可信，用户难以判断回复对应哪条请求，也可能误以为消息刚刚重新发送。

## 根因证据

- 截图直接显示完成的 Assistant 报告内容位于用户请求“我需要你给我整理出一份报告”之前。
- `apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.ts:96` 在规范历史末尾追加尚未对账的乐观用户消息；如果本次读取的历史已包含该消息之后的 Assistant 回复、但暂时缺少 canonical user entry，就可能形成“回复在前、用户消息在后”的顺序。
- `apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.test.ts:89` 起覆盖未匹配乐观消息追加到历史末尾及有限清理，但未覆盖“历史已含对应 Assistant 回复、canonical user entry 暂时缺失”的输入顺序。
- 上述对账路径是候选根因；截图没有消息 ID/持久化历史，尚不能确认是否由此导致，也可能来自队列镜像或事件/历史合并时序。

根因置信度：中低；错序行为由截图确认，具体产生层待追踪。

## 回归测试

- 尚未补充。复现定位后覆盖“用户消息待对账 + 历史已含对应 Assistant Turn”的竞态，并从会话可见时间线断言用户请求始终先于对应回复；同时保持正常慢落盘时乐观气泡不丢失、成功对账时不重复。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
