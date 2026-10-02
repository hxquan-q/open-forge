---
id: TASK-0194
type: task
status: in_progress
priority: P1
owner: apps/desktop
source: BUG-0073
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0073, BUG-0068]
execution: parallel
branch: task/TASK-0194-queue-anchor-review-fixes
worktree: ../open-forge-wt/task-0194-queue-anchor-review-fixes
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths:
  - apps/desktop/src/renderer/domains/conversation/**
  - apps/desktop/src/renderer/shared/store/message-queue-atoms.ts
  - project/bugs/BUG-0073-queue-fix-anchor-regressions.md
write_paths:
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.ts
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window-controller.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.queue.test.ts
  - apps/desktop/src/renderer/shared/store/message-queue-atoms.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.test.ts
  - project/bugs/BUG-0073-queue-fix-anchor-regressions.md
  - project/tasks/TASK-0194-queue-anchor-review-fixes.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.ts
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0181, TASK-0187, TASK-0196, TASK-0197]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 修复 BUG-0068 修复提交复审发现的锚定/派发序号回归

## 目标

BUG-0073 四项缺陷修复后：失败队列派发不再误杀最新轮 `agent_end` 重拉；未消费排队气泡不再被锚进历史中段；`prependedCount` 语义还原为「新前插 projected 条数」；窗口化/快照/opener 三层对未决气泡共用同一锚定与回退规则。

## 范围

### 并发评估

- 结论：条件支持并行——conversation 域文件独占（`exclusive_paths` 锚定新模块），与其他在途 Task（TASK-0186/0187 批次，均为 plugins/packages 域）无路径交集。
- 执行方式：独立 Worktree `task/TASK-0194-queue-anchor-review-fixes`，单 Worker 串行实现。
- 前置依赖：无（基于 main HEAD 48b8e487f，含 c9db5fa27）。
- 冲突文件：共享 Project 索引（tasks/bugs README）由协调阶段在主树更新，不进本 Task write_paths（TASK-0186 惯例）。Release Notes 随修复提交走推 dev → 合 main 全程，与在途 Task 的目录级/同名声明撞碰全部登记 `conflicts_with`（TASK-0122/0123/0181/0187/0196/0197）——实际改动只有本缺陷的一句话，集成时按行核对、后到者重排。
- 集成负责人：当前 Agent（用户已授权：验证通过后推 `origin/dev`，再合回本地 main）。
- 集成顺序：与其他并行 Task 无依赖，验证通过即可推送/集成。

### 做

- 抽取共享锚定助手 `services/pending-user-anchor.ts`（行为保持重构，先行为保提交）：后继锚定 (a)、孪生槽锚定 (b)、尾部兜底 (c) 一份实现；`transcript-window.ts`、`chat-message-snapshot.ts`、`useSessionOpener.ts` 三处收编；顺带删除退化的 `canonicalCount` 字段（单一事实源 `canonicalItemIndexes`）。
- 缺陷 1：`agent_end` 判活由 `current !== snapshot` 收紧为 `current > snapshot`（`useSessionEventController.ts` 两处），失败派发的 unbump 落在快照之后不再误判「跨轮」；`message-queue-atoms.ts` 注释同步。
- 缺陷 2：共享助手 (b) 分支加孪生校验——锚定槽 user 文本须与气泡一致（复用 `optimistic-user-message-cache` 的 `sameText` 语义并导出），不匹配维持尾部。
- 缺陷 3：`prependedCount` 只统计头部连续「非 live 复用」的 projected 条目，删除首部 live-only 项 `+=`。
- 缺陷 4：opener 的 missing 气泡合并改走共享助手（以 reconciled 为序、merged 为基），回退方向与 snapshot 层一致。
- 回归用例：BUG-0073 所列 4 组，旧实现先红。

### 不做

- 不改 kernel 队列/持久化/事件合同；不做 turn 身份判活的深层重构（评审发现 5/6，登记后续）；不做锚点扫描 O(k·(L+N)) 预计算优化（发现 8）；不动他人未提交改动与共享 README 索引（协调阶段处理）。

## Given / When / Then

1. **失败派发不误杀重拉**：Given turn-A 流式中两次「立即发送」点击（q-1 开 turn-B、q-2 返回 `missing`），turn-B 的 `agent_start` 快照落在膨胀窗口内；When q-2 的 unbump 使序号回落、turn-B `agent_end` 到达；Then 重拉照常落地（entryId/时长/镜像吸收完成）。
2. **幽灵气泡保持尾部**：Given live=[已持久化 u-1, pending 镜像 X, pending 幽灵 Y]，canonical=[u-1, user X, assistant]；When 窗口化/快照对账；Then Y 追加尾部，X 仍锚在孪生槽之前。
3. **prependedCount 语义**：Given live=[pending, 已消费 u, 已消费 a]，canonical=[u, a]；When (a) 锚定到 0；Then `prependedCount === 0`。
4. **两层回退一致**：Given missing 气泡在 reconciled 中先于首个 canonical 项、merged 头部有 preserve 保留行；When opener 对账合并；Then 气泡落 canonical 首项之前、保留行之后，与 snapshot 层同形输入一致。

## 验证

```bash
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.queue.test.ts
bun run test:impact -- <改动文件...>
bun run check:quick -- <改动文件...>
bun run test:changed --base origin/dev
bun run check
```

## 交付记录

- 实施中；完成后回填实际修改、命令与结果、未运行项及剩余风险。
