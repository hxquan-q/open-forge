<!-- Copyright The Open Forge contributors. -->
# Plans

Plan 记录“如何交付 Requirement”，不取代 `docs/adr/`，也不把所有实现细节塞进一个长文档。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

## 当前计划索引

| ID | 名称 | 状态 | 依据 |
|---|---|---|---|
| `PLAN-0019` | 自主研发全流程实施与验收 | in_progress | [REQ-0019](../requirements/REQ-0019-autonomous-development.md)、完整实施合同 |
| `PLAN-0018` | 设计插件统一路线图 v2（去品牌 × 安全 × 设计能力 × 可借鉴代码） | draft | [REQ-0005](../requirements/REQ-0005-openforge-independent-release-and-compliance.md)、[RESEARCH-0031](../research/RESEARCH-0031-design-reference-projects-license-audit.md) |
| `PLAN-0017` | MCP 工具暴露粒度（direct / deferred）最小设计 | draft | [REQ-0010](../requirements/REQ-0010-mcp-tool-exposure-granularity.md)、[RESEARCH-0024](../research/RESEARCH-0024-pi-workflow-post-design-review.md) |
| `PLAN-0016` | 版本管理与发版重构 | in_progress | [RESEARCH-0023](../research/RESEARCH-0023-version-management-and-release-design.md) |
| `PLAN-0015` | Harness 高价值机制隔离吸收 | in_progress | [RESEARCH-0021](../research/RESEARCH-0021-pi-deepseek-harness-absorption.md) |
| `PLAN-0001` | work/coding Runtime 产品演进 | in_progress | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md)、[`exprot/runtime-mapping.md`](../../exprot/runtime-mapping.md) |
| `PLAN-0002` | 性能与可靠性基线 | in_progress | [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md) 阶段 0.5 |
| `PLAN-0003` | Open Forge 品牌化施工 | in_progress | [`exprot/development-paradigm.md`](../../exprot/development-paradigm.md)、[`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) |
| `PLAN-0004` | Agent 辅助二开工作流 | verifying | [`.agents/skills/open-forge-task-intake/SKILL.md`](../../.agents/skills/open-forge-task-intake/SKILL.md)、`AGENTS.md` |
| `PLAN-0005` | Open Forge 独立发布与二开治理 | in_progress | [`REQ-0005`](../requirements/REQ-0005-openforge-independent-release-and-compliance.md)、用户确认的独立 SemVer 决策 |
| `PLAN-0006` | Canvas / Browser / Terminal 右栏集成 | ready | [`RESEARCH-0005`](../research/RESEARCH-0005-canvas-browser-terminal-support.md)、用户确认的决策索引 |
| `PLAN-0007` | Agent Workspace Phase 2（Browser 调试闭环 + Canvas 富交互） | draft | PLAN-0006 推迟项圈选、用户确认的 Phase 2 决策；v1 演示/首发反馈可重排 |
| `PLAN-0008` | Agent Team 编排协作对齐 | done | [`REQ-0006`](../requirements/REQ-0006-agent-team-orchestration-alignment.md)、[`RESEARCH-0008`](../research/RESEARCH-0008-multi-agent-orchestration-comparison.md) |
| `PLAN-0009` | Canvas 体验演进（原生 Data Grid、高带宽组件、直接编辑与试跑） | ready | [`PLAN-0006`](PLAN-0006-canvas-browser-activity-tabs.md)、已确认的 P0~P2 演进案 |
| `PLAN-0010` | 桌面端内存与发布体积优化（VS Code 借鉴） | in_progress | [`RESEARCH-0013`](../research/RESEARCH-0013-vscode-footprint-optimization.md) |
| `PLAN-0011` | 仓库架构治理升级（Avernet 借鉴） | done | [`RESEARCH-0012`](../research/RESEARCH-0012-avernet-workdaddy-references.md) |
| `PLAN-0012` | 无人值守会话与自动化产品化（WorkDaddy 借鉴） | in_progress | [`RESEARCH-0012`](../research/RESEARCH-0012-avernet-workdaddy-references.md) |
| `PLAN-0013` | 团队会话编排效率：消除主控轮询空转与协作摩擦 | draft | [`ISSUE-0025`/`0026`/`0027`](../issues/)、开发团队实测会话量化基线（38 waits / 44.9min / $0.376）、上游 `887017560` 与 Pi/Codex/Claude Code 参照 |
| `PLAN-0014` | 非手机上游更新选择性适配 | in_progress | [计划与保护合同](PLAN-0014-selective-upstream-nonmobile.md)、首批集成 TASK-0171、后续审查 RESEARCH-0019 |

## 当前执行焦点

Task 状态以各 Task frontmatter 为准；精选执行焦点见 [`tasks/README.md`](../tasks/README.md)，依赖与集成顺序以对应 Plan/Task 合同为准。不要从历史路线叙述推断当前 Task 状态。

## Plan 必须说明

- 目标 Requirement；
- 当前事实和约束；
- 候选方案及代价；
- 阶段和依赖；
- 不做什么；
- 验证、回滚和升级信号；
- 需要写 ADR 的不可逆决策。

当前详细计划保留在 `exprot/` 作为研究来源；新的主动计划应直接写入本目录。
