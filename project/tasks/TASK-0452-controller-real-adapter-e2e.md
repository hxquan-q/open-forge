---
id: TASK-0452
type: task
status: in_progress
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0450, TASK-0451, TASK-0456]
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
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 真实 adapter 端到端验收任务（PLAN-0029 Phase 1.4）

## 目标

启用一个真实 adapter，拿一个低风险 Task 跑通“独立执行 → 只读评审 → 修复 → 远端候选 CI → 集成 `origin/dev`”，并证明运行的不是 mock：代码提交、评审对象、CI 对象三者一致（依赖 TASK-0451 的绑定）。

## 待定决策（2026-11-07 定稿，依据用户 2026-11-06 提供的端点与授权）

- adapter 与模型：新增 `qwen-http` wrapper（`scripts/agents/model-adapter.mjs`，OpenAI-compatible HTTP，无 shell、文件工具限定 Task write paths），指向用户提供的内部端点 `qwen3.8-27b`；baseUrl/apiKey 存 `E:/forge-controller/adapter.config.json`（仓库外，不入库、不记录）。
- policy：`level: 2`、`capabilities: [implement, review, verify, integrate-dev]`、`allowedProviders: [openai-compatible]`；满足 integrate-dev 最低 level 2。
- 评审隔离：`differentReviewerFamily: false`（同一模型兼任实现与评审，如实记录偏离）。缓解：评审 actorId 按 attempt 唯一、评审在 detached 候选副本执行、binding head/tree 一致性校验、assertDistinctContext。
- 样本任务：TASK-0456（autonomy 文档同步推送后候选核验；`docs/dev/agent-rules/**` 命中 tests-and-guards 闸门，需操作者签名 approval，顺带演练人工闸门导入）。
- 隔离声明：`isolation: external-sandbox` 为 wrapper 层约束（无 shell、路径受限、固定 git 子命令），非 OS 沙箱；执行边界由操作者签名的 execution proof 如实背书。

## 不做

- 不接自动发布、不开放团队租约与并行调度。
- 不把单次成功写成控制器达到目标 level。

## 验收

- 运行记录包含真实 adapter 调用证据（命令、模型、输出摘要、耗时、费用），无 mock fixture。
- 集成到 `origin/dev` 的提交 SHA 与评审、CI 记录一致；失败时如实记录阶段与原因。
