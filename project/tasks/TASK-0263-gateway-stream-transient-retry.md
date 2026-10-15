---
id: TASK-0263
type: task
status: verifying
priority: P1
owner: packages/ai
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream b28d4f4ee
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: main 工作区（写路径与在途 TASK-0260/0261/0262 不相交）
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md, packages/ai/src/protocol/errors.ts, packages/ai/src/provider-kit/provider-error.ts, packages/ai/src/providers/openai-responses/events.ts]
write_paths: [packages/ai/src/providers/openai-responses/events.ts, packages/ai/src/protocol/errors.ts, packages/ai/src/provider-kit/provider-error.ts, packages/ai/test, project/tasks/TASK-0263-gateway-stream-transient-retry.md]
exclusive_paths: [packages/ai/src/providers/openai-responses/events.ts]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 网关流内瞬时错误标记可重试（同步上游 0.5.62）

## 目标

经中转网关（sub2api 等）使用 OpenAI Responses 供应商时，上游瞬时故障（502 等）被网关包装为流内 `response.failed` 事件、不携带 HTTP 状态码，`isRetryableProviderFailure` 判为不可重试，自动重试直接放弃。对齐上游 `b28d4f4ee` 的修法：流内 `response.failed` 携带瞬时 provider code 时在抛错上显式挂 `retryable: true`，进入既有自动重试。

## 范围

### 并发评估

- 结论：支持（写路径与在途任务不相交）
- 执行方式：serial，main 工作区 pathspec 提交
- 可并行 Task：无（本批串行）
- 前置依赖：无
- 冲突文件/独占路径：`packages/ai/src/providers/openai-responses/events.ts`
- Branch：main；Worktree：不拆（主树该路径干净）
- 集成负责人：coordinator；集成顺序：本批第一项

### 做

- `events.ts` 的 `response.failed` 分支增加 `TRANSIENT_FAILED_CODES` 集合（upstream_error/server_error/internal_error/overloaded_error/rate_limit_error/service_unavailable/timeout），命中时抛错挂 `retryable: true`。
- 核对本仓 `normalizeProviderError`/`readRetryableOverride` 能消费该标记；若合同不通，最小打通（不改状态码分类语义）。
- 回归测试：旧实现下「流内网关 5xx 不重试」失败，新实现进入重试；非瞬时 code（如 `invalid_prompt`）仍不可重试。

### 不做

- 不引入 WebSocket 传输或传输方式设置（TASK-0266）。
- 不改 HTTP 路径的状态码分类与计费误判保护；不动 Codex 流（其错误形态不同，有证据再扩展）。
- 不改重试次数/退避策略。

## Given / When / Then

- Given：OpenAI Responses 供应商经中转网关，网关把上游 502 包装为流内 `response.failed`（code=upstream_error，无 HTTP 状态码）；When：模型调用消费该流；Then：错误被分类为可重试并按既有策略自动重试（默认 3 次指数退避），而不是首次失败即终止。
- Given：流内失败 code 不在瞬时集合（如参数/认证类）；When：消费该流；Then：仍判不可重试，语义不变。

## 必须保持

- 计费/额度类误报保护（`isProviderBillingFailure`）优先级不降。
- abort 仍不可重试；HTTP 状态码路径分类不变。
- 错误事件结构（code、responseBody）不变，只增 retryable 标记。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run` ai 包相关测试文件（新增回归 + 既有重试层测试）。
- 用户流程：无 UI 变化；以 fixture 流（`provider-stream-fixtures.ts` 模式）覆盖网关包装场景。
- 质量检查：`bun run test:impact`（ai 包面）→ `bun run check:quick`；批末完整 `bun run check`。

## 验收分层

- 工程验证：待执行；绑定上述命令与结果。
- 技术评审：自审；对照上游补丁形状与本仓 `readRetryableOverride` 消费链。
- 集成：pending；pathspec 原子提交。
- 人工功能验收：不适用（Provider 行为，真实网关回合不授权）；以 fixture 合同为准。
- 发布：未授权；交付时补 v0.1.3 发布说明（该文件在途改动多，落地时核对归属）。

## 功能验收包

- 入口与前置条件：配置 OpenAI 兼容网关 + Responses 供应商；fixture 层可复现。
- 操作步骤：触发网关包装的流内 502。
- 预期行为：自动重试后成功或耗尽重试报可重试错误。
- 不通过表现：首错即停、报不可重试。
- 验收反馈及回归案例：记回本 Task。

## 交付记录

- 实际修改：`packages/ai/src/providers/openai-responses/events.ts`（`TRANSIENT_FAILED_CODES` + `response.failed` 挂 `retryable: true`）、`packages/ai/test/openai-responses-adapters.test.ts`（7 码 × 3 Provider 变体红绿回归 + 非瞬时反例 + 声明头）、`packages/ai/src/testing/provider-stream-fixtures.ts`（`terminal-response-failed` 夹具期望由不可重试改为可重试，`mid-stream-error-event` 保持不可重试钉住边界）。
- 实际运行：定向 `run-vitest --run packages/ai/test/openai-responses-adapters.test.ts` 红 21 → 绿 67/67；`test:impact`（events.ts + 测试文件）19 文件/242 例通过；`check:quick` 除在途 TASK-0260~0262 未提交文件缺声明头（非本批）外全过。提交 `51c939ac1`，已推 `origin/dev`。
- 未运行及原因：真实网关回合未运行（真实 Provider 不授权）；完整 `bun run check` 因主树在途未提交文件门禁红，推送树为 HEAD 不含该红因。
- 发布说明：`v0.1.3.md` 当前含在途批未提交改动，本任务条目待该文件干净后补写（登记于本记录，不遗漏）。
- Worktree：不拆（主树写路径干净，与在途任务不相交）。
- 剩余风险：普通 `error` 事件（非 `response.failed`）的瞬时 code 仍不可重试——与上游修复范围一致，有证据再扩展；Codex 流错误形态不同，未覆盖。
