---
id: BUG-0010
type: bug
status: done
priority: P2
owner: packages/coding-agent
source: MCP/skills 使用优化侦察（对照 Cursor / Claude Code）
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0009]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# MCP 工具风险描述符前缀拼错，全部 fail closed 到 L4（Trust 永远盖不掉）

## 用户流程

- Given：用户配置了 MCP server（如 filesystem），并在会话中授予 Trust 或直接批准。
- When：Agent 调用任意 MCP 工具（如 `mcp_filesystem_list_directory`，只读列举）。
- Then：应当按「外部工具档」请求 L3 逐次审批——用户可通过 Trust/会话授权免去重复确认。

## 实际行为

`defaultToolRiskDescriptor` 用 `toolName.startsWith("mcp__")`（双下划线）匹配 MCP 工具；而运行时命名约定是 `mcp_${serverName}_${toolName}`（单下划线，`runtime-mcp/src/tools/mcp-runtime-tool.ts:156`；同仓库另两处拦截器 `tool-interceptor-adapter.ts:100`、`ecosystem-hook-tool-wrapper.ts:104` 均正确使用 `mcp_` 前缀）。该分支永不命中，所有 MCP 工具落入「未知工具」分支，由 `evaluateToolRisk` fail closed 到 L4——**L4 任何 Trust 授权都盖不掉，永远逐次确认**（`shell-risk-rules.ts` 注释定义）。

## 期望行为

MCP/插件工具命中 `MCP_TOOL`（= `EXTERNAL_TOOL`）档：L3 逐次审批，Trust 可放行；未知工具仍 fail closed 到 L4 不变。

## 最小复现

`approval-tool-interceptor.test.ts` 新用例：审批端口收到 `mcp_filesystem_list_directory` 调用的 `level` 断言为 `"L3"`；修复前实测为 `"L4"`。

## 影响

自 L0–L4 风险矩阵接入起，所有 MCP 工具调用（包括只读类）都以最高档 L4 请求审批：审批卡片等级显示错误，且用户无法通过 Trust/会话授权为可信 server 免去重复确认——正好抵消了渐进披露体系配套审批设计的可用性。

## 根因证据

`tool-risk-descriptors.ts:89`：`startsWith("mcp__")` 双下划线拼写错误。同一前缀在 `mcp-runtime-tool.ts:156`、`tool-interceptor-adapter.ts:100`、`ecosystem-hook-tool-wrapper.ts:104` 均为单下划线。

## 回归测试

`packages/coding-agent/test/execution/permissions/approval-tool-interceptor.test.ts` 新增「MCP 工具按外部工具档请求 L3 审批，而非 fail closed 的 L4」用例（断言审批请求 `level === "L3"`）。

## 修复与验证

- 修复：`mcp__` → `mcp_` 单字符前缀修正。
- 测试：`approval-tool-interceptor.test.ts` 9/9（修复前新用例以 L4≠L3 失败，修复后全绿）。
- 未运行及原因：真实 Desktop 审批卡片 E2E 未跑（`verify:ui:*` 需用户明确授权）。
