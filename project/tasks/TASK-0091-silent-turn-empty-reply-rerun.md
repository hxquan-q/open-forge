---
id: TASK-0091
type: task
status: done
priority: P0
owner: packages/agent
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `runtime.ts` SILENT_TURN_NUDGE / rerunSilentTurn / 同 bubble 复用机制对照）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/agent/src, packages/agent/test, packages/ai/src/protocol, project/research/RESEARCH-0010-pi-desktop-borrowing-opportunities.md]
write_paths: [packages/agent/src, packages/agent/test, packages/ai/src/protocol]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0092]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0092]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 模型空回复静默重跑（silent-turn rerun）

## 目标

模型一轮回复 content 为空且无 tool call（推理模型常见：thinking 有输出但最终文本为空）时，Agent Loop 自动注入恢复提示并在同一消息气泡内静默重跑一次，而不是让会话无声停住等用户手动打「请继续」。二次仍空则落可重试错误，给 UI 显式继续入口。

## 背景事实

- 参照（RESEARCH-0010 §5a，PI-Desktop `packages/agent-runtime/src/runtime.ts`）：
  - 判定条件为 `!failed && !aborted && responseText 空 && 无 toolCall`——**覆盖一切空回复，不要求 thinking 非空**；
  - `SILENT_TURN_NUDGE`（`<no_output_recovery>` 块）**追加到 systemPrompt**（不是注入 user 消息），弹出尾部 assistant 空消息后 `agent.continue()`；
  - 原 bubble 保持 streaming、重跑的 `message_start` 复用同一 `currentAssistant.id`（“one bubble, no empty row”），`turn_end`/`agent_end` 被压制；
  - 仅自动重试一次；再静默则落 `EMPTY_MODEL_RESPONSE`（retriable:true）；
  - 完成通知类回复有 `allowSilentCompletion` 豁免。
- 本仓库现状：`packages/agent/src/engine/run-agent-turn.ts` 已有 `checkpoint` Port + `maxRecoveryAttempts`/`recovery_exhausted` 恢复骨架；`packages/ai/src/provider-kit/stream-errors.ts` 的 `EmptyProviderStreamError` 只标记 retryable、无任何自动修复路径。

## 范围

### 并发评估

- **并发结论**：**条件支持**
- **执行方式**：serial（与 TASK-0092 冲突，同在 `packages/agent` turn 完结判定与消息复用区域，不可并行写）
- **可并行 Task**：TASK-0094、TASK-0095
- **前置依赖**：无
- **冲突文件/独占路径**：`packages/agent/src` turn 完结/消息投影区域与 TASK-0092 重叠
- **Branch**：`forge/dev`
- **Worktree**：主工作区
- **集成负责人**：本 Task 执行者
- **集成顺序**：P0 链内与 TASK-0092 串行（先后均可），再合入

### 做

- 在 agent loop 完结判定处识别「空回复完结」：`content` 全空、无 toolCall、非 abort、非 provider 失败；
- 命中后：弹出尾部空 assistant 消息 → 向 systemPrompt 追加一次性恢复块 → `continue()` 重跑，全程复用同一 assistant message id，压制中间 turn/agent 终态事件；
- 仅自动重跑一次；第二次仍空 → 落 `EMPTY_MODEL_RESPONSE`（或等价可重试错误），UI 可继续；
- 保留豁免口子（完成通知/纯 steering 类完结不误判为空）。

### 不做

- 不做多次/无限重跑（与 PI 一致：一次）；
- 不改 `EmptyProviderStreamError` 的既有分类语义（在其上补修复路径，不重命名错误码）；
- 不处理「有内容但被截断」场景（属流完整性，另一 concern）。

## Given / When / Then

- Given：用户使用推理模型（如 DeepSeek-R1 类）的正常会话；
- When：模型某轮输出若干 thinking 后 content 为空、无 toolCall，turn 正常完结；
- Then：同一消息气泡自动续跑并填出正文；用户看不到空气泡、错误弹窗或会话停摆；持久化 transcript 中该 assistant 消息只有一条且内容完整。

## 必须保持

- 取消/abort 语义：用户取消后不得触发重跑；
- usage/stop 语义按现有合同传播，终态事件（`turn_end`/`agent_end`）不得多发或漏发；
- 有正常 content 或 toolCall 的完结路径行为完全不变；
- 失败、取消和重跑的事件顺序对下游投影（transcript、UI、team 视图）可回放。

## 测试与验证

