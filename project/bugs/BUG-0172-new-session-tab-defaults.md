---
id: BUG-0172
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 / code-mode-audit-2026-10-30 §四 F10（用户决策：新建用默认页签）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0433]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 新建 code 会话不恢复四页签默认与固定顺序

## 用户流程

- Given：同项目上次会话隐藏了 terminal、排序改为 browser/file/git/terminal，When：新建 code 会话，Then：新会话应恢复四页签默认显隐与固定顺序；创建后的手动调整保留。

## 实际行为

页签仍是 `['browser','file','git']`（缺终端、顺序非默认）——新会话复用 cwd 级 hidden/order 的 localStorage 记录，布局初始化只写侧栏/右栏开合与宽度，不处理页签偏好。

## 环境与失败证据

- 基线 `98f7de9e6`；独立探针复现（TASK-0425 §四 F10）。
- 根因：`hiddenActivityTabsAtom`/`activityTabOrderAtom` 按 cwd 持久化（`activity-atoms.ts:257-272`），初始化路径（`useCodingSessionLayout`、`useActivityPanelModel`）从不重置；`resolve-activity-tabs` 忠实消费偏好。

## 最小复现

1. code 会话隐藏 terminal 并拖序 → 新建同项目 code 会话 → 观察页签。

## 影响

「新会话初始化」语义在页签维度缺一块；与「项目级偏好跨会话保留」策略冲突（用户已裁决：新建初始化优先）。

## 根因证据

报告 §11.1 复核一致。

## 回归测试

- 意图初始化（含开发档新会话页边沿）时清该项目 hidden/order 记录，resolve 回落四页签默认序；
- 初始化后的手动隐藏/排序在同语境内不再被重置。

## 修复与验证

- 修复：`activity-atoms.ts` 新增 `resetActivityTabPreferencesFor(store, cwd)`（删该 cwd 的 hidden/order 记录，走既有 localStorage 写穿 setter）；`useCodingSessionLayout` 的 `applyInitialLayout` 带 cwd——意图路径用 intent.cwd、new-session 边沿用路由 cwd，team 语境无 cwd 不动。
- 测试：布局套件红 2（意图初始化清偏好 + 新会话页边沿清偏好）→ 绿 9/9；相邻 resolve-activity-tabs/terminal-tab 10 例全绿。
- 检查：`check:quick` 通过（首轮 Biome 导入排序经 `bun run fix` 修正 1 文件；ratchet new=0）。完整 check 留批次收尾。
- 未运行及原因：实机走查（隐藏页签→新建→默认→再隐藏→保留）待用户人工验收。
