---
id: ISSUE-0012
type: issue
status: draft
priority: P2
owner: packages/agent-team/apps/desktop
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008（Claude Code 子代理 tools 约束对照；ADR-0109 L52 明确留白）
created: 2026-09-24
updated: 2026-09-24
related_tasks: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 团队内成员能力收窄的编辑交互

## 背景与已知事实

- 成员能力完全穿透本体 `AgentProfile.abilities`：想给团队里的成员**减**能力，目前唯一出路是 `copy` 分叉（永久脱钩、影子档案），或改本体（影响所有团队与智能体库）。
- ADR-0109 已把「能力的团队内收窄」列为留白，并给出前置条件：需要一套「只允许收窄、不允许扩张」的编辑语义——本体为「继承全部」（`selectionMode: "all"`）时如何展示收窄、超出本体的选项如何禁用——属于独立的产品与交互问题；交互定案前**不先写 schema 字段**，避免没有写入路径的死契约。
- Claude Code 子代理用 `tools` 声明收窄工具面；pi 的 worker 继承所属会话权限不可扩大。两者都证明「收窄不扩张」是正确方向。

## 未决问题

1. 收窄的交互载体：团队编辑抽屉里按成员勾选「在团队内禁用 X」，还是像任务书一样提供一段结构化「能力例外」？
2. `selectionMode: "all"`（继承全部，含未来安装）与收窄如何合成：UI 展示全集 + 已禁用集合，运行时解析为 `all − excluded`？
3. blueprint 的 `pinnedPlugins`（强制并集）是否允许被团队内收窄压过？（倾向：不允许，pinned 语义优先，UI 对 pinned 项禁用并说明。）
4. 名册快照 `effectiveAbilities` 需要把团队内收窄事实纳入，队友与 leader 才能看到该成员在**本团队**的真实工具面。

## 候选方案及取舍

- **A（推荐）assignment 增加 `excludedAbilities` 负向增量**：与任务书同层（ADR-0109 增量哲学），不碰本体；校验只能是本体有效选择集的子集，超出即拒绝；`all` 模式表示为「全集 − 排除」。代价：编辑 UI 要解决 all 模式的展示与禁用态，工作量集中在交互。
- **B 团队级能力模板**：以团队为粒度统一收窄。粒度太粗，同团队不同角色恰是需要差异的场景。
- **C 只引导用户用 copy**：零实现，但延续影子档案污染，与 ADR-0109 的初衷相悖。

## 推荐方案

A：`TeamMemberAssignment.excludedAbilities`（仅收窄、仅本体有效项、pinned 不可收窄），编辑入口放团队设置抽屉的成员卡，与任务书同屏。

## 决策触发条件

用户确认交互方案（尤其 `all` 模式展示与 pinned 禁用态）后即可拆 Task：contracts/validation → 名册 effectiveAbilities 投影 → 编辑 UI → 运行时工具面解析。

## 后续可能拆出

- Task：assignment 能力例外合同与校验（含 schema 兼容：可选字段，旧文档缺省=无收窄）；
- Task：团队编辑抽屉成员级能力收窄 UI + i18n + 组件测试。
