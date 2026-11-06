---
id: TASK-0450
type: task
status: ready
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3179282c470bdb2ccab8d9bdbfb7ff836b5eb66a
read_paths:
  - docs/dev/agent-rules/collaboration.md
  - project/collaboration/development-workflow.md
  - scripts/agents/policy.mjs
  - scripts/agents/tasks.mjs
write_paths:
  - scripts/agents/integrate.mjs
  - scripts/agents/integrate.test.mjs
  - scripts/agents/prepare.mjs
  - scripts/agents/release.mjs
  - scripts/agents/release.test.mjs
  - scripts/agents/policy.mjs
  - scripts/agents/policy.test.mjs
  - project/autonomy-policy.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: []
conflicts_with: [TASK-0451, TASK-0452]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 研发控制器集成目标配置化（PLAN-0029 Phase 0.4 + 1.1）

## 目标

分支职责已在 `docs/dev/agent-rules/collaboration.md` 定义（本地 `main` 集成、`origin/dev` 开发候选、`origin/main` 稳定发布）。控制器在 `integrate.mjs:17`、`prepare.mjs:45`、`release.mjs:88` 三处硬编码 `main`，本 Task 把集成分支与远端候选目标改为由 `project/autonomy-policy.json` 声明，经 `validatePolicy` 校验。

## 范围

### 并发评估

- 结论：不支持与 TASK-0451/0452 并行（共享 `scripts/agents`）。
- 执行方式：serial
- 集成顺序：0450 → 0451 → 0452

### 做

- policy 新增 `integration` 字段：本地集成分支（默认值与现状一致为 `main`）、远端候选引用（`origin/dev`）。
- 三处检查改读 policy；错误信息包含期望与实际分支。
- `validatePolicy` 校验字段类型与分支名格式；缺失字段的处理按现有 policy 版本兼容规则决定并记录。
- 更新 `scripts/agents/README.md`，链接协作规则作为分支职责事实源。

### 不做

- 不改变分支职责本身，不推送，不触碰 `origin/main` 晋升。
- 不开启任何 capability 或 adapter。

## Given / When / Then

- Given：policy 声明集成分支为 `main`。
- When：控制器在 `main` / 非 `main` 检出上执行 prepare、integrate、release 前置检查。
- Then：`main` 上行为与现状一致；非 `main` 时拒绝并报出配置值；非法 policy 被 `validatePolicy` 拒绝。

## 必须保持

- 现有 `integrate.test.mjs`、`release.test.mjs`、`policy.test.mjs` 断言不削弱。
- 集成仍要求独立 Task worktree、租约有效和人工审批证据。

## 测试与验证

- 定向测试：先补失败用例（配置分支与检出不一致），再实现；`scripts/agents` 全量测试经仓库 runner。
- 质量检查：`bun run check`；`node scripts/quality/check-autonomy.mjs`（若适用）。

## 验收分层

- 工程验证：待执行
- 技术评审：未执行
- 集成：pending
- 人工功能验收：不适用（控制器内部合同）
- 发布：未授权
