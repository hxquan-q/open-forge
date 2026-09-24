# Plans

Plan 记录“如何交付 Requirement”，不取代 `docs/adr/`，也不把所有实现细节塞进一个长文档。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

## 当前计划索引

| ID | 名称 | 状态 | 依据 |
|---|---|---|---|
| `PLAN-0001` | work/coding Runtime 产品演进 | ready | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md)、[`exprot/runtime-mapping.md`](../../exprot/runtime-mapping.md) |
| `PLAN-0002` | 性能与可靠性基线 | in_progress | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md) 阶段 0.5 |
| `PLAN-0003` | Open Forge 品牌化施工 | draft | [`exprot/development-paradigm.md`](../../exprot/development-paradigm.md)、[`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) |
| `PLAN-0004` | Agent 辅助二开工作流 | verifying | [`.devin/skills/vetta-task-intake/SKILL.md`](../../.devin/skills/vetta-task-intake/SKILL.md)、`AGENTS.md` |

## Plan 必须说明

- 目标 Requirement；
- 当前事实和约束；
- 候选方案及代价；
- 阶段和依赖；
- 不做什么；
- 验证、回滚和升级信号；
- 需要写 ADR 的不可逆决策。

当前详细计划保留在 `exprot/` 作为研究来源；新的主动计划应直接写入本目录。
