---
id: TASK-0080
type: task
status: in_progress
priority: P1
owner: apps/desktop renderer/conversation + workspace-mode
requirement: REQ-0004
plan: PLAN-0001
source: code review 修复批（4 个 finder 独立命中；修复 TASK-0077 引入的徽章派生缺陷）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarView.tsx, apps/desktop/src/main/conversations/resolve-session-config.ts]
write_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.test.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarView.test.tsx]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx]
depends_on: [TASK-0077]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# session-axes 徽章派生单点化

## 根因（finder 交叉确认）

1. **复制粘贴缺陷**（`DefaultInputBarConnector.tsx:106-107`）：`axis` 与 `profile` 用逐字相同的三元（OR 两个轴），两标签永不相异；`(agentMode=work, capabilityProfile=coding)` 会话误报 coding/coding，恰好掩蔽双轴徽章本要暴露的分歧。
2. **与 main 侧折叠口径相反**：`DesktopAgentMode` 是裸 string；renderer 折叠「非 coding 即 work」，main（`resolve-session-config.ts:135-139`）对 profile 是「非 work 即 coding」——第三值（手编 defaultAgentMode='architect' 类）两侧结论相反，徽章谎报工具面。
3. **双重插值 + 单次替换**（`session-axes.ts:26`）：`t(key, values)` 已由 i18next 插值，helper 的手动 `.replace("{{...}}")` 是第二遍 no-op，且 `String.replace` 只替换首个占位符——重复占位符的翻译会渲染字面花括号。

## 做

1. `session-axes.ts` 新增 `resolveSessionAxes(agentMode, capabilityProfile)`：`axis` 只从 `agentMode` 派生、`profile` 只从 `capabilityProfile` 派生；未知值的折叠口径与 main 侧逐一对齐（profile 未知→coding；axis 未知→work 侧对齐后写入注释），成为唯一派生点。
2. `DefaultInputBarConnector.tsx` 删除两处内联三元，改调 helper。
3. `formatSessionAxesBadge` 去掉手动 replace（i18next 是唯一插值层），或改接 raw key 由 helper 统一处理——选一种，不留双通道。
4. 补 `InputBarView` 组件测试（AGENTS.md §9：条件渲染必须有组件/hook 测试）：有/无 axes、`(work, coding)` 分歧场景两标签不同、未知第三值的折叠。

## Given / When / Then

- Given `(work, coding)` 会话，When 输入栏徽章渲染，Then 显示 work 解释 · coding 工具（两标签可分）。
- Given 手编第三值 agentMode 的旧会话，When 徽章渲染，Then profile 标签与 main 实际 resolve 的工具面一致。
- Given 普通会话（无 axes），Then 无徽章（现状保持）。

## 测试与验证

- `session-axes.test.ts` 表驱动（各轴独立、未知值、与 main 口径对齐）；`InputBarView.test.tsx` 组件级。
- 命令：`cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run <file>`；tsc 定向。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】输入栏的模式徽章如实区分解释模式与工具面，不再把两者混报为同一档。
