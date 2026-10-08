---
id: TASK-0190
type: task
status: done
priority: P1
owner: runtime-core
source: user-request; RESEARCH-0022; upstream 94d7e1381
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0071]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts, packages/runtime-core/test/runtime-host/running-changed-reason.test.ts]
write_paths: [project/bugs/BUG-0071-recovered-turn-stale-error.md, packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts, packages/runtime-core/test/runtime-host/running-changed-reason.test.ts, project/tasks/TASK-0190-recovered-turn-terminal-reason.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 恢复成功的回合清除错误终态

## 目标与范围

适配上游 94d7e1381 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

运行回合先收到真实 error，随后 assistant done 成功，再 agent_end；宿主报告正常结束，最后失败/中止仍保持正确原因。

## 必须保持

不删除旧事件兼容路径；保持取消、usage、订阅缓冲限额与观察者失败隔离。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

红测：Node runner + runtime-core config，running-changed-reason.test.ts 2 失败/9 通过；真实 runtime/assistant 错误后成功 done 均错误残留 error。

绿测：`bun scripts/quality/run-vitest.mjs run --config packages/runtime-core/vitest.config.ts running-changed-reason.test.ts runtime-host-session-event-relay.test.ts session-event-subscriber-queue.test.ts`，3 文件/26 测试通过；保留旧事件兼容、取消和回放/订阅队列上限。

完整检查发现新增真实事件 fixture 缺少 schemaVersion/eventId（TS2322）；不增加类型断言，补齐 SessionEventBase 元数据后复验。此前定向运行通过不等于类型检查通过。

类型补齐后复验：对应定向测试通过；根 `bun x tsgo --noEmit` 与 Desktop `typecheck:incremental` 均通过，未使用 any/断言绕过。最终完整 check 仍由批次重跑。

### 人工验收实测（2026-10-07，VERIFY-0017 组一，保持 verifying）

方法：给隔离 Debug Profile 装一个可控故障的 provider，用真实 UI 观察「回合先出错、随后恢复成功」与「回合最终失败」两侧的宿主终态。

- 夹具：`<debug vettaHome>\fixtures\fault-mock\server.ts`（`Bun.serve` 127.0.0.1:8792，实现 openai-responses 的 `POST /v1/responses` SSE，事件形状抄自仓内 `app-debug/runtime-canary/provider.ts`；控制面 `GET /control/fail?ms=` / `/control/failcount?n=&minBytes=` / `/control/partial?n=` / `/control/ok`，每次请求按时间戳落 `requests.ndjson`）。
- 注册：停机 → 隔离 profile `agent/models.json` 加 provider `faultmock`（`baseUrl=http://127.0.0.1:8792/v1`、`api=openai-responses`、模型 `fault-mock-1`）→ `verify:ui:start:debug`。启动时应用把内联 `apiKey` 迁移为 `credentialRef`，模型选择器出现「Fault Mock / Fault Mock 1」并可直接选中。
- 环境要点：新会话首回合从点「发送」到第一个 provider 请求约 **+10 秒**（运行时冷启动，`requests.ndjson` 时间戳可证），所以按时间窗注入会打空，必须改成按次数注入（`failcount` / `partial`）。

三组注入与观察：

1. **请求级 500（可重试传输故障）**：回合进入 `正在重新连接（1/3 → 2/3）｜上次请求失败：服务方暂时出了点问题`；主进程日志 `runtime turn retry { phase:'scheduled', attempt:1, maxAttempts:3, delayMs:2000, failureCode:'AI_TRANSPORT_FAILED', failureOrigin:'provider' }`（02:47:13）与 `attempt:2, delayMs:4000`（02:48:26）。把夹具切回健康后 `runtime turn retry { phase:'completed', attempt:2 }`（02:48:36），该回合以**正常结束**收尾。
2. **会话记录（conversation JSONL）里的真实形状**：重试的每一次都是**另起回合**——`turn-2ff52761` `turn.failed(AI_TRANSPORT_FAILED "500 fault mock injected failure")` → `turn-71af1002` `turn.failed(同)` → `turn-a10f1c7f` `message.appended(assistant 文本)` + `turn.completed(stopReason:"stop")`。UI 上看到的「一个回合」在记录里是「失败回合 ×2 + 成功回合 ×1」。
3. **助手内容产出后中途断流（不可重试）**：`turn.failed { code:'AI_TRANSPORT_FAILED', origin:'provider', retryable:false, retryAttempts:0, message:'net::ERR_CONNECTION_RESET' }`，不再自动重连，直接给出 `session-interrupt` 决策 `{ action:'notify', state:'error', trigger:'error' }`。

两侧用户可见面：

- 恢复侧：`FAULT-ERR-0190-A`（02:46:09）先显示重连原因，恢复后该回合以普通助手消息渲染（`FAULT_MOCK_OK：这是故障恢复后的正常回复。`）、composer 回到空闲、无错误横幅；当天主进程日志中**唯一**一条 `Session interrupt decision` 属于最终失败的回合而非它（即没有把已恢复回合的旧错误当终态上报）。
- 最终失败侧：错误卡片「网络没连上／检查一下网络或代理，然后重新发送」、底部「上次回复未完成：网络没连上」+「继续」、通知「会话回复中断」，原因正确保留。
- 截图：`<artifactDir>\0190-faultmock-session.png`（同一屏同时呈现「恢复回合 = 普通助手消息」与「失败回合 = 错误卡片」的对照）。

未闭合原因：GWT 的「同一回合先收到真实 error、随后 assistant done 成功」在本机没能构造出来——runtime 的重试在会话记录里是**另起回合**（观察 2），而 relay 的 `terminalReason` 缓冲在 `agent_start` 处重置（`runtime-host-session-event-relay.ts:113-121`），要命中 `buffer.terminalReason = "error"` → 后续 assistant `done` 清错这一分支，需要在**同一 agent_start…agent_end 跨度内**先出现 error 事件、之后仍产出 assistant done（例如多步工具回合中某步报错而循环继续），这类前置需注入内核事件，UI 侧无法稳定构造。relay 分支本身由 `running-changed-reason.test.ts` 的真实事件序列 fixture 覆盖（交付记录：旧实现 2 失败/9 通过 → 修复后 3 文件 26 例通过）。故本条保持 `verifying` 交用户裁定。

夹具复用提示：该 provider 与 `failcount`/`partial` 控制面可复用于任何需要「可控 provider 故障」的条目（实例 profile 已注册，重启不丢）。

### 恢复分支可达性判定（2026-10-08，VERIFY-0017 组一续测十五，保持 verifying）

上一轮把「同一回合先收到真实 error、随后 assistant done 成功」记为「需注入内核事件，UI 侧无法稳定构造」。本轮改为从实现判定该形状在生产路径上**是否可达**（只读代码，不改实现）：

- relay 的清错分支只有一处：`runtime-host-session-event-relay.ts:149-152`——assistant 通道的 `error` 事件置 `terminalReason = "error"`，随后的 assistant `done`（`stopReason !== "aborted"`）把它清回 `undefined`；`agent_end` 用 `buffer.terminalReason ?? "agent_end"` 上报（`:132-137`）。所以只有「同一 `agent_start…agent_end` 跨度内先 error 后 done」才需要这条分支。
- 该形状的唯一生产构造点在 `packages/agent/src/agent-loop.ts:231-247`：assistant `stopReason === "error"` 时先发 `turn_end`，**仅当 `config.contextCheckpoints` 为真且 checkpoint 恢复返回 `retry`** 才 `continue` 续跑，之后才可能产出正常 `done`。
- `contextCheckpoints` 在整仓（排除 `dist/`）只有四处引用：`packages/agent/src/types.ts` 的类型声明、`agent-loop.ts` 的两处消费、以及 `packages/agent/test/agent-loop-limits.test.ts`/`agent-loop-continue.test.ts` 的测试；**没有任何生产装配把它置真**。默认关闭也在变更记录与设计文档中写明（`packages/agent/CHANGELOG.md:40`、`docs/agent/coding-agent/05-greenfield-rewrite/08-implementation-log/70-model-call-compaction-orchestrator.md:64`）。
- 非 assistant 通道的 error（relay `:124`）确有生产来源——`runtime-host-session-operations.ts:123/178` 的合成 agent 通道错误、`composed-runtime-factory.ts:231` 的取消超期——但其生产者都紧跟 `agent_end` 或直接抛错结束回合，不会在之后产出 `done`，因此同样不构成该形状。
- **结论**：GWT 期望的形状在当前生产装配下不可达，该分支是防御性代码，由 `packages/runtime-core/test/runtime-host/running-changed-reason.test.ts` 的真实事件序列覆盖（交付记录：旧实现 2 失败/9 通过 → 修复后 3 文件 26 例通过）。用户可见面的价值已由上一轮实测覆盖：重试后恢复的回合以普通助手消息渲染、不残留错误横幅；最终失败的回合保留正确原因与中断通知。
- 本项保持 `verifying`：是否接受「不可达的防御分支由单测覆盖」作为验收口径，交用户裁定。

### 标志位载体可达性补证（2026-10-08，VERIFY-0017 组一续测二十一，保持 verifying）

上一节的判定是「没有任何生产装配把 `contextCheckpoints` 置真」——这仍是**配置性**论证（没人设），不是**构造性**论证（设不了）。本轮只读代码，把「能携带该标志的对象是否可能在生产里被建出来」查到底：

- `AgentLoopConfig` 在生产里只有**一处**构造点：`packages/agent/src/agent.ts:462-495`，是逐字段显式字面量（`model`/`reasoning`/`sessionId`/`transport`/`thinkingBudgets`/`maxRetryDelayMs`/`limits`/`tracer`/`tracing{…}`/`convertToLlm`/`transformContext`/`getApiKey`/`getSteeringMessages`/`getContinuationMessages`/`getTools`/`getSystemPrompt`/`salvageTextToolCalls`）。它既不含 `contextCheckpoints`，也**不展开任何调用方传入的对象**（无 `...options` 之类），故任何可编辑配置（含用户侧 JSON）都无处加这个键。
- 读该标志的三处（`agent-loop.ts:233`、`:287`、`assistant-stream.ts:59`）都只在 `agentLoop`/`agentLoopContinue` 内；这两个入口全仓唯一调用者就是同一个文件（`agent.ts:502-503`）。
- 承载它的 `Agent` 类**在生产源码里从未被实例化**：全仓 `new Agent(` 只有两处——`packages/agent/src/proxy.ts:75` 是文档示例（`@example` 代码块），`packages/ai/src/utils/proxy-dispatcher.ts:45` 是 undici 的 `Agent`（无关）。该类经 `packages/agent/src/index.ts` 导出，是给库消费者/节点扩展（`packages/coding-agent/src/host/extensions/node-extension-factory-loader.ts` 以命名空间整体注入）用的 API 面。
- 生产回合走的是**另一条引擎**：runtime-core `StatelessAgentCoreTurnEngine`（`packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts:60`；`AgentCoreTurnEngine` 只是它的空子类）→ `runAgentTurn(AgentTurnRequest)`（`packages/agent/src/engine/run-agent-turn.ts:39`）。这条路径**不构造 `AgentLoopConfig`**（runtime-core 内只有对该类型的 `import type`）。
- 且这条路径的「checkpoint」与该标志无关：`run-agent-turn.ts:334-356` 的实现是**宿主回调**——`if (!request.checkpoint) return undefined`（`request.checkpoint?: AgentCheckpointHandler`，`engine/types.ts:172`，配套 `limits.checkpointTimeoutMs`，`types.ts:22`），即生产 checkpoint 由「调用方给不给回调」决定。
- 生产引擎里唯一展开调用方选项包的地方是 `stateless-agent-core-turn-engine.ts:222-229` 的 `...this.options.streamOptions`；它组装出的 `effectiveStreamOptions` 只投向 **provider 流函数**（`streamFn(model, context, {…effectiveStreamOptions, apiKey})`），不进任何 loop config——即便有人往里塞多余键，也落在一个该标志从不被读取的对象上。

结论升级：该分支在本仓生产接线里**不可达是构造性的**（能携带它的对象根本不会被建出来），而非「碰巧没人开」。仍保持 `verifying`：是否接受「生产不可达的防御分支由单测覆盖（`running-changed-reason.test.ts` 的真实事件序列）」作为验收口径，归用户裁定。同时如实说明它**不是可删的死代码**——`Agent` 类与这条 loop 是随包发布的库 API，库消费者或节点扩展自行构造 `Agent` 并置真时会走到该分支（本仓生产接线不走，故不影响本次验收的用户可见面）。

### 用户裁定（2026-10-08）：接受该口径，闭合为 `done`

用户在 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 组一收口轮裁定：**接受**「生产不可达的防御分支由单测覆盖」作为本项验收口径。

- 验收依据：① 用户可见面已实测——重试后恢复的回合以普通助手消息渲染、不残留错误横幅，最终失败的回合保留正确原因与中断通知（2026-10-07 故障夹具三组注入）；② 该防御分支由 `packages/runtime-core/test/runtime-host/running-changed-reason.test.ts` 的真实事件序列覆盖（旧实现 2 失败/9 通过 → 修复后 3 文件 26 例通过）；③ 分支不可达已给出**构造性**证据（`AgentLoopConfig` 唯一构造点 `packages/agent/src/agent.ts:462-495` 为显式字面量、无注入面；承载类 `Agent` 生产源码零实例化；生产引擎走 `runAgentTurn` 且其 checkpoint 为宿主回调）。
- 遗留说明（不阻塞验收、不另立 Task）：该分支随包发布，库消费者置真时会走到，故**不得按死代码删除**；若未来本仓出现 `Agent` 类的生产装配，须按本 Task 的 GWT 重跑事件序列回归。
- 状态：`verifying` → `done`。集成 `pending` 不变，稳定发布未授权；工程合同面/CI 层面的复跑仍归 TASK-0187 批次。
