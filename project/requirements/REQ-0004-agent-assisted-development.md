---
id: REQ-0004
type: requirement
status: ready
priority: P1
owner: project/agent-workflow
source: user-request and session-history
created: 2026-09-22
updated: 2026-10-01
related_plan: [PLAN-0004]
---
<!-- Copyright The Open Forge contributors. -->

# AI 自主工程交付与人工功能验收

## 用户结果

用户只需用一句话描述目标、现象或期望结果，Agent 就能基于仓库规则、代码事实和历史记录自动生成需求合同、影响范围、测试路径和验证计划。

## 统一入口与职责

执行与验收分工按 [交付合同](../../.agents/skills/open-forge-task-intake/references/delivery.md)，本需求定义结果，不复制操作政策。

## 必须保持

- 不要求用户重复输入 Given/When/Then、文件清单和测试命令。
- 事实由 Agent 查代码、文档、测试和日志获得；只有重大歧义才追问。
- 公共合同、数据兼容、安全边界和不可逆操作必须显式确认。
- 每个任务都能关联 Requirement、Plan、Task、Issue 或 Bug。
- 需求分析、实现、测试、质量门禁和 Release Notes 形成闭环。

## 验收

- `open-forge-task-intake` 被根 `AGENTS.md` 路由；
- `project/CONVENTIONS.md` 规定管理文件的命名、状态和内容；
- 新二开管理文件进入 `project/`，`exprot/` 只作为历史归档；
- 一句话需求能够路由到对应包所有者和最小测试层级。
- Given 功能、Bug、重构、测试、CI/CD 或模型质量反馈，When 进入统一入口，Then Agent 选择对应路线，不一律要求访谈或写新功能。
- Given 工程验证通过但用户未接受功能，When 交付，Then 提供可操作验收包并保持 verifying，不自动宣称验收或发布完成。
- Given 无运行时变化的内部工作，When 已约定检查通过，Then 可按内部标准关闭，不要求用户做无意义的功能点验。
- Given 真实模型、生产数据或发布需要额外权限，When 自动路由命中，Then 不静默扩大授权。
