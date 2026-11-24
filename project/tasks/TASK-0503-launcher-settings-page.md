---
id: TASK-0503
type: task
status: done
priority: P2
owner: apps/desktop + packages/theme-ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream fc41fcddf + 3a363c258 + ea90c3083 + 141ef08e6
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0501, TASK-0502]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: eb2bf0a
read_paths:
  - apps/desktop/src/renderer/domains/settings/
  - apps/desktop/src/renderer/shared/store/ui-atoms.ts
  - packages/theme-ui/src/settings/
  - apps/desktop/src/shared/i18n/locales/
write_paths:
  - packages/theme-ui/src/settings/LauncherSettingsView.tsx
  - packages/theme-ui/src/settings/LauncherSettingsView.test.tsx
  - packages/theme-ui/src/settings/index.ts
  - apps/desktop/src/renderer/domains/settings/components/LauncherSettings.tsx
  - apps/desktop/src/renderer/domains/settings/components/useLauncherSettingsModel.ts
  - apps/desktop/src/renderer/domains/settings/registry.ts
  - apps/desktop/src/renderer/domains/settings/components/settings-tab-loaders.ts
  - apps/desktop/src/renderer/domains/settings/components/SettingsPage.tsx
  - apps/desktop/src/renderer/shared/store/ui-atoms.ts
  - apps/desktop/src/shared/i18n/locales/en/settings.json
  - apps/desktop/src/shared/i18n/locales/zh/settings.json
  - project/tasks/TASK-0503-launcher-settings-page.md
exclusive_paths: []
depends_on: [TASK-0502]
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 启动器设置页：LauncherSettings 介绍页 + 改键入口（PLAN-0032 P3 切片 c）

## 目标

把上游「设置 → 启动器」介绍页移植到本仓：⌘T 面板没有常驻入口，这一页负责让人「看见」它，并给出改键入口。文案全部走 i18n。

- `LauncherSettingsView.tsx`（theme-ui 纯展示）：Hero（液态渐变底 + 真实面板缩影）+ 「能做什么」分区 + 改键分区。
- `useLauncherSettingsModel.ts`（desktop 行为层）：读/写 `open-command-menu` 快捷键绑定、组装 i18n 文案、构造预览分组与特性列表、`onOpenLauncher` 唤起面板。
- `LauncherSettings.tsx`（入口）：`useLauncherSettingsModel` → `LauncherSettingsView`。
- 注册：`registry.ts` 加 `launcher` 标签 + `launcher-features`/`launcher-shortcut` 两节；`settings-tab-loaders.ts` + `SettingsPage.tsx` lazy；`ui-atoms.ts` `SettingsTab`/`SettingsTabLabelKey` 加 `launcher`。
- i18n：`en`/`zh` `settings.json` 加 `tabLauncher`、`section_launcher-*`、`launcher.*` 整块。

## 适配点（与上游的差异）

- 上游 `@shared/lib/shortcuts`、`@shared/lib/platform`、`@shared/store/atoms` 在本仓对应 `renderer/shared/lib/shortcuts`、`renderer/shared/lib/platform`、`@shared/store/atoms`（`@shared` 已映射到 `renderer/shared`）。`eventToShortcut` 在本地 `renderer/shared/lib/platform.ts`。
- `AppMonitorSettingsTab` 枚举本仓已含 `"shortcuts"`，无需改动。
- `commandMenu.*` i18n 键本仓已具备（P3a 已移植）。
- 上游 `LauncherSettingsView.test.tsx` 用 `createRoot` + `IS_REACT_ACT_ENVIRONMENT`，按原样移植到 theme-ui。

## 不做

- 不删快捷面板（P3d）。
- 不改 `open-command-menu` 默认键（仍 `mod+k`；⌘T 切换属 P3d/上游对齐范畴，由用户定）。
- 不改 `AppMonitorSettingsTab`/`SettingsTab` 之外的监控合同。

## 验收（Given/When/Then)

- `bun run check` 全过。
- `LauncherSettingsView.test.tsx` 新增用例绿（上游 4 条：渲染标题/Hero/特性/改键区）。
- `check:quick` 对所有改动文件 exit 0。
- 设置页出现「启动器」标签，点进能看到预览与改键控件（说明性，UI 验收另授权）。

## 交付记录

- 适配点补充：本地 `ShortcutRecorderView` 比上游多一个必填 `formatShortcut` prop（格式化持久化快捷键的展示），故 `LauncherSettingsView` 增加 `formatShortcut` 透传，model 从 `@shared/lib/platform` 引入，测试桩补 `formatShortcut: (s) => s`。其余与上游逐字一致。
- 验证：`LauncherSettingsView.test.tsx` 3/3 绿；`apps/desktop` settings 域 vitest 41 文件 202 用例全绿；`check:quick` 与 `bun run check` 全过（release-notes 既有 advisory 不计入失败）。
- 提交：`1642a4a`。
