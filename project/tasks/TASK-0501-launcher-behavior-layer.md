---
id: TASK-0501
type: task
status: in_progress
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: upstream 96e81c3d9 + 2cbcbfa6d + 662dd4c7b + 8be9329e8 + 572ccc1a7 + 141ef08e6 + 63a863f7c + 98d2c49df
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0497, TASK-0498, TASK-0499, TASK-0500]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 297619b
read_paths:
  - apps/desktop/src/renderer/domains/command-menu/
  - apps/desktop/src/shared/sidebar-conversation.ts
  - apps/desktop/src/shared/shortcuts.ts
write_paths:
  - apps/desktop/src/renderer/domains/command-menu/types.ts
  - apps/desktop/src/renderer/domains/command-menu/hooks/useCommandMenuModel.ts
  - apps/desktop/src/renderer/domains/command-menu/hooks/useCommandMenuModel.test.tsx
  - apps/desktop/src/renderer/domains/command-menu/lib/sources.ts
  - apps/desktop/src/renderer/domains/command-menu/lib/sources.test.ts
  - apps/desktop/src/renderer/domains/command-menu/lib/build-groups.ts
  - apps/desktop/src/renderer/domains/command-menu/lib/build-groups.test.ts
  - apps/desktop/src/renderer/domains/command-menu/lib/sidebar-sessions.ts
  - apps/desktop/src/renderer/domains/command-menu/lib/sidebar-sessions.test.ts
  - apps/desktop/src/renderer/domains/command-menu/components/CommandMenu.tsx
  - project/tasks/TASK-0501-launcher-behavior-layer.md
exclusive_paths: []
depends_on: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 启动器行为层：按最近打开排序 + 置顶进行中 + 保留刚完成 + ⌘N（PLAN-0032 P3 切片 a）

## 目标

只搬**行为层**，不动视觉 / 不改默认快捷键 / 不删快捷面板（分别在 P3b / P3c / P3d）：

1. `COMMAND_MENU_GROUP_ORDER` 加 `activeSessions`（置顶）+ `recentSessions`（次位，仅空查询）——按上游 96e81c3d9 / 662dd4c7b。
2. `CommandItem` 加 `status` / `statusLabel` / `priority` / `badgeTone` / `openTeamSession` kind。
3. `useCommandMenuModel` 增量：
   - 进行中：从 side-bar 取 `DesktopTeamSidebarConversation` 拼 `activeSessions` 组；优先级 = waiting > running > unread。
   - 最近打开：维护一个 `recentSessions` 列表（按打开时间倒序、去重、上限），空查询时展示；切换状态不重新检索。
   - 保留刚完成未打开（上游 2cbcbfa6d）。
   - ⌘N：面板打开时直接 `new-session`（上游 8be9329e8）。
4. `sources.ts` / `build-groups.ts` 增量对齐上游。
5. **不改** `shared/shortcuts.ts` 默认键（mod+k 保留，D6 决策走可配置 keybinding）。
6. **不改** 默认「最近打开」持久化——按上游做法只在内存（`useCommandMenuModel`）层维护。

## 不做

- 玻璃质感、底部按钮组、键帽平铺（P3b）。
- 启动器独立设置页（P3c）。
- 删除双击功能键唤出面板（P3d）。
- 不把默认快捷键改成 `mod+t` / `mod+n`——按 PLAN-0032 D6 决策。

## 验收（Given/When/Then）

- `useCommandMenuModel.test.tsx` 覆盖：进行中置顶、最近打开按时间倒序、⌘N 直发 `new-session`、状态切换不重新检索。
- `vitest` 命令面板域内全过；`bun run check` 全过。
- 手动验证（说明性）：桌面启动器空查询时按活跃/最近分组，⌘N 在面板开着时新建会话。

## 上游差异基准

| 文件 | 本地行数 | upstream/dev | 主差距 |
|---|---|---|---|
| `useCommandMenuModel.ts` | 405 | 667 | +262（active/recent/⌘N/缓存） |
| `sources.ts` | 188 | 246 | +58（recentSessions 源） |
| `build-groups.ts` | 116 | 124 | +8（activeSessions 组装） |
| `types.ts` | 56 | 79 | +23（新 kind 与组名） |
| `CommandMenu.tsx` | 45 | 48 | +3（视觉增量在 P3b） |
| `lib/sidebar-sessions.{ts,test.ts}` | — | 69/43 | 上游 662dd4c7b 新增 |
