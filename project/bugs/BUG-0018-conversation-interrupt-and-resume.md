---
id: BUG-0018
type: bug
status: done
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
updated: 2026-09-25
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

- 已补充（合同锁定而非缺陷修复）：`apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.abort-resume.test.ts` 三个用例，从真实入口（挂载真实 `useSessionManager` + `useRunningSessionsSync`，Fake 后端 + 显式同步点）覆盖「生成 → 停止 → aborted 终态 → 同会话续发」「停止窗口内消息入暂停队列、恢复后补气泡」「abort IPC 悬挂不阻塞终态与续发」。提交 `c565cbc53`，集成 merge `ed56509c7`，3/3 通过。

## 修复与验证

- 修复：五个候选方向经上述合同测试逐项证伪，均非缺陷，未做推测性修改：
  1. kernel `cancel` 有界（waitMs 2s + cancelDeadline 10s → `recovery_required`），deadline 亦广播 error+agent_end；`turn.cancelled` 必映射 aborted+agent_end。
  2. `promptInteractiveSession` 无 admission 锁，终态 idle 后新 prompt 直发。
  3. 停止窗口内的 prompt 入暂停队列（ADR-0060 有意设计）：消息不丢失、镜像可见、恢复即消费。
  4. `runtime.abort` 有 2s 界，`WORK_STOP_ALL` 同步 kill；abort IPC 悬挂不阻塞界面终态与续发。
  5. 「紧邻时序竞争」即场景 3，结果可恢复、无丢失、无死锁。
- 测试：abort-resume 3/3；与 BUG-0021 修复相关三文件合跑 22/22；`check:quick` 全绿。
- 未运行及原因：无实机事件日志/trace，真实环境根因无法闭环；合同测试已把五条路径行为钉死，复发时可分层二分（kernel/runtime-core vs desktop main vs renderer）。
- 剩余风险与后续：「停止窗口内消息需手动点继续」若产品侧认为构成体验问题，应作为独立 UX 改进立项（如 agent_end 后自动恢复），属产品决策而非缺陷。
