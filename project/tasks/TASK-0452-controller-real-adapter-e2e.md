---
id: TASK-0452
type: task
status: draft
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0450, TASK-0451]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - project/agents.json
  - project/autonomy-policy.json
  - scripts/agents/adapters.mjs
  - scripts/agents/doctor.mjs
  - docs/dev/agent-rules/autonomy.md
write_paths:
  - project/agents.json
  - project/autonomy-policy.json
  - scripts/agents
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0450, TASK-0451]
conflicts_with: [TASK-0450, TASK-0451]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 真实 adapter 端到端验收任务（PLAN-0029 Phase 1.4）

## 目标

启用一个真实 adapter，拿一个低风险 Task 跑通“独立执行 → 只读评审 → 修复 → 远端候选 CI → 集成 `origin/dev`”，并证明运行的不是 mock：代码提交、评审对象、CI 对象三者一致（依赖 TASK-0451 的绑定）。

## 待定（draft 原因，需用户决定）

- 使用哪个 adapter 与模型（`agents.json` 中 codex / claude 现为 `enabled: false`、`model: unconfigured`）；调用真实模型会产生费用，需明确授权。
- policy `level` 与 `capabilities` 开到什么程度（当前 `level: 0`、`capabilities: []`）。
- 实现者与评审者是否跨厂商；评审身份如何隔离。
- 选哪个低风险 Task 作为样本。

## 不做

- 不接自动发布、不开放团队租约与并行调度。
- 不把单次成功写成控制器达到目标 level。

## 验收

- 运行记录包含真实 adapter 调用证据（命令、模型、输出摘要、耗时、费用），无 mock fixture。
- 集成到 `origin/dev` 的提交 SHA 与评审、CI 记录一致；失败时如实记录阶段与原因。
