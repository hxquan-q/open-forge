---
id: BUG-0095
type: bug
status: verifying
priority: P1
owner: packages/ai
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（team 成员 turn AI_INVALID_REQUEST 秒拒）
related_requirement: []
related_plan: []
related_tasks: [TASK-0230]
related_issues: []
related_bugs: [BUG-0091]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# `transformMessages` 不冲刷消息列表结尾的孤儿 tool_calls，严格 provider 永久拒绝该会话

## 用户流程

- Given：会话历史末尾残留一条带 `toolCall` 块、但没有对应 `toolResult` 的 assistant 消息（典型来源：工具执行中途进程被杀/检查点超时，assistant 消息已持久化而工具结果未写入；或上下文裁剪丢结果留调用）。
- When：下一次发送按历史构造 provider 请求。
- Then：期望 `transformMessages` 与中段孤儿调用同等待遇——补一条合成 `toolResult`；实际二遍只在「后随 assistant/user 消息」时冲刷 `pendingToolCalls`，列表在悬挂调用处结束则原样放行，严格校验的 provider 秒拒，之后**每一次**请求同样失败，会话永久残废。

## 实际行为

`transform-messages.ts` 第二遍跟踪 `pendingToolCalls` 并在两个分支冲刷：assistant 分支（130-148 行）与 user 分支（181-198 行）；循环结束即 `return result`，末尾仍挂着的 pending 调用无任何尾刷。`Message` 只有 user/assistant/toolResult 三种角色，尾部是唯一漏网路径。日志实证（team 成员会话 `aee41199` 成员 `2730d9dc`，2026-10-09）：

```
failureCode: 'AI_INVALID_REQUEST'  elapsedMs: 2136（秒拒、不可重试）
error: "An assistant message with 'tool_calls' must be followed by tool
       messages responding to each 'tool_call_id'."
```

`transformMessages` 被全部 provider 共用（openai-completions/openai-responses/anthropic/google/bedrock），受影响面是全模型；DeepSeek（openai-completions 通道）实锤拒绝。

## 期望行为

二遍循环结束后若 `pendingToolCalls` 非空，按既有合成格式（`role:"toolResult"`、`isError:true`、文本 `"No result provided"`、匹配 `toolCallId`/`toolName`）为缺结果的调用补尾——与中段冲刷同一不变量：离开 transform 的消息流不出现无结果 tool_call。

## 环境与失败证据

- `temp/log/openforge-main-2026-10-09.log`：`[agent-team-member-turns] team member runtime returned failed outcome` `failureCode:'AI_INVALID_REQUEST'`，provider 原文「insufficient tool messages following tool_calls」，`elapsedMs: 2136`（首轮即拒）。
- 同会话多次失败 → `non-retryable-failure`；BUG-0091 的恢复只补终态标记，不修复历史投影中的悬挂调用，恢复后请求仍被拒。

## 最小复现

```ts
transformMessages([{ role:"assistant", content:[{type:"toolCall", id:"call_1", name:"read", arguments:{}}], stopReason:"toolUse", ... }], model)
// 旧实现 → 返回的列表仍以无结果 toolCall 结尾；新实现 → 末尾追加合成 toolResult
```

## 影响

上游任一生产者留下悬挂调用（中断回合、裁剪丢结果、外部导入历史），该会话对该 provider 永久不可用；team 模式下成员级联表现为 `non-retryable-failure` 且用户无任何可操作的恢复入口。

## 根因证据

- [`transform-messages.ts`](../../packages/ai/src/providers/transform-messages.ts) 120-205 行：两遍结构，二遍仅 assistant/user 分支冲刷 pending，无循环后尾刷；`pendingToolCalls` 在 `return result` 时被静默丢弃。
- 置信度：高（代码路径确定；唯一未定点是悬挂调用的具体上游生产者，属防御层覆盖范围而非修复前提）。

## 回归测试

`packages/ai/test/transform-messages-orphan-tool-calls.test.ts`：尾部单调用补合成结果、尾部多调用部分有结果只补缺失 id、中段冲刷行为不变。旧实现下尾部断言失败（红基线：列表仍以 toolCall 结尾）。

## 修复与验证

- 修复：见 [TASK-0230](../tasks/TASK-0230-transform-tool-calls-tail-flush.md)。`transformMessages` 二遍的两处冲刷块收敛为 `flushPendingToolCalls()` 局部 helper，循环结束后无条件尾刷——`pendingToolCalls` 仍挂起时按同一合成格式补 `isError` toolResult，「离开 transform 的消息流无孤儿调用」不变量补全。
- 测试：`transform-messages-orphan-tool-calls.test.ts` 4/4 过（尾部单调用补合成、尾部多调用部分有结果只补缺失、中段冲刷防回归、尾部 aborted 不补——该消息整体跳过）；红基线：两个尾部用例在旧实现下分别以「列表仍含 toolCall」/「无 call_2 合成结果」失败。
- 全量：ai 包单测 520/520 过；impact（transform-messages.ts）384 例过。
- 检查：root `tsgo --noEmit` + ai `tsconfig.build.json` 绿；`check:lint` 绿。
- 验证边界：悬挂调用的具体上游生产者（中断持久化时序 vs 上下文裁剪）未实锤——修复走防御层兜底，不依赖定位生产者；aborted/error assistant 尾部消息整体跳过的既有语义未变（其调用不跟踪、不补）。
