# 既有分析同步说明

本文件用于标记从 `open-vetta-main/exprot/` 同步到 `open-forge/exprot/` 的前置分析范围。

## 已同步的分析主题

1. **架构总览**：apps → coding-agent → runtime-* → agent-core → ai 的单向依赖；Definition → Snapshot → ModelCallFrame 三级能力编译；控制面/数据面分离；JSONL 事件溯源；显式 Lease 与 LIFO rollback。
2. **Agent Loop**：Gen A `Agent`/`agentLoop` 与 Gen B `runAgentTurn` 并存；生产路径使用 Gen B；`StatelessAgentCoreTurnEngine` 把 Runtime Snapshot、Tool Policy、Checkpoint、Queue 与 Agent Engine 接起来。
3. **Composition**：`runtime-composition` 的观察、Agent Definition、Tool Surface、Persistence、Session Initialization、Runtime Backend、Shutdown 和 Host Controls 装配链；`ModelCallFrameComposer` 负责 per-turn binding 和 per-model-call prompt/tool frame。
4. **Runtime 子系统**：MCP 指纹增量同步和 deferred `tool_search`；Subagent Pool/Dispatcher/Delivery/Recovery；Capability Token/Registry/Grant/Constraint/Audit；Agent Team Profile/Assignment/Roster/Shared Context。
5. **二开手册**：Provider、Coding Tool、Feature、Desktop IPC、Plugin、Skill、Theme、slash command、MCP、runtime 包的扩展位置、合同与验证命令。
6. **内核评估**：Open Vetta 的 `NOTICE` 记录其 `ai/agent/coding-agent/ecosystem-adapter` 源自 pi；推荐保留 Vetta Engine 和 `@vetta/ai`，Pi 作为 upstream，未来只通过 `TurnEnginePort` Adapter 条件接入。

## 当前目标的新增共识

前置分析回答“项目是什么、怎样二开”；本轮规划回答“要做什么产品、怎样不破坏现有 Runtime”：

- 本地 Desktop `work/coding` 双模式；
- Task 建立在 Session/Turn/Snapshot 上；
- Artifact 复用 ConversationRepository/Event Log 和文件事实源；
- Permission/Approval 是 Runtime 合同，不是 Prompt 约定；
- `.vetta/` 是共享配置，`.vetta-local/` 是本机信任/审批/缓存；
- 企业控制面和云端执行延期；
- Pi 暂不作为生产内核。

## 来源位置

- 原始分析目录：`C:\Users\xquan\Desktop\open-vetta-main\exprot\`
- 目标同步目录：`C:\Users\xquan\Desktop\open-forge\exprot\`
- 目标源码事实应以 `C:\Users\xquan\Desktop\open-forge\packages` 和 `apps` 为准。

详细主题文档请查看本目录的 `architecture-overview.md`、`agent-loop.md`、`composition.md`、`runtime-subsystems.md`、`secondary-development.md` 和 `kernel-replacement-feasibility.md`。
