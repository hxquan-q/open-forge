---
id: BUG-0167
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 / code-mode-audit-2026-10-30 §四 F08
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0428]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 只登记在开发册的项目：历史补拉与新建候选未闭环

## 用户流程

- Given：普通 projects 只有 `/ordinary`，开发册（config.allstarProjects）另有 `/code-only`，该目录存在 coding 会话历史且 sessionsMap 未加载，When：进入 Allstar 版块首页，Then：`/code-only` 应补拉会话历史、卡片计数正确，且可从选择器选中它新建开发会话。

## 实际行为

- `/code-only` 已登记卡片出现，但会话请求列表为空（未调用该目录 listSessions），卡片显示 `sessions:[] / totalSessions:0`。
- 页底新建会话的项目候选只有普通 projects（`['/ordinary']`），不含 `/code-only`。

## 环境与失败证据

- 基线 `98f7de9e6`，独立诊断探针复现（TASK-0425 §四 F08，`code-mode-behavior.probe.log`）。
- 根因：`useAllstarDevHomePageModel` 的 `projectOptions` 取普通 `projects`（代码注释自认「暂用现有项目清单兜底」），补拉 effect 只遍历 `projectOptions`；开发册只喂卡片分组。

## 最小复现

1. 普通册登记 `/ordinary`；「打开已有项目」把 `/code-only` 归入开发册（内有 coding 会话）；冷启动进版块首页。

## 影响

「打开已有目录归入开发册」可登记但不可用：冷启动历史显空、无法从选择器对该目录发起新开发会话——版块核心闭环断裂（P1）。

## 根因证据

`useAllstarDevHomePageModel.ts`（projectOptions/补拉 effect）与探针日志一致；TASK-0425 §11.1 复核确认。

## 回归测试

- 开发册项目成为候选与补拉事实源：book-only 项目被 listSessions、进入 `model.projects`、可被选中；普通清单不再作为版块候选来源。
- 卡片聚合路径保持：未归册但有已加载 coding 会话的项目仍出卡片。

## 修复与验证

- 修复：`useAllstarDevHomePageModel` 的 `projectOptions` 改由版块册 `allstarProjects` 派生（册内登记名优先、缺省回落目录名），补拉 effect 随候选自然改为册驱动；移除普通 `projectsAtom` 依赖。空态/空卡片文案拆分（`empty.hint` 引导登记、新增 `empty.cardHint`），zh/en 同步；`AllstarDevHomePageView` 空卡片改用新键。
- 测试：新语义红 3（册项目补拉、候选来自册、选中兜底随册/空册为空）→ 绿；hook 7 例 + View 3 例全过；相邻 allstar 引用面（sidebar workspace-view、nav-route-prefetch、agent-mode-entry-points、weknora-nav）22+4 例全绿。
- 检查：`check:quick` 通过。完整 check 留批次收尾。
- 未运行及原因：实机冷启动走查属人工验收（登记→重启→卡片计数→选择器），待用户；其余无。
