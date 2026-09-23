---
id: TASK-0029
type: task
status: in_progress
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-4
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行，与并行会话路径无交集）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/domains/conversation]
write_paths: [apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/domains/conversation, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# subagentsBySessionAtom 会话级 LRU

## 目标

`subagentsBySessionAtom`（含每个已完成子代理的 `finalText` 全文）按会话累积、只在收到空快照时删键，长时间使用跨会话缓慢增长。复制 `rememberTurnStats`（chat-service.ts）的既有 LRU 模式封顶 128 会话。

## Given / When / Then

- Given 用户在超过 128 个会话中使用过子代理
  When 新会话写入子代理快照
  Then 最旧会话的快照被淘汰，当前会话与最近 127 个保留；空快照删键语义不变。

## 测试

`subagents-atoms.test.ts`（纯函数）：超限淘汰最旧、重写刷新新近度、空快照删键、引用稳定性。

## 并发结论

支持（渲染端独立文件）；主会话串行执行。
