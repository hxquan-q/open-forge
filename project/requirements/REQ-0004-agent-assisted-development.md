---
id: REQ-0004
type: requirement
status: ready
priority: P1
owner: project/agent-workflow
source: user-request and session-history
created: 2026-09-22
updated: 2026-09-23
related_plan: [PLAN-0004]
---
<!-- Copyright The Open Forge contributors. -->

# Agent 辅助二开工作流

## 用户结果

用户只需用一句话描述目标、现象或期望结果，Agent 就能基于仓库规则、代码事实和历史记录自动生成需求合同、影响范围、测试路径和验证计划。

## 必须保持

- 不要求用户重复输入 Given/When/Then、文件清单和测试命令。
- 事实由 Agent 查代码、文档、测试和日志获得；只有重大歧义才追问。
- 公共合同、数据兼容、安全边界和不可逆操作必须显式确认。
- 每个任务都能关联 Requirement、Plan、Task、Issue 或 Bug。
- 需求分析、实现、测试、质量门禁和 Release Notes 形成闭环。

## 验收

- `vetta-task-intake` 被根 `AGENTS.md` 路由；
- `project/CONVENTIONS.md` 规定管理文件的命名、状态和内容；
- 新二开管理文件进入 `project/`，`exprot/` 只作为历史归档；
- 一句话需求能够路由到对应包所有者和最小测试层级。
