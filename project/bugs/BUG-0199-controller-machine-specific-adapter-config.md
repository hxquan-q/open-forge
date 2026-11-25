---
id: BUG-0199
type: bug
status: investigating
priority: P2
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-report-2026-11-25
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: []
related_issues: []
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 默认启用的控制器适配器绑定特定开发机路径

## 用户流程

- Given：另一台机器检出仓库并使用自主研发控制器。
- When：控制器按仓库默认配置选择启用的 Qwen 实施或评审适配器。
- Then：不应依赖某位开发者机器的可执行文件、检出位置和外部配置路径；若部署未配置应明确失败，不能伪称隔离已就绪。

## 实际行为与证据

`project/agents.json` 中两个 Qwen 适配器 `enabled: true`，`command` 和 `doctorCommand` 均写入特定开发机的 Bun 绝对路径、另一个盘符下的适配器脚本及仓库外配置文件。`scripts/agents/tasks.mjs` 加载该配置；`runner.mjs` 按选择及隔离证明检查后执行配置的 argv，`doctor.mjs` 检查可执行文件。当前发现属于自主研发控制器路径，**不等于普通 Desktop 启动依赖这些路径**；本次未启动控制器或访问真实模型。

适配器选择合同要求启用项具有绝对可执行路径与隔离配置；隔离证明绑定配置摘要。直接把命令改为 PATH 中的 `bun` 会破坏当前约束，简单禁用适配器也会改变现有机器的自主调度行为。仓库内尚未确认存在可直接使用的外部配置覆盖入口，不能声称只要新增本机配置即可工作。

## 用户决定与后续

2026-11-25 用户明确要求：**记录问题，本次先不修改该配置或其运行行为**。未来需先确定仓库默认配置与受信任机器本地配置的边界、隔离证明重签和迁移方式，再另行建立实施任务，覆盖干净检出、无配置时失败关闭、可信配置生效及签名绑定回归；未经用户新授权不禁用现有适配器，不连接真实 Provider。

## 验证

仅静态核查配置和调用链；未运行测试、控制器、真实 Provider 或远程操作。
