---
id: BUG-0020
type: bug
status: investigating
priority: P2
owner: apps/desktop; packages/coding-agent
source: user-report
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

# 同一会话中的 Canvas 操作连续被通道占用错误拒绝

## 用户流程

- Given：用户在一个会话中请求 Agent 创建或更新 Canvas 内容。
- When：同一会话连续触发两次 Canvas 操作。
- Then：若操作可安全串行，应排队并依次完成；若不允许并发，应返回明确可恢复状态，不能让后续有效操作无条件失败。

## 实际行为

用户报告两次 Canvas 操作均被拒绝，错误内容为“Canvas 通道在当前会话被占用”。目前没有附带会话事件、请求 ID 或两次调用之间的时间间隔，无法判断是第一项操作仍在运行、锁未释放，还是合法的串行请求被错误拒绝。

## 期望行为

同一会话的 Canvas 调用应遵循明确的并发合同：安全操作可串行完成；冲突写入应保留冲突检测并给出可重试反馈；成功或失败后的通道锁都应及时释放。

## 最小复现

1. 在同一会话中请求 Agent 执行一项 Canvas 创建或更新操作。
2. 第一项完成后立即再次请求 Canvas 操作；若第一项仍运行，记录两次操作的重叠关系。
3. 检查第二项结果、通道占用状态及第一项终态后的恢复行为。

## 影响

用户无法完成连续 Canvas 请求；若拒绝来自未释放的占用状态，当前会话可能持续无法使用 Canvas。

## 根因证据

- 当前源码检索未找到错误文案“Canvas 通道在当前会话被占用”，因此尚未定位负责拒绝的锁/调度实现。
- `packages/coding-agent/src/features/artifacts/artifact-tool.ts:23` 注册 Canvas artifact 工具入口；Desktop 侧 `apps/desktop/src/main/artifacts/canvas-artifact-service.ts:90` 管理 artifact 服务，但现有证据不能证明这两处就是该通道占用错误的发出位置。
- 当前工作区已有未提交的 Canvas 相关实现与测试变更；调查应在保留这些改动的前提下追踪完整调用链，不得覆盖或回滚它们。

根因置信度：低；两次拒绝由用户报告确认，锁所有权、串行语义与释放时机未知。

## 回归测试

- 尚未补充。定位通道实现后覆盖连续调用、并发调用、第一项失败/取消后释放，以及拒绝后重试；按真实用户会话入口验证结果，而不只断言锁函数调用。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
