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
updated: 2026-10-31
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
- `apps/desktop` 1108 文件通过、1 失败：`weknora-background-flow.test.tsx` AC-20，期望 4、实际 5；该条目同时在 ISSUE-0035 的独立历史基线失败过。
- 2026-10-30 合并后 `test:changed` 又在 Desktop 受影响包中复现一次（期望 4、实际 5）；随后同一 AC-20 单独连续运行 4 次全部通过。

## 最小复现

1. 运行该文件的 AC-20 用例。
2. 基线取在两次「新建对话」之后、终态之前。
3. 第二次提问仍是新会话，`ask` 返回后的即时 `loadSessions` 落在基线之后，再叠加终态去抖的一次重拉。

## 根因与当前复现口径

代码侧原缺陷是 `useWeKnoraChat` 每个新会话落库后立即 `loadSessions`，与后台终态去抖刷新在同一在途请求时应合并；TASK-0419 已保留该合并实现。随后出现的 AC-20 偶发红灯来自测试基线捕获过早：`ask` 以同步已解决 Promise 返回，但调用方未等待历史列表即时刷新，延迟的 `loadSessions` 会越过基线并被误计为终态刷新。

测试现已等待 s1、s2 两个新会话出现在历史列表后再捕获基线；终态之后仍严格断言恰好一次重拉，不增加 timeout、不改产品策略。修改后完整 `weknora-background-flow.test.tsx` 7/7，通过 impact 7/7，AC-20 隔离共 6 次通过。完整 `test:changed` 未在本次测试同步后重跑，保留 `verifying` 直到批次后续验证。
