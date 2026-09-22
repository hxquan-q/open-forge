---
id: TASK-0002
type: task
status: done
priority: P0
owner: packages/ai
requirement: REQ-0002
plan: PLAN-0002
source_issue: ISSUE-0003
execution: parallel
branch: forge/dev
worktree: unassigned（直接在 forge/dev 主工作区执行）
base_commit: forge/dev
read_paths: [packages/ai]
write_paths: [packages/ai]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-22
---

# Provider 流协议回归 Fixture

## 目标

为 DeepSeek/OpenAI Responses 风格流建立错误事件关联、未知 output item、部分流、取消和重试 fixture。

## 验收

- `response.content_part.added targeted the wrong output item` 能稳定投影为 Provider failure；
- Team Member 不会等待已经失败的 Provider Turn；
- retryable/non-retryable 语义保持；
- 不运行真实 Provider。

## 测试

Provider stream 合同测试 + Agent Team terminal state 测试。

## 实际修改

- 新增 `packages/ai/src/testing/provider-stream-fixtures.ts`，自 `@vetta/ai/testing` 导出：
  - `sseFrames()` 把 wire 事件编码为 SSE 记录，`doneSentinel: false` 模拟断连；
  - `RESPONSES_STREAM_FAILURE_SCENARIOS`（9 个场景：content_part 落错 output item —— function_call 与 reasoning 两种线上回归形态、未知 output item delta、item_id 与 output_index 冲突、部分流、未完成 output item、terminal 后仍发事件、空流、流中 error 事件、`response.failed`）；
  - `COMPLETIONS_STREAM_FAILURE_SCENARIOS`（流中 `{error}` 帧、空流）与 `COMPLETIONS_PARTIAL_STREAM_CHUNKS`（钉住 Completions 断连仍按 `stop` 结算的既有不对称合同）；
  - `PROVIDER_HTTP_FAILURE_SCENARIOS`（429 可重试、503 可重试、402 计费不可重试、401 认证不可重试）；
  - `ProviderStreamFailure` 合同、`providerFailureError()`（把同一 failure 回放进 `ScriptedLanguageModelAdapter`，供 Session/Turn/Team 层测试不重放 HTTP）、`settleStreamOutcome()`（同时抽干事件流与 result promise，任一表面悬挂都会让测试超时失败而非静默通过）。
- 新增 `packages/ai/test/provider-stream-regression.test.ts`（35 个用例）：每个场景同时在 `streamModel`（native 表面）与 `stream()`（生产消费的兼容表面）上验证终态 `error`/`aborted` 事件、`AIErrorDetails` 字段、result 结算；另覆盖 pre-aborted / mid-stream abort（可控 SSE，无 sleep）、部分输出随终态失败保留、Team 分类所需的 `code`/`retryable`/`provider`/`modelId` 合同。
- Fixture 暴露并修复两处失败归因缺口（所有适配器向 Runtime/Team 投影失败时依赖 `provider`/`modelId`）：
  - `EmptyProviderStreamError` 构造器接受 `AIErrorOptions`，8 处抛出点（openai-responses、openai-completions、google-stream、google-gemini-cli×2、anthropic×2、amazon-bedrock×2）全部补上身份；
  - `openai-completions` 适配器 abort 归一化补齐 `provider`/`modelId`，与 anthropic/bedrock/google 等全部兄弟适配器对齐（此前是唯一遗漏者）。

## 验证记录

- `bun ../../scripts/quality/run-vitest.mjs --run test/provider-stream-regression.test.ts`：35/35 通过。
- 影响面回归（13 个文件，142 用例全绿）：openai-responses-adapters、openai-completions-relay-compat、deepseek-thinking、anthropic-bedrock-adapters、anthropic-messages、amazon-bedrock-messages、google-gemini-cli-empty-stream、google-gemini-cli-retry-delay、google-native-adapters、scripted-language-model、stream、stream-model、openai-codex-stream、openai-compatible-adapters。
- `bun run check:quick`：通过（仓库根存在与本任务无关的 0 字节未跟踪 `nul` 幻影文件，biome 对其报 io 诊断但不阻塞门禁）。
- `bun x tsgo --noEmit -p packages/ai/tsconfig.build.json`：通过。
- 未运行：`bun run check` 全量（移动端 lint 与全仓类型检查超出本任务影响面，已跑受影响包类型检查）；`test:live` 按验收要求不执行。

## 剩余风险

- `response.failed`/`error` 事件的 `providerCode` 透传依赖 SDK 错误对象字段，兼容网关若把错误码放在非标准位置可能丢失；场景断言已钉住标准形态。
- Team Member 侧「不再等待已失败 Turn」由 `failure` 上的 `code`/`retryable`/`provider`/`modelId` 合同保证（`runtime-core` 投影为 `RuntimeFailure`，`agent-team` 据此分类为自动重试或终态失败）；端到端 Team 生命周期测试属于 TASK-0003 及后续 deadline 任务范围。
