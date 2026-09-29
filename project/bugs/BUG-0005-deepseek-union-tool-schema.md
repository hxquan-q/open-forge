---
id: BUG-0005
type: bug
status: done
priority: P1
owner: packages/ai
source: user-report; desktop dev session provider error
created: 2026-09-23
updated: 2026-09-25
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# DeepSeek 拒绝顶层无 `type` 的工具 schema，整轮回复中断

## 用户流程

- Given：用户在模型配置中使用 DeepSeek（`deepseek-flash` 等 `openai-completions-deepseek` 模型），会话中 `artifact` 等工具可用。
- When：用户发送消息，Agent 发起带工具列表的模型请求。
- Then：DeepSeek 返回 HTTP 400 `invalid_request_error`：`Invalid schema for function 'artifact': schema must be a JSON Schema of 'type: "object"', got 'type: null'`，界面显示「本次回复中断」（`AI_INVALID_REQUEST`）。

## 实际行为

只要工具列表里含有顶层 `type` 缺失的 schema（`artifact` 的 TypeBox `Type.Union` 序列化为 `{anyOf: [...]}`，顶层无 `type`），DeepSeek 就 400 拒绝整轮请求，回复中断。

## 期望行为

发往 OpenAI 兼容网关的 function `parameters` 顶层始终声明 `type: "object"`，DeepSeek 及其他严格网关正常接受。

## 最小复现

`convertTools`（`packages/ai/src/providers/openai-completions/messages.ts`）输入 `{ anyOf: [{ type: "object", ... }] }` 形式的工具 parameters，发出的 schema 顶层无 `type` —— 即回归测试「顶层只有 anyOf/oneOf 的联合 schema 补上 type: object」在旧实现上失败。

## 影响

- 范围：所有 `openai-completions` API 路径（DeepSeek 及转发到严格校验网关的自定义端点）；`artifact` 是必然命中的触发工具，但任何顶层 union/缺 `type` 的 MCP、插件工具同样会中招。
- 严重度：命中即整轮 400，用户无法继续会话。

## 根因证据

- `ArtifactToolInputSchema` 是 `Type.Union`（`packages/coding-agent/src/features/artifacts/artifact-tool-contract.ts`），序列化结果为 `{anyOf: [...]}`，顶层无 `type`；DeepSeek 校验器把缺失的 `type` 报为 `type: null`。
- 置信度：高。错误信息与 schema 形状一一对应；Anthropic 边界（`input_schema` 强制 `type: "object"`）与 Google 边界（`parametersJsonSchema`）均不受此影响，问题只在 `openai-completions` 出口。

## 回归测试

`packages/ai/test/openai-completions-tool-schema.test.ts` 新增 4 个用例，前 3 个在旧实现上失败：

- 顶层只有 `anyOf` 的联合 schema 补 `type: "object"`；
- 顶层 `type: null` 归一化为 `object`；
- 顶层缺 `type` 但有 `properties` 同样补齐；
- 顶层已声明非 object 类型时保持原样（不掩蔽工具自身合同问题）。

## 修复与验证

- 修复：`sanitizeToolParameters`（`packages/ai/src/providers/openai-completions/tool-schema.ts`）在剔除约束分支后，顶层 `type` 缺失或为 `null` 时补 `type: "object"`；纯增量归一化，不改写分支语义。
- 测试：`bun scripts/quality/run-vitest.mjs --run packages/ai/test/openai-completions-tool-schema.test.ts`（10/10 通过）；`bun run test:impact -- packages/ai/src/providers/openai-completions/tool-schema.ts packages/ai/test/openai-completions-tool-schema.test.ts`（20 个文件 215 用例通过）。
- 检查：`bun run check:quick` 通过。
- 未运行及原因：未做 DeepSeek 真实请求验证（需真实 API 凭证与费用，未获授权）；归一化只作用于 `openai-completions` 出口，其余 Provider 边界未动。
- 提交：`dc8571760`。

## 剩余风险

- 网关若对 `type: "object"` 之外还有更严格的 properties 约束仍可能拒绝，但属于网关方言差异，需要新证据再处理。
- `ArtifactToolInputSchema` 本身未改；若未来要求 Anthropic 路径也保留 union 语义，需要另行处理（当前 Anthropic `input_schema` 只取 `properties`/`required`，union 在那一侧本就降级，与本修复无关）。

发布说明：见 `.github/release-notes/v0.1.1.md`
