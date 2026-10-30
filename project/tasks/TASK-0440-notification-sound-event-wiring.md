---
id: TASK-0440
type: task
status: verifying
priority: P2
owner: desktop notifications
requirement: REQ-0008
plan: PLAN-0014
source: BUG-0080
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0161]
related_issues: []
related_bugs: [BUG-0080]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: 主检出串行
base_commit: dc6a0b225
read_paths:
  - apps/desktop/src/renderer/domains/message/hooks/
  - apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts
  - apps/desktop/src/renderer/shared/audio/notification-sound-player.ts
write_paths:
  - apps/desktop/src/renderer/domains/message/hooks/useDesktopNotificationSound.ts
  - apps/desktop/src/renderer/domains/message/hooks/useDesktopNotificationSound.test.tsx
  - apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts
  - project/bugs/BUG-0080-notification-sound-never-played.md
  - project/bugs/README.md
  - project/tasks/TASK-0440-notification-sound-event-wiring.md
  - project/tasks/README.md
  - project/tasks/TASK-0161-desktop-notification-preferences.md
  - .github/release-notes/fragments/v0.1.5/bug-0080-notification-sound-wiring.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 提示音事件接入桌面渲染层（BUG-0080）

## 目标与范围

把主进程 `notification:sound` 命令接入常驻的 RootLayout：订阅 `window.vetta.notification.onSound`，将经过 preload 校验的内置音色与音量交给既有 `playNotificationSound` 播放器，并在根布局卸载时解除订阅。保持现有策略、设置项、音量规范化与系统通知行为不变。

## Given / When / Then

- Given 主进程发送合法提示音载荷，When RootLayout 已挂载，Then 渲染层调用播放器一次且参数与载荷一致。
- Given RootLayout 卸载，When 后续没有活动订阅，Then 调用 preload 返回的取消订阅函数。

## 必须保持

- 不改变主进程通知策略、静音判定、设置默认值或提示音时机。
- 不在非 RootLayout 页面重复挂载订阅；单次事件只能触发一次播放。
- 播放失败继续由现有播放器捕获，不阻断渲染层事件处理。
- 不在本 Task 内启动真实 Desktop 或 provider；实机声音验收保留给用户验收。

## 测试与验证

- 新增渲染 hook 合同测试：收到 `onSound` 载荷后调用 `playNotificationSound(soundId, volume)`，卸载时解绑。
- 先跑回归测试基线（缺失 hook 时红），实现后跑定向测试；随后运行 Desktop 相关测试、`test:impact` 与 `bun run check`。

## 交付记录

- 待完成代码验证后回填。实机播放未由本任务验证。
