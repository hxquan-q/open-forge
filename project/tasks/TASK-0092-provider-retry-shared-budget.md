---
id: TASK-0092
type: task
status: done
priority: P0
owner: packages/ai
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `provider-retry.ts` 双轨共享预算 + `runtime.ts` claimProviderRetry 机制对照）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/ai/src, packages/ai/test, packages/agent/src, project/research/RESEARCH-0010-pi-desktop-borrowing-opportunities.md]
write_paths: [packages/ai/src, packages/ai/test, packages/agent/src]
exclusive_paths: [packages/ai/src]
depends_on: []
conflicts_with: [TASK-0091]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0091, TASK-0093]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Provider 双轨跨相共享重试预算与 retrying 活动态

## 目标

为 LLM 流式调用建立统一重试层：HTTP 429 与瞬态网络故障各持一条**跨 request 建立相与 stream 传输相共享**的重试预算（各 10 次），兑现服务端 `Retry-After`，重试期间发出轻量 `retrying` 活动态并复用同一消息气泡，仅在完整成功响应后清零预算；流 idle 看门狗纳入瞬态预算。

## 背景事实

- 参照（RESEARCH-0010 §5b，PI-Desktop `packages/agent-runtime/src/provider-retry.ts` + `runtime.ts`）：
  - `claimProviderRetry` 持 `providerRateLimitRetryAttempt` / `providerTransientRetryAttempt` 两条独立计数，各封顶 `PROVIDER_RETRY_MAX_RETRIES = 10`；**两条预算都跨 request/stream 两相共享，不因换相倍增或重置**；
  - 429 延迟：`retry-after-ms` > `Retry-After` 秒 > HTTP-date > `2s×2^n + 25% jitter`（30s 封顶）；transient：服务器声明优先，否则 1/2/4/8s（8s 封顶）；
  - `onRetry` → `setAgentActivity({phase:"retrying",attempt,retryDelayMs,error})`——轻量活动态不是消息行，重试复用同 bubble id；
  - **仅在完整成功响应时清零两预算**（收到 headers/部分输出不算）；`infiniteProviderRetry` 持久化 opt-in 可放开上限；
  - 180s 零事件看门狗把流掐成 `STREAM_FAILED` 并入 transient 预算，配套 `stallAbort` 杀死被放弃的旧请求避免一次回答两次计费；同 origin 连续两次无应答触发连接池重建。
- 本仓库现状：`packages/ai/src/protocol/errors.ts` 错误已带 `retryable` + `retryAfterMs` 字段（数据基础已备）；重试逻辑散落在个别 provider（`providers/google-stream/retry.ts`、`google-gemini-cli/retry.ts`），**无跨阶段统一预算**，标准 Provider 桥接遇 429 直接弹错打断长流程。

## 范围

### 并发评估

- **并发结论**：**条件支持**
- **执行方式**：serial（P0 链内串行；`packages/ai/src` 为本 Task 与 TASK-0093 的独占路径）
- **可并行 Task**：TASK-0094、TASK-0095
- **前置依赖**：无（但 TASK-0093 依赖本 Task 产出的重试层）
- **冲突文件/独占路径**：`packages/ai/src`（与 TASK-0093 顺序共享）；`packages/agent/src` 完结/投影区与 TASK-0091 重叠
- **Branch**：`forge/dev`
- **Worktree**：主工作区
- **集成负责人**：本 Task 执行者
- **集成顺序**：`TASK-0092 → TASK-0093`；与 TASK-0091 串行（先后均可）

### 做

- 在 `packages/ai` 建统一流重试适配层：429 轨与 transient 轨各 10 次预算、跨 request/stream 两相共享、完整成功才清零；
- 兑现 `Retry-After`（`retryAfterMs` 字段已存在，接上消费端）；瞬态退避含 jitter 与封顶；
- 重试事件以活动态（`retrying`，含 attempt/delayMs/error 摘要）上抛，`packages/agent` 侧复用同一 assistant message id，不新增消息行；
- 流零事件看门狗（时长参照 180s 量级，参数化）掐断为可重试失败并入 transient 预算，同时 abort 旧请求防双重计费；
- 兼容既有 per-provider 重试（gemini-cli 等）：统一层优先，旧路径收敛或明确分工，不出现双重退避。

### 不做

- 不做无限重试为默认（可留 opt-in 口子但不默认开）；
- 不改错误分类合同（`retryable`/`retryAfterMs` 语义不变）；
- 不覆盖 400/422 参数修复（TASK-0093 负责）；
- 不动 MCP/插件通道的重试。

## Given / When / Then

- Given：用户发起长编码任务，Provider 中途返回 429 或瞬态 5xx/TCP Reset；
- When：重试跨「请求建立」与「流式传输」两个阶段连续发生；
- Then：同一气泡显示轻量重试状态（第 N 次/等待时长），预算共享不叠加；恢复后正文继续填充；预算耗尽落明确可诊断错误而非无声卡死；完整成功后下轮调用预算已清零。

## 必须保持

- 取消语义：`AbortError`/用户取消立即终止且不计入预算、不重试（保持既有「取消不触发重试」修复先例）；
- 已收集部分内容（文本、tool call、thinking）在重试间不被强制清空（保持既有「部分流保留」修复先例）；
- usage/stop、toolCall 序、thinking signature 等流合同不回归；
- 各 Provider 现有协议级重试不与新预算叠加出双倍等待。

