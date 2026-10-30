---
id: BUG-0155
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: TASK-0407 / code-mode-audit-2026-10-30 §四 F04
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0411]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 同一 AI 文件再次编辑不跟回内嵌预览

## 用户流程

- Given：AI 编辑文件 A（内嵌预览跟随到 A），用户手动浏览文件 B，When：AI 再次编辑 A，Then：预览应跟回 A（右栏即 LLM 工作区）。

## 实际行为

预览停留在 B。`useFollowAiFileEdits` 以 `lastFollowedRef === target.path` 去重，只记上一次 AI 目标，不比较当前实际预览是否仍是 A。

## 环境与失败证据

- 基线 `98f7de9e6`；独立诊断探针复现（TASK-0407 §四 F04）。对照：页签级跟随（useFollowAiActivity）已在 TASK-0392 修复为读实际选中页签，文件详情端未同步。

## 最小复现

1. 触发 AI 编辑 A → 预览切 A；2. 手动打开 B；3. AI 再次编辑 A → 预览停留 B。

## 影响

用户误以为 AI 在改 B；演示语义「跟随最新 AI 编辑」断裂。无数据损坏。

## 根因证据

`useFollowAiFileEdits.ts:16-22`（报告 §11.1 复核一致）。

## 回归测试

新 AI 活动（目标对象变化）且当前预览不是目标文件时跟随；用户手动浏览（无新 AI 活动）不被回拉；同一文件连续编辑且预览已在看时不重置。

## 修复与验证

- 修复：`useFollowAiFileEdits` 去重改为双条件——`lastTargetRef`（目标对象引用，只由新 AI 活动推进）+ 当前 `inlineFilePreviewAtom` 读值与目标路径比较；与 TASK-0392 页签跟随同构。预览变化本身不触发回拉，已在目标文件上不重置多文件上下文。
- 测试：跟回用例红 1→绿；文件 4/4 + 相邻 useFollowAiActivity 4/4 通过。
- 检查：`check:quick` 通过。完整 check 留批次收尾。
- 未运行及原因：实机走查属可选人工验收；其余无。
