---
id: PLAN-0004
type: plan
status: verifying
priority: P1
requirement: REQ-0004
owner: project/agent-workflow
source: .devin/skills/vetta-task-intake/SKILL.md, AGENTS.md, session-history
created: 2026-09-22
updated: 2026-09-22
depends_on: []
---

# Agent 辅助二开工作流

## 已完成

- 建立 `vetta-task-intake` 自动需求编译 Skill；
- 根 `AGENTS.md` 增加需求入口和 `project/` 读取规则；
- 建立 `project/` 管理目录、模板和现有 Requirement/Plan/Bug；
- 保留 `exprot/` 为历史研究归档；
- 接入 Colding Code Notes 的按需读取、决策原因和证据锚定原则；
- 接入工程控制论的分类、主导因素、最小工具和可验证反馈闭环。

## 待验证

- 后续真实一句话开发任务是否能正确创建/更新管理条目；
- Requirement → Plan → Task → Verification 的交叉链接是否在长期迭代中保持；
- Agent 是否避免全量加载 `exprot/` 和无关技能；
- 管理条目是否能在上游同步和产品迭代中保持单一事实源。

## 失败条件

如果 Project 文档与源码、测试、Schema 或 ADR 冲突，以当前实现事实为准，并在对应条目记录冲突，而不是用文档覆盖事实。
