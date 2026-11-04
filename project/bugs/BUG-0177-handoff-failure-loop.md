---
id: BUG-0177
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0006
plan: PLAN-0028
source: 用户实机验收反馈（2026-10-30，团队首条消息失败后输入框频闪）
related_requirement: [REQ-0006]
related_plan: [PLAN-0028]
related_tasks: [TASK-0439]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Team 首发失败后 handoff 重新武装导致自动重发风暴

## 用户流程与实际行为

- 团队新会话首条消息（经新会话页 handoff）创建失败（如 BUG-0176）→ 输入框频闪，控制台同一 requestId 的 send attempted/failed 无限重复。

## 环境与失败证据

- 用户 dev 实机控制台循环日志（attempted→started→failed 每 20-40ms 一轮）。
- 根因链：`useTeamChatModel.ts:884` 失败且会话未创建时 `releaseTeamSessionHandoff`（重新武装）→ 失败路径恢复草稿/附件/提及（906-913）→ `send` 回调依赖变化重建 → handoff effect（941-946）重跑再领取 → 再失败再 release，无限循环。release 出自 `6c3a13e5d` 团队接入初期，无竞态修复注释。

## 最小复现

1. 让 createReservedTeamChatSession 确定性失败（如 BUG-0176 场景）→ 观察循环。

## 影响

失败被放大为高频自动重试（IPC 风暴 + 输入框频闪）；无数据损坏。

## 根因证据

循环三要素（release/状态恢复/effect 依赖）与日志逐环对应。

## 回归测试

- 创建失败后 handoff 保持已领取：仅一次创建尝试，草稿恢复（旧实现红：观察窗口内尝试数持续增长）。

## 修复与验证

- 修复：移除失败路径的 `releaseTeamSessionHandoff` 重武装（含未用导入）——创建失败的 handoff 保持已领取；失败回填（草稿/附件/提及）仍在，用户手动重发。
- 测试：红测复现风暴（150ms 观察窗口内创建尝试 **1427 次**）→ 修复后 1 次、sendMessage 未达、草稿恢复；团队四套件 42/42。
- 检查：`check:quick` 通过（ratchet new=0，测试文件补 Copyright 头）。
- 未运行及原因：status 字段断言与既有状态机时序耦合，非本合同核心，未纳入；实机复验待用户。
