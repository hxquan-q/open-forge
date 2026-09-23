<!-- Copyright The Open Forge contributors. -->
# Plans

Plan 记录“如何交付 Requirement”，不取代 `docs/adr/`，也不把所有实现细节塞进一个长文档。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

## 当前计划索引

| ID | 名称 | 状态 | 依据 |
|---|---|---|---|
| `PLAN-0001` | work/coding Runtime 产品演进 | in_progress | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md)、[`exprot/runtime-mapping.md`](../../exprot/runtime-mapping.md) |
| `PLAN-0002` | 性能与可靠性基线 | in_progress | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md) 阶段 0.5 |
| `PLAN-0003` | Open Forge 品牌化施工 | in_progress | [`exprot/development-paradigm.md`](../../exprot/development-paradigm.md)、[`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) |
| `PLAN-0004` | Agent 辅助二开工作流 | verifying | [`.devin/skills/vetta-task-intake/SKILL.md`](../../.devin/skills/vetta-task-intake/SKILL.md)、`AGENTS.md` |
| `PLAN-0005` | Open Forge 独立发布与二开治理 | in_progress | [`REQ-0005`](../requirements/REQ-0005-openforge-independent-release-and-compliance.md)、用户确认的独立 SemVer 决策 |
| `PLAN-0006` | Canvas / Browser / Terminal 右栏集成 | ready | [`RESEARCH-0005`](../research/RESEARCH-0005-canvas-browser-terminal-support.md)、用户确认的决策索引 |

## 当前执行焦点

- `PLAN-0002`：P0 治理已完成；下一项选定 `TASK-0033`（P1 / ready，尚未开工）。
- `PLAN-0001`：`TASK-0027`、`TASK-0028` ready；`TASK-0025`、`TASK-0026` 仍依赖 `TASK-0028`，待其完成后再评估。三者共享 WorkspaceMode 写路径，当前必须串行。
- `PLAN-0003`：`TASK-0043` 是当前 ready 的首项；C/D 和 F 后续项按任务依赖推进。
- `PLAN-0004`：处于 verifying，待后续真实任务验证闭环。
- `PLAN-0005`：独立 SemVer 已确认；首发号、Apache §4(b) 修改文件声明和 workspace package release scope 由 ISSUE-0007/0008/0009 阻断；TASK-0052、TASK-0056、TASK-0057 in progress。
- `PLAN-0006`：决策已冻结；`TASK-0059`（合同与接缝）先行串行，之后 Canvas lane（0060→0061）与 Browser lane（0062→0063）条件并行，`TASK-0064` 独立。

## Plan 必须说明

- 目标 Requirement；
- 当前事实和约束；
- 候选方案及代价；
- 阶段和依赖；
- 不做什么；
- 验证、回滚和升级信号；
- 需要写 ADR 的不可逆决策。

当前详细计划保留在 `exprot/` 作为研究来源；新的主动计划应直接写入本目录。
