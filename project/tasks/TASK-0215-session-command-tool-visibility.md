---
id: TASK-0215
type: task
status: in_progress
priority: P1
owner: coding-agent
source: user-screenshot-2026-10-06
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0079]
execution: serial
branch: main
worktree: C:/Users/xquan/Desktop/open-forge
base_commit: c2931b2e3
read_paths: [packages/coding-agent, packages/runtime-node, packages/runtime-desktop, apps/desktop/src/main/agent-runtime]
write_paths: [apps/desktop/src/main/agent-runtime/model-call-frame-contract.test.ts, packages/coding-agent, project/tasks, project/bugs, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 修复会话终端工具可见性

## 目标与范围

来源：[BUG-0079](../bugs/BUG-0079-session-command-tool-unavailable.md)。定位截图中已加载本机能力却称不能执行命令的路径，修复可复现的软件合同缺陷；不承诺真实模型输出，不连接真实主机，不记录截图凭据。不重构无关架构、不改变权限与 work Profile 的默认收紧，不触碰既有 bun.lock 修改。分类：Upstreamable。

## 并发评估

必须串行：工具装配、配置选择和会话执行路径耦合，由当前 Agent 在 main 主工作区完成，无并行 Worker/新 Worktree。前置依赖无；独占本次相关实现与回归测试，Project 索引串行维护；集成顺序为回归→修复→完整门禁→原子提交。

## 输入、输出与 Given / When / Then

- 输入：用户截图和源码/测试；输出：修复、回归测试和验证证据。
- Given：宿主已注册平台命令工具，coding 会话允许该工具且使用完整访问。
- When：新建/恢复会话，配置允许的工具，并发起任务及后续模型调用。
- Then：实际模型请求含正确平台命令工具，执行结果回到下一轮；显式禁用、项目拒绝与审批边界仍有效。

## 实施取舍与不变量

优先沿既有配置/工具所有权接线直接修复，不新增重复工具源；只有证据证明职责冲突才重构。保持错误、取消、usage、stop、工具代际与角色语义。

## 测试与验证

先建立旧实现失败的定向回归；用真实内部装配 + 假 Provider/命令外部边界覆盖用户流程。执行仓库 Node runner、test:impact，必要时 test:changed，完成后 bun run check。禁止真实 Provider、用户状态、SSH/局域网与 verify:ui 测试。

## 验收分层与功能验收包

- 工程验证：待执行；技术评审：待自审；集成：pending。
- 人工功能验收：待验收；发布：未授权。
- 入口：Desktop 文档/代码会话，终端工具已启用；发送无害的本机命令任务，预期工具执行并返回输出，而不是误报工具缺失。显式禁用时仍不允许执行。
- 限制：软件合同与真实模型质量分别验证，不承诺自动 SSH 认证成功。

## 交付记录

待补充实际根因、命令、结果和剩余风险。
