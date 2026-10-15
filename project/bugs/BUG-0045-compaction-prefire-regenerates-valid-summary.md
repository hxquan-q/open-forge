---
id: BUG-0045
type: bug
status: done
priority: P2
owner: coding-agent
source: user-request（token 预算审计）
related_requirement: []
related_plan: []
related_tasks: [TASK-0128]
related_issues: []
created: 2026-09-27
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# 已完成预压缩随尾部增长重复生成摘要

## 用户流程与实际行为

Given 长会话进入预压缩带且后台摘要完成，When 用户继续对话、后续模型调用追加历史，
Then 已有有效摘要应保留直到正式压缩消费；实际实现随最新 keep-tail 切点移动再次调用模型。

影响：在预热带停留较久时可能多次付费摘要；不需要改变历史前缀即可发生。此缺陷不是
[TASK-0128](../tasks/TASK-0128-compaction-prefire-budget-audit.md) 最近会话样本高用量的已证实主因。

## 最小复现与证据

- Open Forge 0.1.1 / Windows / 基线 `54f20df4f`；只用确定性摘要替身，不调用服务商。
- `CompactionPrefireCache.start`：完成 entry-3 切点预热 → 追加 entry-4 → 再 start → 连续 settle。
  旧实现第二次 settle 返回多余 entry-4 摘要，而应返回 undefined。
- `DefaultCodingAgentContextRuntime.prepare`：模型窗口 1000，压缩阈值 800，先在 710 左右预热，
  追加历史到 730 左右，再超过 900；旧实现正式压缩使用 event-5 而不是原 event-3。

## 根因

[`compaction-prefire-cache.ts`](../../packages/coding-agent/src/compaction/runtime/compaction-prefire-cache.ts)
用重新计算的切点指纹与缓存比较；但尾部增长不等于原摘要前缀失效。`take`/`settle` 已按原摘要边界
验证，`start` 却按滑动边界判断，判定不一致。置信度高：缓存及真实产品 Context Runtime 两层回归均在旧实现失败。

## 修复与验证

- 使用已有 `isPrefireCacheValid` 作为唯一前缀有效性规则，不新增公共合同或第二套缓存。
- 单元覆盖追加历史仍复用、切分支必须重建；产品流程覆盖预热 → 继续对话 → 超阈值压缩且保留后来消息。
- 生命周期、取消、失败安全观测复用已有测试；命令和最终结果见关联 Task。

剩余风险：未调用真实 Provider 测量费用；复用旧切点会保留略长尾部，与既有预压缩合同一致。默认阈值、原始历史及持久化格式未变。

定向回归已通过；并行任务遗留的 lint 与声明头问题清理后，最终全量 `bun run check` 通过，详见关联 Task。
