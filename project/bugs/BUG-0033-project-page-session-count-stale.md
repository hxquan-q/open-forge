---
id: BUG-0033
type: bug
status: done
priority: P3
owner: apps/desktop
source: agent-browser 现场测试（重载落在项目页后显示「0 个会话」）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 项目详情页会话计数依赖侧边栏展开状态，重载后误显「0 个会话」

## 用户流程

- Given：项目（如 `E:\demo`）下已有 4 条会话，当前停留在该项目详情页；
- When：刷新窗口（或应用重启后恢复到此路由）；
- Then：项目页应显示真实会话数。

## 实际行为

- 重载后项目页显示「0 个会话」，与侧边栏展开该项目组后的真实列表不符；
- 手动展开侧边栏项目组后，计数才回填为正确值——计数完全依赖侧边栏
  懒扫描的副作用。

## 期望行为

- 项目详情页自身挂载时即触发本项目 cwd 的会话扫描，计数与磁盘一致。

## 环境与失败证据

- 应用版本：dev main；OS：Windows。
- 实测：`#/project/E%3A%5C%5Cdemo` 重载后页面显示「0 个会话」，
  侧边栏 demo 组折叠；点击展开 demo 组后同一页面立即变为「4 个会话」。
- `expandedProjectsAtom` 为内存态 atom，不持久化；每次重载全部项目
  组回到折叠态，仅自动展开「对话」默认组。

## 最小复现

1. 在有会话的项目详情页停留；
2. 重载窗口（或重启应用恢复到该路由）；
3. 项目页显示「0 个会话」；展开侧边栏该项目组后恢复正确计数。

## 影响

- 项目首页的会话计数是错误信息，用户会误判会话丢失；
- 仅重载/直达路由时触发，常规「点侧边栏组进入」路径会掩盖本问题。

## 根因

`useProjectDetail` 的 `sessionCount` 只读 `sessionsMapAtom.get(cwd)`；
`sessionsMap` 仅由侧边栏面板在「项目组展开」时经 `loadSessions(cwd)`
填充（`useProjects.refreshProjects` 首屏只扫默认组与已展开组——刻意
的懒加载设计）。项目详情页自己没有触发本 cwd 的扫描，于是计数停在
初始空值。

## 回归测试

- `useProjectDetailPageModel` 挂载时对当前 cwd 调用 `loadSessions`
  （经 `window.vetta.session.listSessions` 的真实调用桩），回填后
  `sessionCount` 与磁盘会话一致。

## 修复与验证

- 修复：`useProjectDetailPageModel` 挂载时对 `decodedCwd` 调用
  `useProjectActions().loadSessions`（幂等、经 `sessionLoadPromises`
  去重，与侧边栏展开路径共用同一扫描入口）。
- 检查：新增回归测试 + `bun run check`。
- 实机验证：重载停留在项目页 → 不展开侧边栏组，计数直接显示真实值。
