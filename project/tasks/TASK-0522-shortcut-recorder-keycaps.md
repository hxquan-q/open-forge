---
id: TASK-0522
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0503]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1789c90ac
read_paths: []
write_paths:
  - packages/theme-ui/src/settings/ShortcutRecorderView.tsx
  - packages/theme-ui/src/settings/ShortcutRecorderView.test.tsx
  - packages/theme-ui/src/settings/LauncherSettingsView.tsx
  - packages/theme-ui/src/settings/LauncherSettingsView.test.tsx
  - apps/desktop/src/renderer/domains/settings/components/ShortcutRecorder.tsx
  - apps/desktop/src/renderer/domains/settings/components/useLauncherSettingsModel.ts
  - .github/release-notes/fragments/v0.1.5/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 设置页快捷键录入器改用键帽展示（P2 收尾）

## 合同

- 来源与目标：PLAN-0032 P2「已有快捷键展示统一改用键帽组件」。上游 11a71308b 的 VettaKbd/kbd-keys 已随 TASK-0497/0503 移植，但 `ShortcutRecorderView` 的键帽转换遗漏——本地设置页（快捷键页、启动器页、快捷键审批对话框）录入器仍渲染 `formatShortcut` 纯文本（"Ctrl ⇧ K"），与键帽体系割裂。本次补齐该转换。
- 输入 → 输出：上游 `upstream/dev` 的 `ShortcutRecorderView.tsx` 键帽版 + `ShortcutRecorderView.test.tsx`（108 行）→ 本地对照适配；删除 `formatShortcut` prop 及其在宿主侧的传递链。
- 做 / 不做：只改录入器展示与其直接宿主链；`SidebarCommandMenuTrigger` 的 title 提示、审批对话框文字摘要保留纯文本（title/aria 字符串内无法嵌键帽）。串行，共享写域无拆分收益。
- Given / When / Then：录入器已绑定快捷键时 → 渲染 `<kbd>` 键帽而非格式化文本；录入中 → 显示占位文案；未绑定 → 显示占位横线；重置按钮行为不变。
- 保留：录制交互（keydown 捕获、blur 取消）、`eventToShortcut` 宿主注入、isDefault/reset 语义、`formatShortcut`/`shortcutParts` 平台函数本身保留（仍被 title 提示与审批文字摘要使用）。
- 验证：新增 `ShortcutRecorderView.test.tsx`（对照上游用例）+ 更新 `LauncherSettingsView.test.tsx`；`bun run test:impact` 相关范围；`bun run check`。
- 人工验收：设置 → 快捷键 / 启动器页查看绑定展示为键帽；改键后键帽即时更新。

## 交付

工程完成（待人工验收）。

### 实现摘要

- `ShortcutRecorderView` 对照上游键帽版重写：已绑定渲染 `<VettaKbd keys size="sm">` 键帽、未绑定显示「—」占位、录制中显示占位文案；触发器皮肤对齐上游 select trigger（`border-transparent bg-muted hover:bg-accent`）。
- 删除 `formatShortcut` prop 及宿主传递链：`ShortcutRecorder.tsx`、`useLauncherSettingsModel.ts`、`LauncherSettingsView.tsx` 三处同步清理；`formatShortcut` 平台函数保留（仍被 title 提示与审批文字摘要使用）。
- 录制交互未动：keydown 捕获、blur 取消、`eventToShortcut` 注入、isDefault/reset 语义维持原状。

### 验证（实跑）

- 新增 `ShortcutRecorderView.test.tsx`（上游用例对照 + 未绑定占位），theme-ui 定向 8/8；desktop settings-startup-dependencies 2/2。
- `bun run test:impact`：desktop 19 个测试文件 119 用例 + theme-ui 相关文件全绿。
- `bun run check` 全绿（lint/types/guards）；版权头审计 missing=0；新测试文件断言深度 0 违规。
- release fragment `shortcut-recorder-keycaps.md` 已组装进 v0.1.5.md。
- 独立复查（verifier）：pass，四项合同逐一取证无阻断；低风险观察在案——`mod++` 组合为上游事件序列化体系限制、录入器皮肤与本地 MotionSelect 旧皮的视觉分歧属后续 polish 项，均非本次回归。

### 人工验收点

- 设置 → 快捷键 / 启动器页查看绑定展示为键帽；改键后键帽即时更新。
