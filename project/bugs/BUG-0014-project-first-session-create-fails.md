---
id: BUG-0014
type: bug
status: done
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
updated: 2026-09-25
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

- 已补充（均先红后绿）：
  - `packages/coding-agent/test/agent-configuration/profile-default-session-create.test.ts`：真实 Runtime 组装下断言「宿主未提供 Profile 默认工具时，首条消息前的会话创建照常成功且默认项降级不回模型工具面」，以及「显式引用宿主不可用的工具仍在创建时以 `AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE` 可恢复拒绝」。
  - `apps/desktop/src/main/conversations/resolve-session-config.test.ts`：Desktop 会话配置折算侧回归（修复前 1 失败/11 通过，修复后全绿）。

## 修复与验证

- 根因：Desktop work 能力 Profile 经 `applyAgentProfileDefaults` 折算出的显式 `overrides.tools` 里带有本宿主未注册的默认项（如 `memory` 需显式 memoryMode、`im_send_attachment` 仅 RPC host-bridge 注册）；准入校验把整份清单当硬性白名单逐名核对，缺名即让 `session.create` 整体失败。按 ADR-0128，Profile 默认是「开箱默认」而非硬边界。
- 修复：Profile 默认工具改为软默认降级——宿主未提供的默认项不再阻塞建会话，也不再出现在模型工具面；用户/模板显式引用的不可用工具仍按原合同以可恢复错误拒绝。涉及 `apps/desktop/src/main/conversations/resolve-session-config.ts`、`packages/coding-agent` 的 `agent-configuration/resource-selection.ts`、`composition/contracts/runtime-session-options.ts`、`composition/session-initialization/transaction.ts`、`profiles/*`、`public-api/profile.ts`。
- 提交：测试 `82ab54849` + 修复 `7075a9aaa`（分支 `worktree-agent-ae8aa7e4727ba35e8`，待集成）。
- 测试：desktop 两文件 26/26、coding-agent 2/2 通过；红测实证：回退修复源码后 desktop 侧 1 失败/11 通过。
- 检查：12 个变更文件 `bun run check:quick` 全绿（含架构与边界守卫）。
- 未运行及原因：未实机验证「选项目 → 新建会话 → 发首条消息」的完整 UI 流程——未获 UI 验证授权；服务层已覆盖同一入口的配置折算与创建合同。
