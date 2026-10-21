---
id: BUG-0134
type: bug
status: done
priority: P1
owner: coding-agent
requirement:
plan:
source: 用户提供的 ~/.openforge-dev/app-monitor/summary.json 与会话转录抽样；当前源码只读核对
related_requirement: []
related_plan: []
related_tasks: [TASK-0339]
related_issues: [ISSUE-0026]
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# browser_tab 校验失败只回泛化文案，单回合可把一次错误放大成 105 次

## 用户流程

- Given：用户在 Desktop 内置 Browser 页打开一个工作区页面，并让模型操作该页面。
- When：模型发出 `browser_tab` 调用，但入参不合法（缺 `action`、`navigate` 用 `file://`、或工具参数在流式阶段被解析成空对象）。
- Then：模型应得到可纠正的反馈（合法动作清单、最小合法示例、本地文件该走文件预览、无会话该先打开 Browser 页），并且在无进展的重复调用上被有界止损；用户最多看到少量失败，而不是上百条同义错误。

## 实际行为

- 累计统计：`browser_tab` 116 次调用、116 次失败、0 次成功（`~/.openforge-dev/app-monitor/summary.json`，统计自 2026-09-23 起累计）。
- 会话转录抽样 120 条真实工具结果：111 条 `AGENT_TOOL_INPUT_INVALID`（入参为 `{}`，全部为 glm-5.3-flash）、2 条 `navigate` 携带 `file://` 被拒、7 条 `no_browser_session`。
- 其中 105 条集中在同一个回合 `turn-527275e0-359d-40a2-b847-2e538fc96f77`：模型在收到同一条泛化错误后反复重发同一调用。
- 错误正文只有 `invalid browser_tab tool input`，`details` 只有 `{ "code": "AGENT_TOOL_INPUT_INVALID" }`，模型无法据此判断是缺字段、字段名写错、URL 协议不允许还是根本没有参数。
- 同一份统计里还出现 `"vetta action search\n</parameter>"` 这类畸形工具名条目，说明该会话的工具调用流本身也存在生成或解析异常。

## 期望行为

- 校验失败时返回可纠正信息，至少区分：缺 `action` / 非法 `action`（列出 9 个合法动作与 `{"action":"snapshot"}` 最小示例）、字段不合法或多余字段（点名合法字段）、`navigate` 非 http(s)（指向文件预览）、无会话（要求在当前工作区打开内置 Browser 页）。
- 保留严格 Schema 校验：不把 `{}` 猜成 `snapshot`，不为 `file://` 放开协议，不靠正则抢救畸形工具名。
- 对「相同工具 + 相同参数 + 相同确定性错误」做有界止损：连续 3 次后停止自动重试并返回明确原因；参数变化或新回合可恢复。
- 区分确定性错误与可恢复错误：`stale_reference` 的正常恢复、网络类可重试错误、取消与 stop 语义不受止损影响。

## 环境与失败证据

- 应用版本：Desktop 0.1.3（当前 main）。
- 提交：统计覆盖期跨多个提交，本条目只读核对当前 HEAD 的源码行为。
- 操作系统：Windows 11 Pro 10.0.26200。
- 失败证据：`~/.openforge-dev/app-monitor/summary.json` 的 `tools.byName.browser_tab`；`~/.openforge-dev/agent/sessions/**/*.conversation.jsonl` 中 120 条 `browser_tab` 工具结果抽样。
- 模型：glm-5.3-flash（111 条空对象）、qwen3.8-27b（2 条 `file://`）、qwen / deepseek-flash（7 条无会话）。
- 基线对照：同一抽样中 `browser_tab` 成功数为 0，说明该样本不能证明其他模型或环境下工具必然可用。

## 最小复现

1. 在带有内置 Browser 页的工作区发起一次模型回合。
2. 让模型调用 `browser_tab` 且入参为空对象 `{}`（或省略 `action`）。
3. 观察工具结果：仅 `invalid browser_tab tool input`，无合法动作清单、无示例。
4. 让模型原样重发同一调用：当前实现每次都会重新校验并返回同一条泛化错误，没有次数上限。

## 影响

- 单回合 105 条同义失败会挤占上下文与工具预算，任务无法推进，用户侧只看到一条读不懂的报错。
- 空对象入参同时掩盖了两类不同来源（模型没有生成参数 / 流式解析失败），让 Provider 侧归因无法开展。

## 根因证据

- `packages/coding-agent/src/features/browser-tab/browser-tab-tool.ts:30` 的 `validateInput` 只抛 `new Error("invalid browser_tab tool input")`；`execute` 的兜底分支同样是 `browserTabToolError("invalid_input", "invalid browser_tab tool input")`。
- `packages/coding-agent/src/features/browser-tab/browser-tab-tool-contract.ts:291` 的 `readBrowserTabToolInput` 把「元素引用解码失败」「Schema 不通过」「URL 协议不允许」三种原因都折叠成 `undefined`，调用方拿不到具体原因。
- `packages/coding-agent/src/features/browser-tab/browser-tab-tool-contract.ts:351` 的 `formatBrowserTabToolError` 对 `invalid_input` 只输出 `${code}: ${message}`，`no_browser_session` 只输出「WebView 不可用」，都不包含恢复步骤。
- `packages/agent/src/engine/tool-executor.ts` 的 `prepareToolCall` / `executeRuntimeToolCalls` 对每次调用都独立校验与执行，没有「相同调用 + 相同确定性错误」的连续失败计数。
- `packages/ai/src/utils/json-parse.ts:10` 的 `parseStreamingJson` 对空串和 JSON 解析失败都回退成 `{}`，因此转录中的 `{}` 不能单独证明模型没有生成参数；本条目只把它记为「工具调用生成或解析异常」，原始流式片段的离线夹具定位另立后续范围。

## 回归测试

- 旧实现必红：对 `{}` 入参调用 `validateInput` 得到包含合法动作清单与最小示例的错误；对 `file://` 的 `navigate` 得到指向文件预览的错误；无会话错误包含「打开当前工作区的内置 Browser 页」。
- 止损：同一工具 + 同一参数 + 同一确定性错误连续 3 次后，第 4 次不再执行并返回止损原因；改动参数后恢复执行；`stale_reference` 与可重试错误不触发止损。
- 保留严格校验：`{}` 不会被解释成任何动作，`file://` 仍然被拒。

## 修复与验证

- 修复：见 TASK-0339，已实现（`readBrowserTabToolInputResult` 可纠正文案 + `ToolFailureGuard` 有界止损，每回合重置）。
- 测试：见 TASK-0339 的定向测试清单；旧实现下缺 action 只会得到 `invalid browser_tab tool input`，新测试断言动作清单、示例与恢复步骤，因此必红。
- 检查：见 TASK-0339 的质量检查（定向 34 例、impact、根 tsgo、Desktop typecheck、check:quick 通过）。
- 未运行及原因：原始流式片段的离线夹具（区分缺参数、截断 JSON、参数分片、工具名分片）不在本次修复范围，未执行。
- 人工验收（2026-10-21）：用户随修复 Task（TASK-0339 / TASK-0340）确认验收完成，据用户结论闭合；批次记录见 TASK-0342。
