---
id: PLAN-0004
type: plan
status: verifying
priority: P1
requirement: REQ-0004
owner: project/agent-workflow
source: .agents/skills/open-forge-task-intake/SKILL.md, AGENTS.md, session-history
created: 2026-09-22
updated: 2026-10-01
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent 辅助二开工作流

## 已完成

- 建立 `open-forge-task-intake` 自动需求编译 Skill；
- 根 `AGENTS.md` 增加需求入口和 `project/` 读取规则；
- 建立 `project/` 管理目录、模板和现有 Requirement/Plan/Bug；
- 保留 `exprot/` 为历史研究归档；
- 接入 Colding Code Notes 的按需读取、决策原因和证据锚定原则；
- 接入工程控制论的分类、主导因素、最小工具和可验证反馈闭环。

## 统一入口重构（TASK-0136）

依据 REQ-0004 与 RESEARCH-0017，采用现有入口加按需参考；职责与验收遵循交付合同，不叠加框架或替换 Bun/Vitest。

- 阶段一：intake 收敛为分类、授权、合同与执行路由；保留 Claude 共享链接；Devin 镜像已按用户授权由 TASK-0141 退役，权威正文仅在 .agents。
- 阶段二：testing 补齐纵向 TDD、行为保持重构、模型质量与 CI 合同；交付与反馈从入口拆出。
- 阶段三：根规则、Task 模板、质量门禁统一接线，增加镜像/断链回归测试与路由验收清单。
- 并发：共享入口和门禁有依赖，串行执行。
- 回滚：按 Task 原子提交回退；不迁移历史 Task 状态、不改运行时公共 API。
- 验证：机械回归只证明文件合同；真实新会话自动路由与人工接受仍需实际试用，不将静态绿灯冒充模型评测。
- 不做：改全局技能、改模型、降低质量门禁、触发部署或收费验证。无生产架构变更，不新增 ADR；治理选择记录于本 Plan。

## 待验证

- 后续真实一句话开发任务是否能正确创建/更新管理条目；
- Requirement → Plan → Task → Verification 的交叉链接是否在长期迭代中保持；
- Agent 是否避免全量加载 `exprot/` 和无关技能；
- 管理条目是否能在上游同步和产品迭代中保持单一事实源。

## 失败条件

如果 Project 文档与源码、测试、Schema 或 ADR 冲突，以当前实现事实为准，并在对应条目记录冲突，而不是用文档覆盖事实。
