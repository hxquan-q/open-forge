---
id: REQ-0006
type: requirement
status: ready
priority: P1
owner: packages/agent-team/apps/desktop
source: user-request（对照 cursor agent、Claude Code、codex、pi agent 及 pi 插件生态的多智能体编排完善要求）
created: 2026-09-24
updated: 2026-09-24
related_plan: [PLAN-0008]
---
<!-- Copyright The Open Forge contributors. -->

# Agent Team 编排协作对齐参照系

## 用户问题

Agent Team 编排的可靠性机制（持久任务、恢复、通知、共享上下文）已成熟，但对照 cursor agent、Claude Code、codex、pi agent（含 `vastsa/pi-plugin-session-orchestrator` 插件）四个参照系，编排质量与协作可读性仍有可对齐差距：委派交接不结构化、聚合视图无法分辨哪个成员在做什么、同一档案在不同团队无法角色化命名。用户要求持续完善这些差距。

## 用户结果

- Leader 委派任务时被工具合同与团队纪律约束为自包含交接（目标、必要上下文、交付物与验收、约束），并按「拆分 → 并行委派 → 等待 → 验证 → 整合汇报」的编排回路工作；
- 用户在 Team 全景视图的 Todo 与后台任务页签里能一眼分辨每行归属哪个成员，动作仍路由回正确的 Runtime；
- 用户可以在团队内给成员改一个角色化的 handle，不影响档案本体，也不产生副本。

## 范围

- `packages/agent-team` 的模型可见合同（工具描述、团队协作纪律提示词）；
- `apps/desktop` Renderer 的 Team 聚合视图行级成员标注（含 i18n）；
- `TeamMember` handle 的团队内改名（合同、校验、存储、UI）。

## 不做什么

- 不改变「subagent 不是 Team 成员」的架构契约（ADR-0103/0109）；团队内动态增员、成员能力收窄、共享 cwd 写防护属架构/交互决策，走 Issue 决策门，未裁决前不实施；
- 不新增第二套编排运行时，不合并现有工具族为单一 SessionTask 式工具。

## Given / When / Then

- Given 一个已就绪的 Team 会话，When leader 需要把工作分给多个成员，Then 它收到的工具描述与团队纪律要求每次委派携带自包含 objective，并行委派后统一等待，向用户汇报前先对照 objective 验证成员产出。
- Given 一个多成员 Team 会话且成员正在执行，When 用户打开活动面板的 Todo 或后台任务页签，Then 每一行可见其归属成员（单人工作空间不显示标注），行上的停止/清理动作仍作用于正确的 Runtime。
- Given 一个引用共享档案的团队成员，When 用户在团队编辑中修改该成员的 handle，Then 团队内名册、@ 提及与成员提示词在下一个 revision 生效，档案本体与其余团队不受影响。

## 必须保持

- Conversation 是唯一消息与会话存储格式；编排事实仍是协调 Conversation 的 custom entry；
- revision 乐观锁、名册/任务书指纹驱动的成员提示词重建、既有并发与恢复测试全绿；
- 聚合视图按工作空间 `runtimeIds` 汇总与按行路由的既有合同（ADR-0111）；
- i18n 铁律与 Desktop 设计规范。

## 验收标准

- 三个 Task（结构化交接与编排纪律、聚合视图成员标注、handle 团队内改名）实现并各有合同/组件级测试；
- 受影响的既有测试（agent-team 包 14 套件、`team-session-concurrency`、team renderer 模型）保持全绿；
- 发布说明候选文案按 ISSUE-0007 门禁记录在 Task 交付记录。

## 风险与失效条件

- 提示词合同变更会使既有会话的 roster 指纹一次性翻动（预期的一次性重建，非缺陷）；
- handle 改名触碰 `UpdateTeamInput` 公共合同，需要校验唯一性与历史消息兼容（旧 handle 文本仅作历史文本保留）；
- 若后续裁决（能力收窄、动态增员）落地，本 REQ 的「不做什么」边界随之修订。
