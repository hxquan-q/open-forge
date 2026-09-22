# 架构总览：Open Forge / Open Vetta

## 一句话定位

这是一个本地优先的桌面 AI Agent 产品栈：宿主应用负责装配，`coding-agent` 负责产品语义，`runtime-*` 负责通用运行机制，`agent-core` 负责模型-工具循环，`ai` 负责 Provider 协议。

```text
apps/*
  ↓
coding-agent
  ↓
runtime-core / runtime-*
  ↓
agent-core
  ↓
ai
```

## 所有权原则

- `runtime-core` 拥有 Session、Turn admission、Queue、Snapshot、Conversation Document、生命周期和 Port，不拥有 Todo、Coding Prompt、知识库或 Desktop I/O。
- `agent-core` 只拥有单次模型-工具循环，不拥有 Session、持久化、产品 Feature 或平台 I/O。
- `coding-agent` 拥有 Profile、Prompt、Mode、Todo、Memory、Skill、Plugin、MCP 产品策略和 Feature。
- `runtime-tools` 只拥有平台无关 Tool 合同；Node/fs/process 实现在 `runtime-node`。
- Apps 是最终 Composition Root，不被 packages 反向依赖。

## 三级能力编译

```text
RuntimeAgentDefinition  session 级产品组合
        ↓ bindForTurn
RuntimeSnapshot         turn 级不可变 generation
        ↓ compose
ModelCallFrame          单次模型调用的 Prompt/Tool frame
```

`bindForTurn` 是动态能力冻结点。外部 Tool/MCP/Skill/Plugin/Prompt 变化默认从下一 Turn 生效；当前 Turn 允许观察自己产生的消息、Tool result 和 deferred activation。

## 控制面与数据面

```text
TurnPipeline
  admission → snapshot → load → context → execution → finalization
                                      │
                                      ▼
                             TurnEnginePort
                                      │
                                      ▼
                 Agent Engine → Provider Stream → Tool Loop
```

`TurnPipeline` 拥有持久化、阶段、取消、失败和终态；Agent Engine 只执行一次模型-工具循环。每条消息即时追加到 Repository，取消/失败也必须写终态事件。

## 事件溯源

```text
turn.started
  → context.appended
  → message.appended(user)
  → message.appended(assistant/tool)
  → turn.completed | turn.cancelled | turn.failed
```

JSONL/Event Log 是恢复事实。Tool `content` 是模型可见通道，`details` 是 UI/Host 结构化通道。

## 当前产品演进约束

本次目标不重写 Runtime，而是在既有 Session/Turn/Snapshot 上增加 Task、Artifact、Permission 和 Review 投影。Pi 暂不作为生产内核；未来仅在 `TurnEnginePort` 之后以 Adapter 方式评估。

## 关键入口

- `packages/runtime-core/src/kernel/contracts.ts`
- `packages/runtime-core/src/kernel/turn-pipeline.ts`
- `packages/runtime-core/src/runtime-host/composed-runtime-factory.ts`
- `packages/coding-agent/src/composition/runtime-composition.ts`
- `packages/coding-agent/src/composition/turn/capability-session-assembly.ts`
- `packages/coding-agent/src/model-context/model-call-frame-composer.ts`
- `apps/desktop/src/main/agent-runtime/composition.ts`
