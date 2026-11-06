---
id: TASK-0451
type: task
status: draft
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0450]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/evidence.mjs
  - scripts/agents/orchestrate.mjs
  - scripts/agents/runner.mjs
  - scripts/agents/requirement-run.mjs
  - .github/workflows
write_paths:
  - scripts/agents
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0450]
conflicts_with: [TASK-0450, TASK-0452]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 候选提交、CI 运行与评审证据绑定（PLAN-0029 Phase 1.2/1.3/1.5）

## 目标

集成前要求三者指向同一对象：远端最终候选提交 SHA（及树哈希）、该 SHA 上的 CI 运行结论、评审所针对的提交。评审独立性从“模型厂商不同”（`orchestrate.mjs:20-21`）扩展为独立上下文、未参与实现的身份与只读候选权限。`requirement-run.mjs` 的 `evidenceCheck: "presence-only"` 改为条款级证据关联。

## 待定（draft 原因）

- CI 结果的读取方式：GitHub Actions API（`gh run`）还是 Codeup Flow（TASK-0404/RESEARCH-0045），需先核实当前实际门禁来源。
- 评审只读权限的实现：只读 worktree、文件系统权限或 adapter 侧 sandbox，需对照 `adapters.mjs` 的 `isolation` 字段现状。
- 是否拆成三个 Task（绑定 / 评审独立 / 条款证据）：调查后决定，默认拆分以保持可单独回滚。

## 做（初稿）

- 证据记录新增 `candidate: { sha, tree, remoteRef }`、`ci: { runId, sha, conclusion }`、`review: { sha, tree, identity, contextId }`；集成前校验三者 SHA/树一致。
- 评审身份不得出现在实现者集合中；评审 worktree 只读。
- 工程完成、候选验证、人工验收、已发布四种状态分开记录。

## 不做

- 不启用真实 adapter（TASK-0452）；不接自动发布。

## 验证

- 失败用例：SHA 不一致、CI 针对旧提交、评审者与实现者同身份，均拒绝集成。
- `scripts/agents` 全量测试；`bun run check`。
