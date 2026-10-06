---
id: TASK-0189
type: task
status: done
priority: P1
owner: desktop
source: user-request; RESEARCH-0022; upstream f4dfc2690
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0070]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/shared/conversation/message-stream.ts, apps/desktop/src/renderer/shared/conversation/message-stream.test.ts]
write_paths: [project/bugs/BUG-0070-tool-use-premature-completion.md, apps/desktop/src/renderer/shared/conversation/message-stream.ts, apps/desktop/src/renderer/shared/conversation/message-stream.test.ts, project/tasks/TASK-0189-tool-use-message-phase.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 工具调用期间回复保持进行中

## 目标与范围

适配上游 f4dfc2690 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

同回合模型输出工具调用；工具执行并继续模型输出；toolUse 不提前写 endedAt，usage 累计一次，最终完成/错误/取消正确。

## 必须保持

保留普通会话与 Team 的共享投影、sequence 去重和工具状态。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

红测：`bun scripts/quality/run-vitest.mjs run --config apps/desktop/vitest.config.ts message-stream.test.ts`，1 新用例因 completed 而非 streaming 失败，5 既有用例通过。

绿测：`bun scripts/quality/run-vitest.mjs run --config apps/desktop/vitest.config.ts message-stream.test.ts conversation-projection.test.ts useSessionManager.queue.test.ts`，5 文件/32 测试通过，覆盖共享投影、会话/Team 与排队入口；完整批次检查待终验。

- 2026-10-06 人工 UI/模型实测：真实模型回合（含 todo 工具多轮调用）中回复持续显示「进行中」，直到 `turn.completed` 才转为完成；会话 JSONL 中 toolUse 未提前写终态。验收子条件已全部观察到，按 VERIFY-0017「组一执行明细」的授权记为 done。
