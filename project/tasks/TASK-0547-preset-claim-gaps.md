---
id: TASK-0547
type: task
status: verifying
priority: P3
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0546]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 12a5f408e
read_paths: []
write_paths:
  - apps/desktop/src/main/agent-teams/plugin-agent-preset-reconcile.ts
  - apps/desktop/src/main/agent-teams/plugin-agent-preset-reconcile.test.ts
  - project/tasks/
  - project/research/RESEARCH-0052-upstream-0.6.20-0.6.31-commit-triage.md
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 预设认领缺口收口：成员解析排除自建 + 认领可信度分级与去重（上游 69edb1958 余量）

## 合同

- 来源与目标：上游 `69edb1958`（基于预设人设自建的智能体不被插件预设认领）。台账 RESEARCH-0052 判断「主体已修」但有两个缺口。落点核对结论（2026-11-27）：
  - 主体已在本仓：`matchesAgentPreset` 对未盖章档案只按 legacy blueprint id 认领（`plugin-agent-preset-reconcile.ts:225-238`），用户基于现行 blueprint 自建的档案不会被改写；分叉测试两个（`leaves a user-created profile alone...`、`keeps the provider-stamped instance and a lookalike clone distinct`）已覆盖基本场景。
  - 缺口 1（`findLibraryProfile`，`plugin-agent-preset-reconcile.ts:369-371`）：插件团队成员按 blueprintId 解析档案时**不排除用户自建档案**——若自建档案在数组序里排在预设档案前面，团队 binding 会指到用户自建那份，能力/人设不受提供方维护。上游修复：`agent.source !== undefined` 过滤。
  - 缺口 2（认领可信度与去重）：上游 `findPresetAgent` 按三级可信度（规范 id → 提供方盖章+blueprint → 未盖章 legacy）加 taken 去重 + claims/claimed 预分配，本仓是扁平 findIndex：a) 无优先级——若数组序里 legacy 档案排在规范 id 前面，legacy 被认领而规范档案无人认领（形状不同但同 handle 让位逻辑会撞）；b) 无去重——两份预设（或 legacy id 重叠）可认领同一档案，后认领的重铺会覆盖先认领的。claims/claimed 预分配还修正 handle 让位集：未被重铺的档案（含同 blueprint 自建）手里的号原样占着，重铺号不会撞。
  - 本仓分叉（保留不动）：`matchesAgentPreset`/`isPresetOwned` 的未盖章只认 legacy 语义与上游第三级一致；mode/lifecycle 落档字段（上游无）；presetAgentProfile/presetTeam 的分叉字段。
- 输入 → 输出：上游缺口修复语义 → 团队成员永远解析到提供方档案；认领按可信度分级且一份档案最多被一份预设认领。
- 做 / 不做：`findLibraryProfile` 加 source 过滤；`findPresetAgent` 按上游三级可信度+taken 重写；`applyPluginPresets` 加 claims/claimed 预分配与 handle 集口径修正；移植上游两个测试（`leaves agents the user built on a preset's persona alone`、`does not hand a preset a handle that an unclaimed legacy profile still holds`）。不做：`matchesAgentPreset` 语义回改（本仓分叉版与上游等价——上游三级候选展开后与 matchesAgentPreset 判定集相同，仅多了顺序与去重）；mode/lifecycle 分叉不动。
- Given / When / Then：
  - 用户自建档案（无戳、现行 blueprint、独特 handle）排在预设档案前 → reconcile 后自建原样保留（名字/handle/无戳）、预设档案照落、插件团队成员 binding 指向提供方档案、parseAgentTeamDocument 不抛。
  - 规范 id 档案被用户改号 + 未盖章 legacy 档案占着清单短名 → 规范档案被认领（拿号 designer-2 让位）、legacy 原样不动、配置可解析。
  - 两份预设 blueprint/legacy 重叠 → 同一份档案不被重复认领（后一份铺新档案）。
- 保留：`matchesAgentPreset`/`isPresetOwned` 语义、mode/lifecycle 分叉、既有分叉测试全部保留；团队预设 reconcile（findPresetTeam）不动。
- 验证：移植的两个测试 + 全量 plugin-agent-preset-reconcile.test.ts；`bun run test:impact`；`bun run check`。
- 人工验收：不适用（纯 reconcile 逻辑，测试锁定）。

## 交付

- 实施（2026-11-27）：
  - `findLibraryProfile` 加 `agent.source !== undefined` 过滤，插件团队成员永远解析到提供方铺下的档案，用户基于同一人设自建的档案不再被卷进插件团队。
  - `findPresetAgent` 按上游三级可信度重写：规范 id → 同提供方盖戳+blueprint（含历史 id）→ 未盖戳 legacy blueprint，逐级带 `taken` 去重；`applyPluginPresets` 先跑 claims/claimed 预分配循环定认领，再按「本轮实际被重铺的档案」算 handle 让位集，主循环直接用预分配结果。`isPresetOwned`/`matchesAgentPreset` 随重写删除（上游三级展开后判定集与其等价）。
  - 移植上游两个测试：自建档案排在预设前原样保留且团队 binding 指提供方档案（`parseAgentTeamDocument` 不抛）；规范档案被改号 + legacy 占短名时规范认领得 `designer-2`、legacy 不动。fork 既有测试全部保留。
  - 与上游最终态 diff 仅剩刻意分叉：一致性头、mode/lifecycle 落档字段。
- 验证：`run-vitest plugin-agent-preset-reconcile.test.ts` 16/16；`test:impact` desktop 39 文件 399 用例全绿；`bun run check` lint/types/guards 全绿；一致性头审计 missing=0。
- 复查：独立 verifier complete 无 P1/P2。变异测试实证：HEAD 旧逻辑下两个移植测试均如期失败（binding 指向自建档案 / legacy 被改写盖章），M1（仅去 source 过滤）与 M2（仅反转优先级）各被一个测试精确捕获，无交叉污染。P3 观察：重叠预设去重路径上游亦无测试，继承性缺口。
- 交接：release fragment `preset-claim-gaps.md` 已组装；RESEARCH-0052 台账 `69edb1958` 条目已标记实施。
