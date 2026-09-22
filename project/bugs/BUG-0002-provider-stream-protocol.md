---
id: BUG-0002
type: bug
status: confirmed
priority: P1
owner: packages/ai
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\desktop-app\logs\main\2026-09-22.log
created: 2026-09-22
updated: 2026-09-22
---

# DeepSeek Responses 流事件关联错误

## 实际行为

日志出现 `AI_STREAM_PROTOCOL_FAILED`，错误为 `response.content_part.added targeted the wrong output item`。

## 期望行为

Provider 协议错误应快速投影为稳定的 Provider/Team Member terminal failure，不得让父 Coordinator 无限等待。

## 证据与边界

这是原版 `0.5.58` 的真实日志证据；尚未在脱敏 fake stream fixture 中完成独立最小复现。

## 回归测试

覆盖 output item 关联、未知事件、partial stream、取消和 retryable/non-retryable 分类。
