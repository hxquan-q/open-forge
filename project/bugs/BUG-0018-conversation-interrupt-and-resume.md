---
id: BUG-0018
type: bug
status: investigating
priority: P1
owner: apps/desktop
source: user-report; screenshot
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0001]
depends_on: []
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 对话中断及中断后继续不流畅

## 用户流程

- Given：用户已发送消息，Assistant 正在生成回复。
- When：用户尝试中断当前回复，然后继续同一会话。
- Then：当前 Turn 应在有限时间内进入明确的 interrupted/aborted 终态；后续消息应能正常发送并基于已保存的对话继续，不应长时间卡在处理中或丢失上下文。

## 实际行为

用户报告无法中断对话，且中断后继续对话不流畅。两张截图内容相同：Assistant 状态显示“处理中…”，耗时约 1 分 20 秒，输入框右侧显示停止图标；截图未呈现点击停止后的状态，因此无法确认点击无效、取消延迟或恢复流程异常中的哪一种。

## 期望行为

停止操作应可靠终止当前 Turn 并呈现终态；用户可在同一会话立即继续发送，历史记录、Turn 状态和输入内容保持一致。

## 最小复现

1. 在任一会话发送一条会触发较长回复的消息。
2. 回复进行中点击输入区的停止控件。
3. 等待当前 Turn 结束，随后发送追问并检查助手是否基于同一会话历史继续。
4. 记录停止点击到终态时间、按钮状态、是否仍有 Provider/工具活动以及追问结果。

## 影响

用户失去对长回复的控制，无法顺畅修正方向或继续工作；如果中断未收敛，可能阻塞会话后续发送。

## 根因证据

- 截图证实会话持续显示“处理中”约 1 分 20 秒且界面提供停止控件，但不能证明停止请求是否实际发出或是否到达 Runtime。
- `apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts:227` 将 aborted stop reason 映射为终态；`apps/desktop/src/renderer/domains/conversation/services/chat-service.ts:550` 将中断历史映射为取消状态，说明 Renderer 已有中断终态投影。
- `BUG-0001` 跟踪过 Runtime/Team 长任务取消与无界收尾并已完成；本次报告仍需先确认是否命中相同路径，不能直接假定旧问题回归。
- 缺少停止操作后的事件日志、主进程/Runtime trace 和稳定复现，具体责任边界尚未确定。

根因置信度：低；长时间处理中状态有截图佐证，停止与续聊故障由用户报告，底层中断是否失败待验证。

## 回归测试

- 尚未补充。定位路径后，从会话输入与停止控件的真实用户入口覆盖“生成 → 停止 → aborted 终态 → 同一会话继续发送”；对忽略 AbortSignal 的外部 Provider/工具使用可控 Fake 或既有边界合同，确保取消与资源收尾有界。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
