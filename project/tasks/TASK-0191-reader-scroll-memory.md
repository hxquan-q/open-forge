---
id: TASK-0191
type: task
status: ready
priority: P1
owner: desktop
source: user-request; RESEARCH-0022; upstream 15317178d
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.ts, apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.test.tsx]
write_paths: [apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.ts, apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.test.tsx, project/tasks/TASK-0191-reader-scroll-memory.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 滚动记忆只保存用户停留位置

## 目标与范围

适配上游 15317178d 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

自动跟随尚未到底时离开会话再回来；不恢复半途快照；主动浏览旧消息再返回仍恢复用户位置。

## 必须保持

保留 firstItemIndex 窗口化偏移、首次目标跳转、缓存上限和监听清理。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。
