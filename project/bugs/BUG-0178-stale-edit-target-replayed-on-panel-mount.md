---
id: BUG-0178
type: bug
status: verifying
priority: P2
owner: apps/desktop activity panel
requirement: REQ-0030
plan: PLAN-0028
source: code-mode-audit-2026-10-30 AUD-ACTIVITY-001 follow-up
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0435, TASK-0442]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 新文件面板挂载时回放同 cwd 的旧 AI 编辑目标

## 用户流程与实际行为

- Given：Code 项目内 AI 已编辑文件，之后文件面板卸载；全局 `aiEditTargetAtom` 仍保存该目标。
- When：在同一 cwd 再次挂载文件面板（例如切回页签/重新打开面板），Then：旧目标会被当成新 AI 活动消费，内嵌预览跳回旧文件。
- Expected：挂载只开始观察之后的新目标；仅目标在面板存续期间更新时自动跟随。

## 环境与失败证据

- 代码审查确认 `useFollowAiFileEdits` 的 `lastTargetRef` 初始为 `null`，而 `aiEditTargetAtom` 是全局单值。首次挂载若已有同 cwd 目标，effect 会把它认作新活动。
- 跨 cwd 隔离已由 BUG-0173 / TASK-0435 修复；本条是同 cwd、面板 remount 的独立复现，不回退跨 cwd 合同。
- 待新增渲染 hook 回归测试动态确认。

## 最小复现

1. 在 Code 项目的文件面板中让 AI 编辑一个文件。
2. 手动切到另一个文件或关闭/卸载文件面板，但不清除全局 AI 编辑目标。
3. 重新挂载同一 cwd 的文件面板；观察内嵌预览是否被旧目标拉回。

## 影响

P2：用户的手动文件浏览可能被历史活动抢占；只影响面板可见状态，不改变文件内容或会话数据。

## 根因

`lastTargetRef` 每次新 hook 实例都从 `null` 开始，没有记录挂载时 atom 当前值。跨 cwd 检查无法阻止同 cwd 的陈旧值。

## 回归测试

- 面板挂载前写入同 cwd 目标：初始挂载不写预览。
- 挂载后更新为新目标：预览仍按新活动跟随。
- 测试先红 1（手动预览被旧 `old.ts` 抢占），修复后 hook 套件 7/7、impact direct 7/7 + related 118/118 通过。

## 修复与验证

- 修复：`lastTargetRef` 首次初始化为挂载时 atom 的当前目标，阻止历史目标被当作新活动；后续 atom 目标更新仍会被跟随。
- 测试：先红 1→绿；`useFollowAiFileEdits.test.ts` 7/7；impact direct 7/7 + related 118/118。
- 检查：`bun run check` 全绿。
- 未运行及原因：不需要真实 Desktop 或实机文件；回归覆盖 hook 挂载与更新生命周期。
