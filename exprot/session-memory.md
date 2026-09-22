# 会话记忆同步

## 工作目录

- 当前二开目标仓库：`C:\Users\xquan\Desktop\open-forge`
- 原始分析目录：`C:\Users\xquan\Desktop\open-vetta-main\exprot`
- 本文件是面向后续 Agent 的精炼记忆，不复制完整对话历史中的系统规则和工具输出。
- 目标仓库本轮开始时已有用户改动（`CLAUDE.md`、当前版本发布说明和未跟踪的 `exprot/`）；当前分支为 `main`。
- 本轮完成了 Desktop 星轨装饰球的生产路径下线，保留 `OrbitOrb` / `OrbitOrnament` 组件接口供后续恢复；未提交、不推送。

## 已完成的源码理解

Open Vetta 是 Bun/Turbo TypeScript monorepo，核心分层为：

```text
apps / Desktop / CLI / IM
        ↓
coding-agent 产品组合层
        ↓
runtime-core / runtime-* / capability-*
        ↓
agent-core
        ↓
ai Provider 抽象
```

关键事实：

1. `@vetta/ai` 拥有 Provider、Message、Model、Stream、Usage 和错误合同。
2. `@vetta/agent-core` 拥有单次模型-工具循环；生产路径是 Gen B `engine/runAgentTurn`，旧 `Agent`/`agentLoop` 仍为兼容路径。
3. `runtime-core` 拥有 Session、TurnPipeline、Queue、Snapshot、Conversation Document、生命周期、恢复和通用事件路由。
4. `coding-agent` 拥有 Profile、Prompt、Mode、Todo、Memory、Skill、Plugin、MCP 产品策略、Compaction 和产品 Feature。
5. `TurnEnginePort.execute(request) -> AsyncIterable<TurnEngineEvent>` 是 Runtime 与执行内核之间的主要替换接缝。
6. `ComposedRuntimeFactory` 当前直接创建 Vetta `AgentCoreTurnEngine`；未来如需 Pi，必须在 Composition Root 注入 Adapter，不让 `runtime-core` 依赖 Pi。
7. 动态 Tool、MCP、Skill、Plugin 和 Prompt 在 Turn admission 绑定不可变 generation；普通更新从下一 Turn 生效。
8. Conversation/Event Log 是恢复和持久化事实；消息、取消、失败和终态事件必须按顺序写入。
9. Tool 的 `content` 是模型可见通道，`details` 是 UI/Host 结构化通道，不能混用。
10. MCP 使用指纹增量同步和 deferred `tool_search`；Subagent 使用池、队列、generation 和 terminal/batch 投递；Capability 使用 Token、Registry、Grant、Constraint、Revoke 和审计。

## 已确认的产品决策

### 产品

- 第一阶段面向个人专业用户和小团队。
- 后续才考虑企业版，企业控制面当前不实现。
- 桌面应用有 `work` 和 `coding` 两个独立入口。
- 两个入口不是两套 Runtime，而是不同的 Agent Profile、Tool Catalog、System Prompt 和默认 Permission Set。
- UI 采用 Chat-first + Task Activity Panel；coding 额外提供文件树、Diff、Terminal、测试和 Git；work 额外提供文档、表格、研究来源和 Artifact 预览。

### 执行

- 文件、Tool、Shell、MCP 执行都在本地。
- 可以调用远程 LLM API。
- 暂不做云端执行、远程 Agent、云端会话同步和多租户 SaaS。
- 保留 `@vetta/ai`，不切换到 `pi-ai`。
- 当前继续使用 Vetta Agent Engine；Pi 作为上游参考，只有出现无法局部吸收的能力缺口时才通过 Adapter 评估。

### Task / Artifact

- 简单请求保持 Conversation。
- 多 Tool、多步骤、需要审批、长时间运行或产生多个结果时升级为 Task。
- Task 建立在现有 Session + TurnPipeline + Snapshot 上，不能另造并行执行内核。
- Artifact 以本地文件内容为事实，Event Log 记录生成、修改、验证、引用关系。
- Artifact 通过 descriptor/renderer registry 展示；Plugin 可以注册 renderer，但不拥有 Artifact 生命周期。

### 权限

- `work` 默认 Balanced。
- `coding` 在用户授予 Project Trust 后可以进入 Trusted Project。
- 低风险读取、搜索、分析自动执行；高风险写入、Shell、Git、网络和 MCP 根据策略审批。
- Session Trust 只在当前 Session；Project Trust 写入 `.vetta-local/trust.json` 或等价本机状态，必须包含 scope、source、version、expiry 和 revocation。
- L4 删除、上传、外发、凭据访问、生产操作、强制 Git 操作始终保留硬审批。

### 项目协作

- `.vetta/` 保存可共享、可版本化的 Profile、Skill、Task Template、非敏感 Policy 和 Artifact 引用。
- `.vetta-local/` 保存本机 Trust、审批、运行时状态和缓存，默认不进 Git。
- Session、个人 Memory、凭据、本机路径和 Sandbox 状态不共享。

## 性能与可靠性调研记录（2026-09-22）

- 读取了本机 `C:\Users\xquan\.vetta` 的 Desktop 日志、App Monitor 汇总和 Session 事件；未读取 `auth.json`、`models.json`、`mcp.json` 等凭据/敏感配置。
- 原版 EXE 日志对应 Vetta `0.5.58`，不是当前源码的 Desktop `0.5.59`。日志显示 DeepSeek `openai-responses` 流出现 `response.content_part.added targeted the wrong output item`，属于 Provider 流协议错误，必须进入 `@vetta/ai` 的 fixture 回归。
- Agent Team 存在 248 秒级成员 Turn、34–43 秒上下文压缩和压缩失败；当前 Runtime 需要补齐 Turn/Tool/Compaction/Team 的 deadline、single-flight、取消和终态投影，避免 UI 长时间保持运行态。
- App Monitor 汇总显示 compaction 为 0，但主日志已有多次 compaction，说明现有观测覆盖不完整；性能基线必须增加 Main/Renderer/GPU/Heap、队列、事件缓冲和压缩耗时。
- 当前机器一次采样为 RTX 3060 Laptop GPU 6GB，GPU 使用约 2.4GB/25%；Vetta 五个进程合计 Working Set 约 768MiB。该采样只代表当时状态，不能替代卡死现场的历史快照。
- 星轨装饰球使用高成本 WebGL Shader。当前先从装饰目录、设置预览和新会话注册表移除 `orbit`，旧 localStorage 值回退默认装饰；保留 `OrbitOrb`、`OrbitOrnament` 及其测试接口，后续只有在 GPU/内存指标达标后再评估恢复。

## 后续工作边界

当前任务进入“实施规划”而不是直接编码。必须先完成：

1. MVP 范围冻结；
2. Task/Artifact/Permission/Approval 合同；
3. Runtime 映射设计；
4. 数据目录与迁移；
5. UI 信息架构；
6. 行为合同测试和观测基线。

在这些规划文档通过审阅前，不应修改公共 TypeScript 合同、持久化格式、IPC 或 Agent Engine。
