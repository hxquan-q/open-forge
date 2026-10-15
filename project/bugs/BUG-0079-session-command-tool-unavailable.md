---
id: BUG-0079
type: bug
status: verifying
priority: P1
owner: coding-agent
source: user-screenshot-2026-10-06
related_requirement: []
related_plan: []
related_tasks: [TASK-0215]
related_issues: []
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 会话已加载本机能力却报告终端工具不可用

## 用户流程与实际行为

Given：Desktop 截图显示完整访问、文档/代码会话。When：用户要求检查局域网设备并连接 SSH。Then（实际）：Agent 加载本机能力说明并搜索工具后仍表示没有 ping/ssh 执行工具，改让用户手动操作；截图不足以证明具体工具调用内容。

## 期望行为

宿主已注册且配置允许的命令工具应出现在模型请求并可调用；确实禁用时如实说明，不绕过权限或自动扩大能力。

## 环境与最小复现

用户平台/版本未证实（回复提到 Windows）；源码基线 c2931b2e3，调查环境 Windows。先用隔离会话和假 Provider 构造命令工具可见性回归，不访问用户实例或真实设备。

## 影响

P1：本机诊断任务被错误退化为手动指导。截图中的密码不保存、不用于测试。

## 根因证据

1. 默认注册/Session 投影丢失：预测正常 Provider frame 无 shell/bash。7 场景基线全部包含正确平台工具，排除默认装配路径。
2. 截图会话显式配置或插件过滤：预测只有该会话缺少命令 schema；未访问真实状态，尚不能排除。
3. 模型把 MCP 空检索或 Skill 说明当作全量能力清单：截图符合该模式；当前 Prompt 缺少明确的命令入口/发现边界指引已通过失败合同测试证实，但真实模型因果关系仍待验收。

本次修正第 3 项的 Prompt 防护，置信度：软件指引与 frame 一致性高，具体 GLM 输出改善待测。没有修复/改变工具注册代码，不把正常通过的可见性基线描述为失败复现。

## 回归测试与修复验证

旧 Prompt 的新合同 3 失败/3 通过；修改后相关提示词 38/38、Desktop 13/13（含实际本机输出回到 Provider 与显式禁用）。impact 与完整 check 通过，Desktop 全量 4909 项通过；跨包批次 CLI 首次 3 项启动超时，完整失败文件复跑 14/14。详细命令与剩余风险见 [TASK-0215](../tasks/TASK-0215-session-command-tool-visibility.md)。真实模型、截图会话配置和 SSH 连接未测试。