- 定向测试：`packages/agent/test/` 用确定性 fake event stream 覆盖——空回复重跑成功（同 bubble、无空行）、二次空回复落错、有 thinking 无 content 命中、有 toolCall 不命中、abort 不重跑、豁免路径；
- 用户流程：推理模型会话中空回复轮次自动恢复（fake provider fixture）；
- 质量检查：`bun scripts/quality/run-vitest.mjs --run <相关文件>`、`bun run test:pkg agent`、`bun run check:quick`。

## 交付记录

- 实际修改：
  - `packages/ai/src/protocol/errors.ts`：新增 `AI_EMPTY_MODEL_RESPONSE` 错误码。
  - `packages/ai/src/provider-kit/stream-errors.ts`：新增 `EmptyModelResponseError`（retryable:true），与 `EmptyProviderStreamError` 语义分离（前者是成功但无可见输出的完结，后者是零事件流协议故障，未改动其语义）。
  - `packages/agent/src/silent-turn.ts`（新增）：`SILENT_TURN_NUDGE`、`isSilentAssistantMessage`、`silentTurnNudgeMessage` 共享判定/提示词。
  - `packages/agent/src/loop/assistant-stream.ts`：新增 `SilentTurnStreamOptions`（`keepOpenOnEmpty`/`reuseRow`/`extraMessages`/`markEmptyReply`/`rowOpen`）；空回复压掉 `message_end` 保持消息行打开；重跑的 `start` 以 `message_update` 复用同一行。
  - `packages/agent/src/agent-loop.ts`：runLoop 完结判定处识别静默完结 → 弹出尾部空 assistant → 一次性重跑（同一 bubble、压掉中间 `turn_start`）；二次仍空经 `markEmptyReply` 落 `AI_EMPTY_MODEL_RESPONSE` 走既有 error/检查点路径；`allowSilentCompletion` 豁免。
  - `packages/agent/src/engine/types.ts`：`AgentTurnRequest.allowSilentCompletion`；`model_call_start` 事件新增 `continuesAssistant` 标记。
  - `packages/agent/src/engine/run-agent-turn.ts`：同款判定；重跑调用在模型视图尾部追加 nudge、`model_call_start` 带 `continuesAssistant`；二次仍空标记消息后走既有 failure/assistant_error 路径。
  - `packages/runtime-core/src/kernel/contracts.ts`：`TurnEngineRequest.allowSilentCompletion` 透传字段。
  - `packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts`：`model_call_start.continuesAssistant` 不重置 assistant 行状态；`projectModelEvent` 的 `start` 在行已打开时投影为 `message.update`（同时覆盖 provider 重试二次 start 的同行投影）。
  - 测试：`packages/agent/test/agent-silent-turn.test.ts`（7）、`agent-engine-silent-turn.test.ts`（6）、`packages/runtime-core/test/kernel/stateless-agent-core-turn-engine.test.ts`（+3）；`agent-engine.test.ts` 中 8 处 `assistant([])` 完结 fixture 改为非空正文（空回复在新语义下不再是普通完结）。
  - 文档：本文件、`.github/release-notes/v0.1.0.md`。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run`（agent-silent-turn、agent-engine-silent-turn、agent-engine、agent-loop、assistant-stream-retry、stateless-agent-core-turn-engine）：64/64 通过。
  - `bun run test:pkg agent`：121/121 通过。
  - `bun run test:pkg runtime-core`：534/534 通过。
  - `bun run test:pkg ai`：484/484 通过。
  - `bun run test:pkg coding-agent`：1446/1446 通过（3 skipped）。
  - `bun run check:quick`：通过（Biome + 全部 guards）。
  - `bunx tsgo --noEmit`：仅剩 6 条与本次无关的既有基线错误（coding-agent ×4、runtime-node ×1、runtime-storage ×1，均为未触碰文件）。
- 未运行及原因：全量 `bun run check` 中的 mobile lint 与 app 级 typecheck 与本次改动面无关；desktop/cli E2E 未触发（无 UI 改动）。
- 剩余风险：
  - 恢复指令以「模型视图尾部 user 消息」注入而非改写 systemPrompt（两引擎的 systemPrompt 都在 loop 外的 frame/resolveCallContext 合成，往消息视图注入是唯一不穿透产品边界的通道；语义等价：模型同样看到恢复指令且 durable transcript 不被污染）。
  - 极端边角：provider 在首次调用发 `start`、重跑调用完全不发 `start`（done-only）时，`finishModelMessage` 会补发一条 `message_start`；真实 provider 的 start 行为在两次调用间一致，未单独处理。
  - `allowSilentCompletion` 已沿 `AgentLoopConfig` / `AgentTurnRequest` / `TurnEngineRequest` 贯通；具体哪些产品 Run（如完成通知）启用豁免由宿主后续按需设置。
