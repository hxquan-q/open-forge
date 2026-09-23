---
id: TASK-0081
type: task
status: in_progress
priority: P1
owner: packages/coding-agent + runtime-core
requirement: REQ-0002
plan: PLAN-0002
source: code review 修复批（3 个 finder 独立命中；修复 TASK-0073 引入的投影稳定性倒退）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/compaction/runtime/model-call-context-projection.ts, packages/coding-agent/src/compaction/microcompact.ts, packages/runtime-core/src/kernel/runtime-message-context.ts, packages/runtime-core/src/kernel/message-prefix-stability.ts, packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts, project/tasks/TASK-0073-kernel-context-cache-stability.md]
write_paths: [packages/coding-agent/src/compaction/microcompact.ts, packages/coding-agent/src/compaction/runtime/model-call-context-projection.ts, packages/runtime-core/src/kernel/runtime-message-context.ts, packages/coding-agent/test/, packages/runtime-core/test/]
exclusive_paths: [packages/coding-agent/src/compaction/, packages/runtime-core/src/kernel/]
depends_on: [TASK-0073]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 压缩投影的 turn 内稳定性修复

## 根因（finder 交叉确认）

1. **滑窗翻转**：`maxAgeMs` 30s→0 后，keepRecent=8 计数窗随消息追加滑动——turn 内 8+ 条 thinking 消息后几乎每次 model call 翻转一条中间消息（pruneThinkingBlocks 清空 signed thinking、删除 unsigned），跨调用字节不再稳定。旧 30s 门在 Turn 准入时冻结 `now`，turn 内剪枝集合字节一致——被删的正是这个不变量。Anthropic prompt cache 尾部全失，成本回归恰是旧门控要防的。
2. **缺幂等早退**：`pruneThinkingBlocks`（microcompact.ts:135-194）没有 `pruneToolResults` 的 CLEARED_MESSAGE 身份复用（:107-118）——已清空 thinking 的消息仍匹配 thinking 块存在性检查，每次调用重建消息与块对象，身份 churn 击穿 prefix-stability 观察器的全等快路径。
3. **判等键序敏感**：`messagesEqual`（runtime-message-context.ts:58-60）的 `JSON.stringify` 回退对属性插入序敏感——重建消息键序一变即误判不等，审计信号被 false prefix_rewrite 污染（reconcileRuntimeMessageEnvelopes 也会丢产品消息身份）。

## 做

1. `pruneThinkingBlocks` 加幂等早退：全部 thinking 块已清空（或无剩余）时返回原消息对象，镜像 pruneToolResults 的身份复用。
2. per-turn 冻结剪枝边界：`bindForTurn` 时一次性计算 clear set（计数式、确定性，替代滑动的 maxAgeMs=0 行为），或持久化单调 cleared-id 集合——保证 turn 内投影 append-only。实现前先读 TASK-0073 文档与 git log 理解被删 timeBoundary 的原意。
3. `messagesEqual` 规范化：按键排序的稳定序列化或 WeakMap 缓存每消息序列化形，重复比较不再重序列化。

## Given / When / Then

- Given 一个 12 步工具循环的 turn，When 每次 model call 投影，Then 剪枝集合与已见消息字节/身份稳定（无中间翻转），观察器无 prefix_rewrite。
- Given 两个结构相同、键序不同的消息对象，When 判等，Then 相等。
- Given 未触及剪枝边界的短 turn，Then 行为与现状一致。

## 测试与验证

- coding-agent / runtime-core 新增：同 turn 多次投影稳定性断言、幂等身份复用断言、键序无关判等断言；跑既有 microcompact / kernel 测试防回归。
- 命令：`bun scripts/quality/run-vitest.mjs --run <file>`（包根运行）；`bun run test:pkg coding-agent`、`test:pkg runtime-core`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【改进】长工具循环的上下文压缩不再逐次改写已见消息，提示词缓存命中率与稳定性观测恢复。
