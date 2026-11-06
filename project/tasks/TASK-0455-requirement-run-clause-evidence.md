---
id: TASK-0455
type: task
status: draft
priority: P2
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0451, TASK-0454]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/tasks.mjs
write_paths:
  - scripts/agents/requirement-run.mjs
  - scripts/agents/requirement-run.test.mjs
  - schemas/agents/requirement-run.schema.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: []
conflicts_with: [TASK-0451, TASK-0452, TASK-0454]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# requirement-run 条款级证据关联（PLAN-0029 Phase 1.5）

## 目标

`requirement-check` 的证据从“路径存在”（`evidenceCheck: presence-only`）提升为与条款关联的可核对证据；工程完成、候选验证、人工验收、已发布四种状态分开记录。由 TASK-0451 原草稿拆出。

## 调查结论（2026-11-06，只读核对）

- `requirement-run.mjs` 的 `evidenceCheck()` 只校验仓库内非空、非 glob 的真实文件；`clauseView` 按 Task 的 integrated + verifying/done 计工程完成。
- 报告固定输出 `evidenceCheck: "presence-only"`、`semanticReview: "not-performed"`（schema 以 `const` 锁定，README 第 56 行同述）。
- 与 TASK-0451/0454 无代码依赖，但共享 `scripts/agents`，按 0451 → 0454 → 0455 串行。

## 范围

### 做（初稿，ready 前定稿）

- 证据条目可声明其覆盖的条款 ID 与证据类型（测试、Verification 记录、CI proof），检查证据确实引用该条款或绑定到对应提交。
- 报告区分 engineering / candidate-verified / human-accepted / released，不以 Task 状态推断人工验收。
- schema 的 `evidenceCheck` 随新校验级别更新；保留 `semanticReview: not-performed`，不宣称语义审查。

### 不做

- 不做模型驱动的语义判定；不改 Task 状态机。

## 待定（draft 原因）

- “条款关联”的最小可机读形式（证据文件内标记条款 ID，还是 manifest 侧声明 + 提交绑定）。
- 存量 coverage manifest 的兼容方式。

## 测试与验证

- 失败用例：证据未引用条款、证据绑定旧提交、人工验收缺失时不得报 accepted。
- `requirement-run.test.mjs` 与 `scripts/agents` 全量测试；`bun run check`。
