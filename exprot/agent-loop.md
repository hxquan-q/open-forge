# Agent Loop：两代循环与 Runtime 桥接

## Gen A 与 Gen B

| | Gen A | Gen B 生产路径 |
|---|---|---|
| 入口 | `Agent` / `agentLoop` | `engine/runAgentTurn` |
| 状态 | 有状态、就地更新 Context | 无状态、依赖从 Request 注入 |
| 终态 | 超限/错误多以异常 | `completed`、`max_model_calls`、`recovery_exhausted`、`aborted`、`failed` |
| 调用方 | legacy TUI/兼容 API | runtime-core Kernel |
| 能力 | steering、follow-up、checkpoint | per-call resolver、tool validation、limits、observer、abort salvage |

## Gen B 的执行形态

```text
runAgentTurn(request)
  → model call
  → assistant stream
  → tool validation/policy
  → tool execution/result
  → steering/follow-up
  → next model call
  → run_finish
```

请求注入 `resolveModelCall`、`resolveTools`、`toolPolicy`、`checkpoint`、队列读取、limits 和 observer。这样 Agent Engine 不拥有产品 Prompt、Tool Catalog、Session 或持久化。

## TurnPipeline 阶段

```text
admission
→ snapshot_binding
→ conversation_loading
→ context_assembly
→ context_preparation
→ execution
→ finalization
```

`TurnPipeline` 在执行阶段调用 `TurnEnginePort.execute`，接收 message/observation/completed 事件，并将消息逐条追加到 Repository。

## Runtime 桥

`StatelessAgentCoreTurnEngine` 把 Runtime Snapshot、ModelCallFrame、Tool Policy、Queue、Checkpoint 和 `@vetta/ai` Stream 映射给 Gen B，再把 Agent Execution Event 投影回 Runtime 的 message、observation 和 execution observation。

必须保持：

- AbortSignal 沿模型、Tool、Checkpoint 传播；
- partial assistant 内容在取消时按现有合同保留；
- tool `content/details` 分离；
- usage/stop/failure 语义不变；
- Snapshot generation 与 Tool/Prompt/MCP 绑定一致。

## 对新 Task 的约束

Task 只是在 TurnPipeline 之上的状态和投影，不应修改 Agent Engine 的基本合同。Task Plan、Approval、Artifact 和 Review 通过 Context/Observation/Session Event/产品 Tool 接入。
