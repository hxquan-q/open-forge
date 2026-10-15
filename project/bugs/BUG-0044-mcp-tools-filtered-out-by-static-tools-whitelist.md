---
id: BUG-0044
type: bug
status: done
priority: P1
owner: packages/coding-agent agent-configuration
requirement: REQ-0007
plan:
source: dev 实机会话中 @mcp:universal-db 提问，模型明确报告没有可用的 MCP 工具
related_requirement: [REQ-0007]
related_plan: []
related_tasks: [TASK-0086]
related_issues: []
created: 2026-09-27
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# 已装 MCP 连接器的工具被会话静态 tools 白名单全部挡掉，模型永远看不到它们

## 用户流程

- Given：用户在能力页添加「通用数据库」连接器，连接参数已保存、server 可正常连接
- When：在任意会话里用自然语言要求查询/分析数据库
- Then：模型可看到并调用 `execute_query`/`get_schema` 等工具完成查询

## 实际行为

模型工具面里完全没有 MCP 工具。会话档案（`015cb1a6`）显示模型 thinking 明确写出「I don't have MCP tools listed in my available functions」，随后只能靠 read/grep 翻文件系统找 mcp.json，空手而归后向用户报告连接器不可用。

## 期望行为

已配置的 MCP server 的工具对会话开箱可见；收口由 `mcpServers` 选择轴承担（null=跟随宿主全部、[]=禁用、list=按 server 白名单），内置工具 `tools` 名单只管内置工具。

## 根因

会话的 agent configuration 里 `overrides.tools` 是 work/coding Profile 折算出的**静态内置工具名单**（28 个名字）。三处闸门把这份名单同时套到 MCP 工具上：

1. `transaction.ts` 给 `mcpController.setToolFilter` 的谓词要求 `allowsAgentResource(configuration.tools, tool.name)` 且 server 命中 `mcpServers`；
2. `createAgentToolSelection`（资源选择最终交集）同样先过 `selectedTools` 再查 server；
3. `context-assembly.ts` 的 `readInheritedMcpView`（子智能体继承父会话 MCP 视图）同一交集——子智能体/Agent Team 同样看不到 MCP 工具。

而 MCP 工具名由 server 运行时上报（`execute_query` 之类），任何配置界面都不可能把它们预先写进 `tools` 名单——交集必然为空，所有已装 MCP server 的工具对模型不可见。上游 `resource-selection.test.ts` 的交集测试证实这是有意的旧语义，但它与「安装连接器即可用」的产品目标矛盾。

## 回归测试

`resource-selection.test.ts` 新增一条：`tools: ["read"]` + `mcpServers: null` 时，catalog 里归属 `universal-db`/`other-db` 的动态工具全部可见（旧实现下全部不可见）；`mcpServers: ["universal-db"]` 收窄与 `mcpServers: []` 全禁不变。原交集用例保持通过（denied server 与无 serverName 描述符仍被拒）。

## 修复与验证

- 修复：新增共享谓词 `allowsAgentMcpTool`——`serverName` 已知的 MCP 工具只由 `mcpServers` 约束；无 `serverName` 的描述符维持旧的 `tools ∩ mcpServers` 交集。`createAgentToolSelection`、`transaction.ts` 的 `setToolFilter`、`context-assembly.ts` 的 `readInheritedMcpView` 三处统一改用它，语义收敛为单一事实源（含子智能体继承路径）。
- 测试：`resource-selection.test.ts` 8 用例全绿；`check:quick`（Biome + 全部架构守卫）通过；dev 重启后 `universal-db` server 正常拉起、会话重建、无 MCP 报错。
- 未运行及原因：`verify:ui:*` 未跑（需用户明确授权）；模型侧「看得见工具」需用户在会话中实际追问确认。
- 影响面：显式 pin 了 `tools` 名单的会话现在会看到 `mcpServers` 允许的全部 MCP 工具；需要「无 MCP」的智能体可把 `mcpServers` 设为 `[]`。