## 测试与验证

- 定向测试：`packages/ai/test/`（或既有测试目录约定）用可控时钟 + fake stream 覆盖——429 跨相共享预算计数、Retry-After 兑现、transient 独立轨、成功清零、耗尽落错、idle 掐断入 transient 轨、取消即停；
- 用户流程：长任务中连续 429 → 轻量重试态 → 恢复续流（`@vetta/ai/testing` fixture 复现矩阵）；
- 质量检查：`bun scripts/quality/run-vitest.mjs --run <相关文件>`、`bun run test:pkg ai`、`bun run check:quick`。

## 交付记录

- 实际修改：
  - `packages/ai/src/protocol/stream-event.ts`：新增 `AssistantMessageRetryEvent`（`type:"retry"`，含 `reason:"rate_limit"|"transient"`、`attempt`/`maxAttempts`/`delayMs`/`errorMessage`/`failure`）与 `ProviderRetryReason` 类型。
  - `packages/ai/src/types.ts`：`StreamOptions` 新增 `providerRetry?: { maxRetries?: number }`（默认每轨 10 次，0 关闭统一层，`Infinity` opt-in 无限）与 `streamIdleTimeoutMs?: number`（默认 180_000ms，0 关闭看门狗）。
  - `packages/ai/src/provider-kit/provider-retry.ts`（新增）：`streamWithProviderRetry` 统一重试层。每次 attempt 以 attempt 级 AbortController 重新打开 provider stream；`retry` 事件以活动态上抛；`start` 仅首个 attempt 透传，后续 attempt 的 partial 重基到同一 assistant 对象保留气泡身份；429 → rate_limit 轨（2s 指数 + 25% jitter，30s 封顶）、其他可重试失败 → transient 轨（1/2/4/8s 封顶）；`retryAfterMs` 服务端声明优先并按轨封顶，`maxRetryDelayMs` 声明超长即 fail-fast；两轨预算跨 request/stream 两相共享且只在完整 `done` 后结束；零事件看门狗把 attempt 掐成 transient 失败并 abort+drain 旧请求防双重计费；caller abort 即时终止不耗预算；预算耗尽原样透传最后一个失败。
  - `packages/ai/src/provider-kit/index.ts`：导出新模块。
  - `packages/ai/src/stream.ts`：`stream()`/`streamSimple()` 入口统一接入重试层；每次 attempt 强制 transport-local `maxRetries:0`，避免与统一层双重退避。
  - `packages/agent/src/loop/assistant-stream.ts`：`case "retry"` 以 `message_update`（同一 partialMessage 快照）上抛活动态；`case "start"` 防御性改为已存在 partial 时替换尾部而非新增消息行，保证重试感知流不产生重复消息行。
  - 测试：`packages/ai/test/provider-retry.test.ts`（16 例：429 跨 request/stream 共享预算、Retry-After 兑现、两轨独立、耗尽落错、idle 看门狗入 transient + 旧请求 abort、sleep 中/流中取消即停、partial 同一对象、retry 事件形状、`streamSimple` 端到端连续 429 恢复 + transport `maxRetries:0` 内层禁用、`providerRetry:{maxRetries:0}` 关闭）；`packages/agent/test/assistant-stream-retry.test.ts`（2 例：retry 事件不产生第二消息行、二次 start 复用 bubble）；`packages/ai/test/protocol-contract.test.ts` 穷举 switch 增加 `retry`；`packages/ai/test/provider-stream-regression.test.ts` 公开面分类测试显式 `providerRetry:{maxRetries:0}` 保持终端分类语义。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run packages/ai/test/provider-retry.test.ts`：16/16 通过。
  - `bun scripts/quality/run-vitest.mjs --run packages/ai/test/protocol-contract.test.ts packages/ai/test/provider-stream-regression.test.ts packages/ai/test/provider-retry.test.ts`：61/61 通过。
  - `cd packages/agent && bun ../../scripts/quality/run-vitest.mjs --run test/assistant-stream-retry.test.ts`：2/2 通过。
  - `bun run test:pkg ai`：62 文件 / 471 测试全绿（含 `@vetta/ai` tsgo 构建）。
  - `bun run test:pkg agent`：18 文件 / 108 测试全绿。
  - `bunx tsgo --noEmit`：本变更相关文件 0 错误；仓库基线另有 6 个无关既有类型错误（`packages/coding-agent`、`packages/runtime-node`、`packages/runtime-storage` 测试文件）。
  - `bun run check:quick`：变更文件 Biome 与架构守卫全绿。
- 未运行及原因：
  - `bun run check` 全量门禁：留待 TASK-0091 完成后统一执行；`check:types` 当前存在与本次无关的基线失败。
- 剩余风险：
  - `stream()`/`streamSimple()` 默认启用统一重试：可重试失败的最长重试窗口为预期行为；追加型事件通道（`assistant.event` 文本 delta）在中段重试时会把旧 attempt 已流出内容与新 attempt 内容拼接显示，执行观察与最终消息始终正确。
  - `streamModel`/`generateModel` 原生表面不经 `stream()` 入口，不在统一层覆盖范围；生产 Agent 路径走 `streamSimple` 已覆盖。
  - `retry` 事件经 `assistant.event` 通道透传为 SessionEvent（`type:"retry"`），`apps/desktop` 渲染层尚未消费（范围外），活动态对 SDK/RPC 消费者可见。
