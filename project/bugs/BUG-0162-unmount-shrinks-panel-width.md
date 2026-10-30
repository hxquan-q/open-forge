---
id: BUG-0162
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: 用户实机验收反馈（2026-10-30，TASK-0414/0415 布局验收）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0418, TASK-0414]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 发送首条消息后右栏宽度自动回缩到默认

## 用户流程与实际行为

- 新建 code 会话（初始化：左收右开、宽度对半分）→ 仅发送首条消息，未做其他操作 → 右栏宽度自己缩小。

## 环境与失败证据

- 用户 dev 实机（2026-10-30）。
- 根因链：初始化宽度（≥520 预览阈值）让文件页签「宽度驱动」自动选中第一个文件（预览上下文非空，无主动点开记录）→ 发首条消息路由切换使新会话页的 `FileTabContent` 卸载 → 卸载清理无条件走 `closeInlineFilePreviewAtom`，其对「无 restore 记录」的预览回拉面板宽度到默认 360（`file-preview-atoms.ts:119-134`、`useFileTabContentModel.ts:69`）。此前 F02 修复前 commit 边沿会 re-init 写回对半分，掩盖了该回拉；F02 后不再 re-init，回拉显形。

## 最小复现

1. 新建 code 会话（宽度 628）→ 发首条消息 → 右栏缩到 360。

## 影响

版块态初始化的对半分被卸载清理破坏（P1）。

## 根因证据

close writer 源码（`restore === null` → `ACTIVITY_PANEL_DEFAULT_WIDTH`）+ 卸载清理无条件调用；机制与症状逐环对应。

## 回归测试

- 卸载语义：`useFileTabContentModel` 卸载清空预览上下文但**不**改面板宽度（红：当前回拉 360）。
- 用户主动关闭预览的回拉行为保持（既有语义，补看守用例）。

## 修复与验证

- 修复：`file-preview-atoms` 新增 `clearInlineFilePreviewContextAtom`（只清上下文与 restore 记录、不动宽度）；`useFileTabContentModel` 卸载清理改走它；用户主动关闭（含 chat/sessionViewer 的 togglePanel 路径）仍走完整 close（含回拉），语义不变。
- 测试：卸载不缩宽红 1→绿；主动关闭回拉看守用例过；模型 2/2 + 相邻 file-edits 6/6。
- 检查：`check:quick` 通过（ratchet new=0，两文件补 fork 头）。
- 未运行及原因：实机复验待用户（新建→发首条消息→宽度应保持对半分）。
