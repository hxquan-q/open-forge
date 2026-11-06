---
id: TASK-0454
type: task
status: draft
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0451, TASK-0455]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/evidence.mjs
  - scripts/agents/doctor.mjs
  - schemas/agents/adapters.schema.json
write_paths:
  - scripts/agents/runner.mjs
  - scripts/agents/runner.test.mjs
  - scripts/agents/adapters.mjs
  - scripts/agents/adapters.test.mjs
  - scripts/agents/orchestrate.mjs
  - scripts/agents/orchestrate.test.mjs
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0451]
conflicts_with: [TASK-0451, TASK-0452, TASK-0455]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 评审独立：只读候选与独立上下文（PLAN-0029 Phase 1.3）

## 目标

评审独立性从“模型 family 不同”扩展为：独立上下文、未参与实现的身份、只读候选。由 TASK-0451 原草稿拆出。

## 调查结论（2026-11-06，只读核对）

- 已有：`evidence.mjs` 校验评审 actorId 不在 authors 中、family 不同（可配置），并以 digest 绑定 review.binding；“评审身份不在实现者集合”无需再做。
- 缺口：adapter `isolation` 可声明 `external-sandbox` / `read-only` / `none`，但 `adapters.mjs` 只拒绝 `none`，`read-only` 未被落实；`doctor.mjs` 也注明标签本身不可信。
- 评审与实现在同一 worktree 运行（`runner.mjs`），只靠评审前后 head/tree 不变检测改动。
- `orchestrate.mjs` 选择评审 adapter 时仅排除同 family，没有上下文标识。

## 范围

### 并发评估

- 结论：不支持并行（共享 `scripts/agents`）。
- 执行方式：serial；集成顺序 0451 → 0454 → 0455。

### 做（初稿，ready 前定稿）

- 评审在与实现分离的只读候选（detached 检出或只读副本）上运行；评审结束后候选 head/tree 与工作区均无变化，否则拒绝。
- review 记录新增 `contextId`，同一上下文不得既产出实现又产出评审。
- 明确 `isolation` 的可信来源：控制器能落实的才计入，单凭 adapter 声明不放宽。

### 不做

- 不启用真实 adapter（TASK-0452）；不改 checks/CI 绑定（TASK-0451）。

## 待定（draft 原因）

- 只读候选的实现方式：独立 detached worktree + 事后核对，还是文件系统只读权限；需权衡 Windows 下的可行性与清理成本。
- `contextId` 的来源与可信度（adapter 自报还是控制器生成）。

## 测试与验证

- 失败用例：评审修改候选、评审与实现共用上下文、仅声明 read-only 但未落实，均拒绝。
- `scripts/agents` 全量测试经仓库 runner；`bun run check`。
