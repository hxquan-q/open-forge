---
id: ISSUE-0013
type: issue
status: draft
priority: P2
owner: packages/agent-team/apps/desktop
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008（pi spawn 动态增员与 Claude Code 成员可用子代理对照；ADR-0103 正交契约）
created: 2026-09-24
updated: 2026-09-24
related_tasks: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 团队内动态增员与成员子代理边界

## 背景与已知事实

- 现行契约（ADR-0103/0109 + `operating-context.ts` 纪律）：Team 成员是用户配置的持久名册；`team_delegate_task` 只能委派给既有成员；成员工具面被 `filterTeamMemberActiveToolNames` 剥除全部 7 个 subagent 工具——**团队内任何成员（含 leader）都无法按需生成临时帮手**。
- 参照系相反：pi 的 `spawn(task, title?, model?)` 由编排会话按需创建真实 worker（有上限：每创建者 4 / 每插件 16，且 worker 不可再生 worker）；Claude Code 的队友/子代理可继续派生代理；Cursor 的 lead 自由 spawn subagent。
- 环形等待已有 wait 图 `reaches()` 拒绝；恢复预算、通知、驻留 LRU 都以「成员 = 持久 runtime 会话」为前提。
- 子代理体系（`runtime-subagents` + 7 工具）在普通会话可用，与 Team 的隔离是刻意的正交设计，不是遗漏。

## 未决问题

1. 团队内是否允许 leader（或任意成员）创建**临时成员**（用后即走、不进名册、不进共享名册提示词）？
2. 若允许，临时成员复用 subagent 体系还是 member runtime 的轻量变体？谁付恢复预算、谁收完成通知、驻留 LRU 如何计数？
3. 是否只对 leader 放开 subagent 工具（保持成员不可派生），作为最小步？
4. 动态增员的权限边界：临时成员继承团队 executionMode 与能力勾选，还是发起成员当时的工具面子集？

## 候选方案及取舍

- **A 维持现状**：固定名册 + 需要帮手时用户加成员或另开普通会话。契约最简单，但大任务并行度受名册尺寸限制，与参照系体验差距真实存在。
- **B 最小步：仅 leader 获得 subagent 工具**：leader 私有临时帮手不进名册、不占团队恢复预算、结果只归 leader（subagent 体系语义现成）。改动集中在工具面过滤与提示词纪律两条；成员仍不可派生，环形风险不变。
- **C 完整动态成员**：`team_spawn_member` 工具 + 临时成员生命周期（上限、预算、通知、名册可见性「临时」标注）。体验对齐 pi，但触碰名册/指纹/恢复/驻留全部核心机制，是 ADR-0103 级架构变更。

## 推荐方案

B 作为过渡（风险小、立刻补齐 leader 的 fan-out 能力），C 待 B 实际使用反馈后再评估是否值得整体动名册契约；A 仅在用户明确偏好固定名册时保留。

## 决策触发条件

用户在「团队是否需要按需帮手」上表态，或实际使用中观察到 leader 因无法派生临时帮手而串行阻塞的案例。

## 后续可能拆出

- Task（若 B）：成员工具面过滤放开 leader + 提示词纪律修订 + 并发测试；
- Plan（若 C）：临时成员合同（ADR 必写）→ 生命周期 → 名册标注 → 恢复/驻留适配。
