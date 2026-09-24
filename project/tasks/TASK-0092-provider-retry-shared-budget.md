---
id: TASK-0092
type: task
status: ready
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
integration_status: pending
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
- 实际运行：
- 未运行及原因：
- 剩余风险：
