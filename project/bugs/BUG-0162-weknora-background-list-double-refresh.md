---
id: BUG-0162
type: bug
status: verifying
priority: P1
owner: desktop/weknora
requirement: REQ-0002
source: TASK-0412 gate bzbpubblu; ISSUE-0035
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412, TASK-0419]
related_issues: [ISSUE-0035]
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 后台终态合并刷新与新会话即时刷新叠成两次列表请求

## 用户流程

- Given：智能客服已配置，用户先后发起两路提问，并切到新对话，两路都在后台。
- When：两路几乎同时到达终态。
- Then：历史列表只静默重拉一次，不弹窗、不出现状态提示。

## 实际行为

完整 `test:changed`（bzbpubblu）中 AC-20 期望 `listSessions` 为基线加 1，实际为基线加 2。等待去抖窗口后第一次断言已通过，800ms 后再数仍多一次。

## 期望行为

同一轮后台终态只触发一次列表重拉。新会话刚落库时左栏仍应立刻出现，不要求用户手动刷新。

## 环境与失败证据

- Windows、仓库 Node runner、单 worker；候选 HEAD `f33ff37cc`，82 路径字节快照未变。
- `apps/desktop` 1108 文件通过、1 失败：`weknora-background-flow.test.tsx` AC-20，期望 4、实际 5。
- 同文件在 ISSUE-0035 的独立基线也曾失败，不归因于本轮交付修复。

## 最小复现

1. 运行该文件的 AC-20 用例。
2. 基线取在两次「新建对话」之后、终态之前。
3. 第二次提问仍是新会话，`ask` 返回后的即时 `loadSessions` 落在基线之后，再叠加终态去抖的一次重拉。

## 根因

`useWeKnoraChat` 在每个新会话落库后立即 `loadSessions`。测试的 `ask` 替身同步返回，但调用方未等待，第二次刷新跨过基线。后台终态去抖本身仍只排一次。

## 修复

新会话落库的即时刷新与随后的后台终态刷新合并为同一次在途请求；终态仍在页面不在时静默刷新。不放宽 AC-20 的一次断言，不增加超时。第十批冻结候选 b6c7y60gc 中该用例未再失败；待集成后关闭。
