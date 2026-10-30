---
id: TASK-0433
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0172（TASK-0425 报告 F10，用户决策新建用默认页签）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0432]
related_issues: []
related_bugs: [BUG-0172]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 186c7624d
read_paths:
  - apps/desktop/src/renderer/shared/store/activity-atoms.ts
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.ts
write_paths:
  - apps/desktop/src/renderer/shared/store/activity-atoms.ts
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.ts
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.test.ts
  - project/tasks/TASK-0433-new-session-tab-defaults.md
  - project/tasks/README.md
  - project/bugs/BUG-0172-new-session-tab-defaults.md
  - project/bugs/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0159-new-session-tab-defaults.md
exclusive_paths: []
depends_on: [TASK-0432]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 新建 code 会话恢复四页签默认（BUG-0172）

## 目标

创建意图初始化（及开发档新会话页边沿初始化）时清除该项目的页签隐藏/排序偏好，回落四页签默认显隐与固定顺序；初始化后的手动调整保留。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0028 第 8 片，依赖 TASK-0432 意图机制，主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：与 TASK-0432 同文件追加（已串行完成）。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0028 第 8 片。

### 做

1. `activity-atoms.ts` 新增 `resetActivityTabPreferencesFor(store, cwd)`：删该 cwd 的 hidden/order 记录（写穿 localStorage 的既有 setter）。
2. `useCodingSessionLayout`：意图路径按 intent.cwd、new-session 边沿按路由 cwd 调用重置；team 语境无 cwd 不动。
3. 红测试：偏好预置→初始化后清除；初始化后手动偏好→同语境更新不被重置。

### 不做

- 不改插件页签 attach 记录（attachedPluginTabsAtom）与选中页签记忆（activityPanelTabByProjectAtom）；
- 不做「未新建的普通打开」重置。

## Given / When / Then

- Given /proj/a 有 hidden=['terminal'] 与自定义 order，When 创建意图初始化，Then 两记录被清除、resolve 回四页签默认序。
- Given 初始化后用户重新隐藏 terminal，When 同语境会话对象更新，Then 偏好保留。

## 必须保持

- localStorage 写穿语义与解析容错；
- resolve-activity-tabs 管道与插件 attach 行为；
- TASK-0432 的意图/边沿双路语义。

## 测试与验证

- 定向：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/root-layout/useCodingSessionLayout.test.ts`（apps/desktop 内）。
- 相邻：resolve-activity-tabs.test.ts、terminal-tab.test.tsx。
- `check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户实机（隐藏页签→新建→默认四页签→再隐藏→更新会话保留）。发布：未授权。

## 交付记录

- 实际修改：`activity-atoms.ts`（resetActivityTabPreferencesFor + 导入整理）；`useCodingSessionLayout.ts`（contextCwd 贯通，applyInitialLayout(cwd) 清页签偏好）；测试红 2→绿；BUG-0172/本 Task/索引与 v0.1.4 fragment。
- 实际运行：布局 9/9；相邻 resolve-activity-tabs + terminal-tab 10 例；`check:quick` 通过。
- 未运行及原因：完整 check 与 impact 留批次收尾；实机走查待用户。
- Worktree：未拆出（主检出串行）。
- 剩余风险：团队语境无 cwd 不清偏好（团队页签无新建语义，维持现状）。
