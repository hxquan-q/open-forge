---
id: BUG-0001
type: bug
status: investigating
priority: P0
owner: runtime-core/desktop/ai
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\desktop-app\logs\main\2026-09-22.log
created: 2026-09-22
updated: 2026-09-22
---

# Session 长任务取消/压缩后的终态与性能问题

## 当前证据

- 原版 `0.5.58` 日志出现 DeepSeek `AI_STREAM_PROTOCOL_FAILED`。
- Agent Team 成员 Turn 出现约 248 秒耗时。
- Context Compaction 出现约 34–43 秒耗时和失败。
- App Monitor 的 compaction 汇总与主日志不一致。

这些是本地证据和用户报告，不等同于已经完成的独立最小复现。

## 期望行为

取消、失败、压缩失败和 Session 切换必须在有限时间内产生明确终态，不得永久等待或只重置 Renderer loading 状态。

## 回归测试方向

- Provider/Tool 忽略 AbortSignal；
- Compaction single-flight 和取消；
- Team Member 失败向父 Coordinator 收尾；
- Session 切换不永久等待；
- 重启后恢复 interrupted Turn；
- 性能快照与主流程事件一致。

## 根因状态

`AI_STREAM_PROTOCOL_FAILED` 已有明确 Provider 证据；永久卡死的完整根因仍需在 Runtime/Team/Compaction 链路中用可控 Fake 重现。
