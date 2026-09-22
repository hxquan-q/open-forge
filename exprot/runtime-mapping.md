# Task / Artifact 到 Runtime 的映射设计

## 1. 核心原则

Task 不是第二套 Agent Runtime。它是建立在现有 Session、TurnPipeline、Snapshot 和事件持久化之上的产品工作流投影。

```text
Task
  └── rootSessionId
        └── Turn 1
        └── Turn 2
        └── Turn N
              └── RuntimeSnapshot generation
                    └── Model Calls / Tool Executions / Observations
```

一个 Task 可以关联一个根 Session，也可以通过现有 Conversation continuation 机制跨 Conversation 续接；但每个活动 Turn 仍必须由既有 `TurnPipeline.runTurn` 驱动。

## 2. Task 创建和执行

```text
用户提交目标
  → RuntimeHost/Composition 创建 Task projection
  → 创建或绑定 root Session
  → Task 进入 planning
  → Agent 通过普通 Turn 生成计划
  → Runtime 校验计划并进入 awaiting_approval 或 running
  → 每个执行步骤进入既有 Turn/Tool Loop
  → message/observation/event 投影回 Task
  → 生成 Artifact descriptor
  → awaiting_review / completed
```

Agent 不直接写 Task status。它只能：

- 通过结构化 Tool 提交计划；
- 请求 Approval；
- 报告建议的状态转换；
- 生成 Artifact；
- 请求暂停、继续或人工接管。

最终状态转换由 Runtime Host 或产品 Composition 中的状态机执行。

## 3. Snapshot 和 generation

每次 Turn admission：

1. `snapshotProvider.acquire({ reason: "turn" })` 获取 Lease；
2. Tool、MCP、Skill、Plugin、Prompt 和 Permission 绑定同一 generation；
3. Task 记录当前 `generation` 和 `turnId`；
4. Turn 内不得读取新的外部 revision；
5. 普通配置变化在下一 Turn 生效。

Task 不应持有可变 Snapshot 对象，只保存可序列化的 identity 和观察结果。

## 4. Artifact 持久化

第一阶段不引入独立 Artifact 数据库：

```text
文件存储 / ConversationRepository
  ├── 原有 Session JSONL 事实
  ├── artifact.created / artifact.updated / artifact.validated 引用事件
  └── descriptor projection
```

Artifact 文件内容由已有文件存储/宿主环境管理；Artifact descriptor 和生命周期事件由现有 ConversationRepository/Event Log 记录。若后续发现跨 Session 查询、版本索引或大规模协作成为瓶颈，再引入独立 Repository，并通过迁移器保持旧事件可读。

## 5. Permission 和 Approval 接入点

```text
模型准备 Tool Call
  → Tool Schema validation
  → Tool Policy.authorize
  → 风险评估（默认等级 + 参数/资源提升）
  → Permission Grant 检查
  → Approval Request（需要时）
  → Tool execute
  → execution observation / details / Artifact projection
```

不能只在 Prompt 中告知模型“危险操作要确认”。真正的授权必须位于 Tool 执行前的 Runtime Policy/Approval 接缝。

## 6. 未来 Pi Adapter 接缝

当前 `TurnEnginePort` 是深模块 Seam：调用者只需理解 `execute` 的请求、事件、取消和终态合同，内部可以替换循环实现。

未来建议：

- 在 `ComposedRuntimeFactoryOptions` 增加通用 `createTurnEngine` 工厂 Port；
- `runtime-core` 只认识 `TurnEnginePort`，不认识 Pi；
- `coding-agent` 只向下传递引擎配置，不拥有 Pi 适配实现；
- 新建上层 Adapter 包，例如 `runtime-pi-adapter`，依赖 Runtime 合同和 Pi；
- Desktop/CLI Composition Root 选择 Vetta Engine 或 Pi Adapter；
- Pi Adapter 必须映射 Message、Tool、Policy、Checkpoint、Abort、Observation 和 Error；
- 不使用 Pi Harness 的第二套 Session/Storage 作为第一阶段替换方案。

这符合当前 `runtime-core` 与 `coding-agent` 的所有权规则：Runtime 拥有 Port，产品拥有策略，Composition Root 选择 Adapter。

## 7. 所有权表

| 行为 | 所有者 |
|---|---|
| Task 状态合法转换 | Runtime/产品状态机 |
| Model/Tool Loop | Agent Engine |
| Task 目标和 work/coding 语义 | coding-agent |
| Tool 风险描述 | runtime-tools / 产品注册 |
| 是否授权 | Runtime Tool Policy |
| 是否需要用户确认 | Approval Policy / Host |
| 本机路径和 Sandbox | runtime-node / Desktop Composition |
| Artifact 文件 | File/Conversation Storage Adapter |
| Artifact descriptor | 产品合同 + Runtime 事件投影 |
| UI 审批展示 | Desktop Renderer |
| Pi 选择 | Composition Root |
