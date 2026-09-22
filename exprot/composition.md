# Composition：产品能力如何装配成 Session

## 装配主链

```text
Observation Runtime
  → Agent Definition/Runtime Scope
  → Tool Surface + MCP Coordinator
  → Conversation Persistence
  → Session Initialization Transaction
  → RuntimeAgentSessionAssemblyBackend
  → RuntimeHost Backend
  → shutdown/controls
```

Session 初始化由 rollback scope 管理，资源按 LIFO 释放；失败、取消和部分初始化都必须有清理路径。

## Session 外设

包括：

- Agent Configuration/Mode/Profile；
- 平台 Specialized Tools；
- Plugin/MCP Runtime；
- Session Extensions；
- Plan Mode、Todo、Sandbox Authorization；
- Background Work；
- Execution Runtime；
- Memory/Compaction；
- Subagent Runtime；
- Context Runtime；
- Runtime Model。

## Turn Capability Assembly

`capability-session-assembly.ts` 把产品策略组合为 `RuntimeCapabilityDefinition`：

- Prompt Runtime；
- Tool Selection/Projection；
- Plugin/MCP Tool Runtime；
- Continuation Policy；
- Model Call Frame Composer；
- Tool Interception；
- Context Strategy/Compaction；
- Model Call Message Finalizer；
- Input Request Preparer；
- Session Extensions。

## ModelCallFrameComposer

### Turn 级 `bindForTurn`

冻结 Tool projection、MCP prompt state、active tool override、agent mode、Plugin/Extension lease、Tool wrapper 和可见性函数。

### Model Call 级 `compose`

```text
base tools
  → extension tools
  → plugin MCP tools
  → plugin tools
  → agent configuration filter
  → MCP visibility reconcile
  → active tool override
  → plugin orchestration
  → ordering/projection/interception
```

Prompt 经 draft → feature instructions → extension/plugin contribution → compile，生成 system prompt、cache layout、tool schemas 和 context composition sections。

## Task/Artifact 装配建议

- Task 状态机由 Runtime/Composition 驱动；Agent 只能发起建议。
- Artifact descriptor 是产品合同，文件内容和 Conversation/Event Log 是事实来源。
- Approval 使用 Runtime Policy/事件，不在 UI 或 Prompt 中私有实现。
- Work/Coding 通过不同 Profile/Tool Catalog/Prompt/Permission Set 复用同一个 Composition Root。
