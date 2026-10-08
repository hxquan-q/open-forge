---
id: TASK-0188
type: task
status: done
priority: P1
owner: desktop
source: user-request; RESEARCH-0022; upstream 00ebe0b88
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0069]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.test.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/message-list-derived.ts, apps/desktop/src/renderer/domains/conversation/components/message-list/message-list-derived.test.ts]
write_paths: [project/bugs/BUG-0069-streaming-usage-reference-churn.md, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.test.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/message-list-derived.ts, apps/desktop/src/renderer/domains/conversation/components/message-list/message-list-derived.test.ts, project/tasks/TASK-0188-stream-usage-identity.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 流式回复用量引用稳定性

## 目标与范围

适配上游 00ebe0b88 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

已有历史与占位回复；流式追加尾部但 usage 不变；历史回复收到相同 usage 引用，最终新 usage 仍按顺序纳入。

## 必须保持

保留 placeholder usage、模型切换标记、分页、选择与列表挂载身份。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

红测：Node runner + Desktop config，2 个新回归因 usage 数组引用不同失败，15 个已有测试通过；环境缺 workspace dist 的首次失败不作为红测，已由 turbo Desktop 依赖构建解决。

绿测：`bun scripts/quality/run-vitest.mjs run --config apps/desktop/vitest.config.ts message-list-derived.test.ts MessageListView.test.tsx`，2 文件/17 测试通过。仅复用相同有序 usage 元素的数组，placeholder 收集保留；跨包/完整检查由批次终验执行，未跑 UI。

完整 Desktop 类型检查发现 toTranscriptPlaceholder 返回值允许 undefined；按实际工厂合同增加运行时前置校验，不用断言绕过类型。

类型补齐后复验：对应定向测试通过；根 `bun x tsgo --noEmit` 与 Desktop `typecheck:incremental` 均通过，未使用 any/断言绕过。最终完整 check 仍由批次重跑。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

- 同一历史回复（新会话首答「收到」）的「当前消息」用量在三个时刻逐字符一致：空闲 → **下一回合流式中**（composer「停止生成」按钮可见，UI 项 `1000000–1000003`）→ 回合结束后。数值为 `1 次模型调用 / 缓存命中率 39.5% / 总计 34.7K / 输入 21K / 缓存命中 13.7K / 缓存写入 -- / 输出 2`。历史回复的用量数字不随流式自变。
- 判据更正：Debug CLI 驱动的回合不进入 UI 会话视图（12 步回合期间 UI 末项与长度 42 秒无变化），本项必须在 UI 内用输入框发起回合；正文正则 `进行中|思考中|生成中` 会命中用户提示词原文，属假阳性，改用 composer 停止按钮判定。
- 按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。
