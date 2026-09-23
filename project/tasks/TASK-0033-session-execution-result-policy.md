---
id: TASK-0033
type: task
status: ready
priority: P1
owner: packages/coding-agent
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-1 实施中发现（TASK-0032 遗留跟进）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/execution, packages/coding-agent/src/composition]
write_paths: [packages/coding-agent/src/execution, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0032]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# 会话执行运行时核心工具的结果策略旁路

## 目标

`CodingAgentSessionExecutionRuntime.createModeRegistry`（execution/session/runtime.ts:249-256 一带）创建 registry 时未注入 resultPolicy，默认 PRESERVE——产品会话中 bash/read/write/edit/task_output/task_stop 等核心工具的结果不在 50KB+artifact 预算内，属 TASK-0032 封堵的两条旁路之外的同型旁路。

## 方案边界

- 必须在 TASK-0032 已确立的图片语义之上评估：read 截图预览依赖「准入内图片内联」，套用策略后 8MB/24MB 内截图照常显示，超准入省略——先写用例证红再动；
- read/write 的 diff details 是 UI 重要字段，验证 64KB details 预算下 diff 展示不回退；
- 注入点：peripheral-assembly 实例化处传入同一 `codingToolResultPolicy`。

## 测试

read 大文本截断+artifact 引用、截图准入内联保留、diff details 保留、bash 长输出截断。

## 并发结论

支持；建议主会话空闲时执行。

## 交付记录

- Release Notes（候选，待 ISSUE-0007 首发版本切入后写入 Open Forge 自己的 `v*.md`；此前不写入继承的 Vetta `v0.5.59`）：
  - 「修复」：会话内核心工具的超大输出现在统一进入体积预算：bash、read、write、edit 等内置工具在会话执行路径上此前未套用统一的 50KB+artifact 预算，超长结果会原样进入上下文；现在与其它工具一致——超限部分截断并以 artifact 引用落盘，read 截图在准入范围内照常内联，diff 展示不受影响。
