---
id: TASK-0002
type: task
status: ready
priority: P0
owner: packages/ai
requirement: REQ-0002
plan: PLAN-0002
source_issue: ISSUE-0003
created: 2026-09-22
updated: 2026-09-22
depends_on: []
---

# Provider 流协议回归 Fixture

## 目标

为 DeepSeek/OpenAI Responses 风格流建立错误事件关联、未知 output item、部分流、取消和重试 fixture。

## 验收

- `response.content_part.added targeted the wrong output item` 能稳定投影为 Provider failure；
- Team Member 不会等待已经失败的 Provider Turn；
- retryable/non-retryable 语义保持；
- 不运行真实 Provider。

## 测试

Provider stream 合同测试 + Agent Team terminal state 测试。
