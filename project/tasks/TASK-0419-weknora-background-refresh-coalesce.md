---
id: TASK-0419
type: task
status: verifying
priority: P1
owner: desktop/weknora
requirement: REQ-0002
source: TASK-0412 gate bzbpubblu; ISSUE-0035; BUG-0162
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412]
related_issues: [ISSUE-0035]
related_bugs: [BUG-0162]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [apps/desktop/src/renderer/domains/weknora/, project/]
write_paths: [apps/desktop/src/renderer/domains/weknora/hooks/useWeKnoraHistory.ts, apps/desktop/src/renderer/domains/weknora/weknora-background-flow.test.tsx, project/tasks/TASK-0419-weknora-background-refresh-coalesce.md, project/tasks/README.md, project/bugs/BUG-0162-weknora-background-list-double-refresh.md, project/bugs/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, .github/release-notes/fragments/v0.1.4/task-0419-weknora-background-refresh-coalesce.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-31
---
<!-- Copyright The Open Forge contributors. -->

# 后台终态与新会话列表刷新合并为一次

## 目标与范围

续接 BUG-0162。新会话落库的即时 `loadSessions` 与后台终态去抖重拉叠成两次。同一时刻只保留一次在途列表请求，后到的调用复用它；请求结束后的新调用仍重新拉取。不删除 AC-20 的一次断言，不增加超时，不改去抖窗口。

## 并发评估

必须串行：与 TASK-0412 共用主检出。与 TASK-0418 写域不重叠，但仍在同一候选上顺序修改，避免并行写工作区。

## Given / When / Then

- Given 两路提问都在后台，When 几乎同时终态，Then `listSessions` 只比基线多 1，且无弹窗。
- Given 新会话刚落库，When 用户留在当前页，Then 左栏仍会刷新到新会话。
- Given 一次刷新已结束，When 再次终态，Then 发起新的列表请求。

## 必须保持

不提高 timeout/retry，不新增 skip，不改 AC-20 期望。不启动真实 Desktop，不访问真实客服服务。

## 测试与验证

包内入口运行 `weknora-background-flow.test.tsx`，保留全部原断言；AC-20 用例在两条新会话都已出现在历史列表后才记录终态刷新基线，避免把尚未完成的新会话即时拉取误计为终态刷新。2026-10-31 全文件 7/7、AC-20 隔离重跑 6 次通过；第十批冻结候选 b6c7y60gc 的 Desktop 6247 项通过、18 项既有跳过。该结果不表示已发布。
