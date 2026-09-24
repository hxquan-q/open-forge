---
id: BUG-0014
type: bug
status: investigating
priority: P1
owner: apps/desktop
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

# 选择项目后首次对话创建会话失败

## 用户流程

- Given：用户选择一个项目作为工作目录，尚未在该项目下创建过会话。
- When：用户从该项目的新会话入口发送第一条消息。
- Then：应用应创建会话并继续发送，不应因 Agent 配置资源校验失败而中断。

## 实际行为

用户报告首次发送时创建会话失败，Renderer 日志包含：

```text
[useSessionOpener] session.create failed
Error invoking remote method 'vetta:session:create'
AgentConfigurationError: AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE
```

## 期望行为

所选项目及当前 Agent 配置有效时，应成功创建会话并开始处理首条消息；若配置确实引用不可用资源，应显示可理解且可恢复的错误，不能把资源解析失败伪装成无法创建会话。

## 最小复现

1. 选择一个项目作为当前工作目录。
2. 从该项目的新会话页发送第一条消息。
3. 观察 `vetta:session:create` 的结果及主进程错误上下文。

## 影响

首次使用该项目对话的用户无法开始会话；当前报告未确认是否只影响某类 Agent Profile、能力选择或特定项目配置。

## 根因证据

- Renderer 在 `apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts:404` 调用 `window.vetta.session.create`，并在 `:431` 记录失败；此处是错误传播和 UI 回退位置，不足以证明根因。
- `apps/desktop/src/main/agent-teams/agent-ability-overrides.ts:8` 将 Agent Profile 的能力选择折算为配置覆盖；文件注释记录了显式插件资源清单可能触发同类 `AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE` 校验错误。
- 目前没有捕获到本次失败对应的 Agent/Profile、项目资源清单或主进程完整错误上下文，不能确认该能力覆盖路径就是本次根因。

根因置信度：低；错误类别确认，触发配置待定位。

## 回归测试

- 尚未补充。定位后从“选项目 → 新建会话 → 发送第一条消息”的入口增加回归覆盖，并验证不可用资源时的可恢复错误呈现。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
