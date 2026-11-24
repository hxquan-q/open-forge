---
id: TASK-0502
type: task
status: in_progress
priority: P2
owner: packages/theme-ui + packages/ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream d6f9906c4 + 后续 command-menu 玻璃化 commit
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0497, TASK-0498, TASK-0499, TASK-0500, TASK-0501]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 0c6ef58
read_paths:
  - packages/theme-ui/src/overlays/
  - packages/ui/src/utils.ts
  - packages/ui/src/button-group.tsx
write_paths:
  - packages/ui/src/utils.ts
  - packages/theme-ui/src/overlays/SplashPanel.tsx
  - packages/theme-ui/src/overlays/SplashParts.tsx
  - packages/theme-ui/src/overlays/CommandMenuView.tsx
  - packages/theme-ui/src/overlays/CommandMenuRow.tsx
  - packages/theme-ui/src/overlays/index.ts
  - apps/desktop/src/renderer/domains/command-menu/components/CommandMenuView.test.tsx
  - apps/desktop/src/shared/i18n/locales/en/common.json
  - apps/desktop/src/shared/i18n/locales/zh/common.json
  - scripts/quality/baselines/design-exceptions.json
  - scripts/quality/baselines/test-assertion-baseline.json
  - apps/desktop/DESIGN.md
  - project/tasks/TASK-0502-launcher-glass-shell.md
exclusive_paths: []
depends_on: [TASK-0501]
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 启动器玻璃外壳：SplashPanel/SplashParts + 玻璃面板 + 浮动按钮组（PLAN-0032 P3 切片 b）

## 目标

把 P3a 行为层跑通的命令面板套进上游的玻璃视觉外壳，不改行为、不改快捷键语义：

1. `packages/ui/src/utils.ts` 补 `OVERLAY_BACKDROP_CLASS` / `PANEL_SHADOW_CLASS` / `GLASS_PANEL_CLASS` / `FLOATING_SURFACE_CLASS` / `FROSTED_SURFACE_CLASS`（上游 dialog.tsx/utils.ts 的公共玻璃语言）。
2. 新增 `SplashPanel.tsx`（portal + 遮罩 + 玻璃面板 + ThemeSurface 槽位 + header/children/footer 插槽）与 `SplashParts.tsx`（`SplashInputHeader`/`SplashTitleHeader`/`SplashFooter`/`SplashNotice`/`SplashStep`）。
3. 新增 `command-menu.css`（一次性 sheen 高光 + `overlay-backdrop` 标记相关已由 styles.css 管）。
4. `CommandMenuView` 重写到 `SplashPanel` + `SplashInputHeader` + 浮动 `ButtonGroup`（左「新会话」圆形图标钮、右「打开/关闭」提示钮）。
5. `CommandMenuRow` 对齐上游：选中态改成玻璃圆角底（`bg-foreground/[0.06]` + `layoutId` 滑块），行内结构（标题 baseline / subtitle / statusLabel / badge / onMore 槽）。

## 不做

- 不改 P3a 行为：分组、检索、⌘N、状态优先级均保持。
- 不改默认快捷键（D6）。
- 不删快捷面板（P3d）。
- 不为「更多」按钮接逻辑——上游 `onMore`/`moreLabel` 槽保留但本切片宿主不传入（命令面板行暂不需要）。

## 验收（Given/When/Then）

- `bun run check` 全过；`command-menu` 域 vitest 全过。
- `CommandMenuView.test.tsx` 仍绿：对话框 role/aria、空态、加载骨架、新会话按钮、行激活。
- 手动验证（说明性）：面板呈玻璃质感，选中项滑块跟随方向键，左下新会话/右下打开关闭按钮可点。
