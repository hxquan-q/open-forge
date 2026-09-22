# Runtime 子系统同步版

## MCP

`runtime-mcp` 是产品无关的 MCP Port 和状态机；Node transport、文件配置和 OAuth 在 `runtime-node/mcp`。

`McpRuntimeToolSynchronizer` 通过 fingerprint 增量同步 Tool：未变化 binding 保留，删除/替换只影响受影响 Tool，刷新失败保持旧视图。

`McpDeferredToolController` 在工具数量超过默认阈值时只给模型工具索引和 `tool_search`，命中后激活工具，下一次 Model Call 可见。目录 generation 和 session-local activation 必须区分。

## Subagent

```text
Coordinator = Delivery + Dispatcher
Dispatcher = Pool + SubagentRun + Lifecycle
Pool = maxConcurrent + queue + drain
Delivery = terminal/batch notification + wait
```

Subagent 通过窄 `SubagentCoordinatorPort` 使用。它有 task name、generation、恢复、幂等投递、并发槽位和 disposal 合同。Work/Coding Task 可以调用 Subagent，但不能另造生命周期管理。

## Capability

`capability-sdk` 定义 Token、Schema、Module、Grant 和 Error；`capability-runtime` 负责 Registry、Provider binding、AccessSession、Constraint、Revoke、Abort 和 Audit。

默认拒绝、精确 Grant、版本匹配、fail-closed constraint、owner-scope 原子替换和审计是二开必须保持的不变量。

## Agent Team

`agent-team` 定义 Profile、Team、Assignment、Roster、Work Item、Shared Context 和投递事实；执行仍由 `runtime-subagents` 完成。Profile/Team 的 revision、assignment fingerprint 和 roster fingerprint 用于决定何时重建成员 Prompt。

## 对当前 MVP 的用法

- MCP：work/coding 通过 Profile 和 Project Policy 选择 Tool；高风险 Server/Tool 进入 Approval。
- Subagent：复杂 work 任务或 coding 研究任务才扇出，默认保守控制并发。
- Capability：Plugin/Renderer/宿主能力使用精确 Grant，不因“本地插件”自动扩权。
- Agent Team：企业版暂不实现；个人/小团队先使用项目目录的 Profile/Skill/Task Template/Git 协作。
