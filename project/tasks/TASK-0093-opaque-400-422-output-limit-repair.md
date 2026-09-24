---
id: TASK-0093
type: task
status: ready
priority: P0
owner: packages/ai
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `provider-retry.ts` `isOpaqueBadRequest`/`stripOutputLimitFields` 机制对照）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/ai/src/providers, packages/ai/test, project/research/RESEARCH-0010-pi-desktop-borrowing-opportunities.md]
write_paths: [packages/ai/src, packages/ai/test]
exclusive_paths: [packages/ai/src]
depends_on: [TASK-0092]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0092]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 400/422 输出上限字段剥离静默重试

## 目标

第三方反代或新模型对 `max_completion_tokens` / `max_output_tokens` 等输出上限字段不兼容而返回 400/422 时，底层自动剔除**自动派生的**输出上限字段并静默重试一次，避免普通用户因参数不兼容直接报错。

## 背景事实

- 参照（RESEARCH-0010 §5c，PI-Desktop `packages/agent-runtime/src/provider-retry.ts:76-119,455-488`）：
  - 触发条件**很窄**：`PROVIDER_ERROR && !retriable && status ∈ {400,422} && message 匹配 opaque "(no body)"`；
  - 仅一次修复尝试（`limitRepairTried`），**不消耗重试预算**；
  - `stripOutputLimitFields`/`withoutDerivedOutputLimit` 只剥「auto 派生」的输出上限，不剥用户显式设定的值。
- 本仓库现状：`packages/ai/src/providers/openai-completions/request.ts:62-63`、`openai-responses/request.ts:56`、`azure-openai-responses/request.ts:55` 等组装 `max_tokens`/`max_completion_tokens`/`max_output_tokens`；无 400/422 修复路径，参数不兼容即直接报错给用户。

## 范围

### 并发评估

- **并发结论**：**条件支持**（依赖 TASK-0092 的重试层落位）
- **执行方式**：serial
- **可并行 Task**：TASK-0091、TASK-0094、TASK-0095
- **前置依赖**：TASK-0092（复用其统一重试适配层）
- **冲突文件/独占路径**：`packages/ai/src`（随 TASK-0092 顺序集成）
- **Branch**：`forge/dev`
- **Worktree**：主工作区
- **集成负责人**：本 Task 执行者
- **集成顺序**：`TASK-0092 → TASK-0093`

### 做

- 在请求/重试层识别窄触发：不可重试的 400/422 且响应无可用错误体（opaque）；
- 命中后剔除请求中**自动派生**的输出上限字段（`max_tokens`/`max_completion_tokens`/`max_output_tokens`），静默重试一次；
- 修复尝试不占 TASK-0092 的双轨预算；仍失败则按原错误路径抛出；
- 覆盖 OpenAI Completions/Responses、Azure 及其他使用该字段的 provider 组装点。

### 不做

- 不放宽触发条件（不做「任何 400 都剥字段重试」）；
- 不剥用户显式设置的输出上限（只剥 auto 派生值）；
- 不重复重试（一次）。

## Given / When / Then

- Given：用户配置了某第三方反代或新模型，该端点对 `max_completion_tokens`/`max_output_tokens` 报错；
- When：agent 发起请求被以 400/422（opaque）拒绝；
- Then：底层自动剥除输出上限字段重试一次，成功则正常流式输出、用户无感知；仍失败则抛出原错误，不出现隐藏重试循环。

## 必须保持

- 用户显式设置的 token 上限不被剥离；
- 重试一次即停，失败错误信息不丢失原始 status/body 线索；
- 其他 4xx（401/403/404 等）与可重试错误路径完全不受影响。

## 测试与验证

- 定向测试：`packages/ai/test/` 覆盖——opaque 400/422 命中剥字段重试成功/失败仍抛原错、显式上限不剥、非 opaque 400 不触发、只重试一次；
- 用户流程：反代模型会话首发请求即被 400 拒绝 → 自动恢复（fake transport 复现）；
- 质量检查：`bun scripts/quality/run-vitest.mjs --run <相关文件>`、`bun run test:pkg ai`、`bun run check:quick`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
