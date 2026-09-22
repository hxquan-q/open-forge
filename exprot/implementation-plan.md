# 实施规划

> 本规划对应已确认的本地 Desktop `work/coding` 双模式目标。Task/Artifact 仍处于规划阶段；性能基线和已批准的低风险 UI 性能变更可先行实施。

## 阶段 0：基线和合同冻结

### 目标

冻结不变量，避免 Task/Artifact 需求在错误层级新增第二套 Runtime。

### 工作

- 评审 `mvp-scope.md`；
- 评审 `core-contracts.md`；
- 检查现有 Session/Turn/Snapshot/Repository 生产者和消费者；
- 建立行为合同 fixture；
- 确定哪些事件属于 Runtime 通用合同、哪些属于 coding-agent 产品事件；
- 写 ADR：Task 映射和 Artifact 持久化，不宣称尚未实现的行为。

### 完成标准

- Task 不拥有第二套模型循环；
- Artifact 不拥有第二套文件事实源；
- Permission/Approval 不依赖 Prompt；
- 公开合同改动范围明确。

## 阶段 0.5：性能与可靠性基线（先于新增 Task UI）

### 目标

先解决长 Turn、Provider 流错误、上下文压缩和 Desktop 资源观测问题，避免 Task/Artifact 建立在不可诊断的执行底座上。

### 工作

- Provider 流协议 fixture：错误事件关联、部分流、未知 output item、取消和重试；
- Turn/Tool/Provider/MCP/Approval/Compaction/Team Member 分层 deadline；
- Session 取消后 bounded idle wait，超时进入可恢复的 `recovery_required`，禁止永久等待；
- Compaction single-flight、阈值滞回、最小间隔和压缩模型独立配置；
- Main/Renderer/GPU/Heap/IPC/EventBuffer/Queue/Compaction 性能快照；
- Agent Team 成员并发、长尾、取消传播和父子终态合同；
- Desktop 动态装饰、WebGL、视频窗口和后台 Renderer 的低功耗策略；
- 长会话事件回放与历史读取的内存上限。

### 完成标准

- Provider 协议错误不再把 Team/Session 留在无终态等待；
- 任意可取消阶段都能在 deadline 内产生明确终态；
- 同一 Session 不会并发执行多个 Compaction；
- 性能快照能定位 CPU、GPU、Heap、Provider、Tool、Compaction 和 IPC 的主要耗时；
- 星轨等高负载装饰默认不进入生产路径，底层接口仍可独立恢复和 A/B 验证。

## 阶段 1：Task/Artifact 最小纵向切片

### Owner

- 通用 Task 生命周期：`runtime-core`（只使用产品无关词汇）；
- work/coding 语义：`coding-agent`；
- 文件和 Conversation 存储：`runtime-storage`/`runtime-node`；
- Desktop 投影：`apps/desktop`。

### 工作

- Task 创建、计划、运行、暂停、完成、失败、取消；
- root Session/Turn 关联；
- Artifact descriptor 和事件 projection；
- 使用已有 JSONL/ConversationRepository；
- Task Activity observation；
- 重启恢复。

### 不能做

- 直接创建独立 Task Runner；
- 在 Renderer 保存最终 Task 状态；
- 在 Plugin 私自持久化 Artifact；
- 引入独立数据库解决查询便利。

## 阶段 2：Permission / Approval

### 工作

- Tool Risk Descriptor；
- L0-L4 风险评估；
- Session Trust；
- Project Trust 本机文件；
- Approval Request/Decision 事件；
- Task Review 和 Artifact Review 投影；
- 取消、过期、撤销和用户关闭窗口后的恢复。

### 验证

- 低风险自动执行；
- 高风险阻塞等待；
- L4 始终阻塞；
- 项目策略只能收紧；
- Trust scope 隔离；
- 进程重启后 Approval 状态可恢复。

## 阶段 3：work 模式纵向切片

按风险和交付闭环逐步接入：

1. 文档处理；
2. 文件批处理；
3. 数据分析；
4. 研究/知识库。

每个能力都必须拥有：

- Skill/Prompt 资源；
- Tool Catalog 选择；
- Task/Artifact 结果；
- Approval/Review 规则；
- 用户常见流程测试；
- 失败和取消路径。

## 阶段 4：coding 模式增强

- Project Context 和 Profile；
- Diff/Review；
- Git 只读和写入风险分级；
- Shell Sandbox；
- Test Result Artifact；
- Project Trust；
- coding Activity Panel；
- Tool/MCP deferred visibility。

## 阶段 5：共享项目目录

- `.vetta/agents/`；
- `.vetta/skills/`；
- `.vetta/task-templates/`；
- `.vetta/policies/`；
- `.vetta/artifacts/` 引用；
- `.vetta-local/` 忽略规则；
- 配置 schema、版本和迁移器；
- Git 共享合同文档。

## 阶段 6：Plugin/Skill/MCP/Renderer 生态

- Profile、Skill、Plugin、MCP 保持职责分层；
- Tool Catalog 按 Mode/Profile/Project Policy 选择；
- Renderer Registry 复用 Plugin contribution；
- 外部扩展按信任分级；
- Capability Grant 默认拒绝；
- MCP 使用已有 generation/deferred/synchronizer；
- 不引入 Pi Extension 第二公开合同。

## 阶段 7：Pi 评估（条件触发）

只有出现以下信号才启动：

- Vetta Engine 缺少重要能力且无法局部吸收；
- 上游 Pi 能力有明确收益；
- 差分测试基线已经存在；
- Adapter 可以独立回退；
- 不需要引入 Pi Session/Harness/Storage；
- 性能、可靠性或维护收益可量化。

实施方式：

1. 在 `runtime-core` 增加通用 `createTurnEngine` 注入合同；
2. 新建 Adapter 包，不让 Runtime 依赖 Pi；
3. 映射消息、工具、Policy、Checkpoint、Abort、Observation、Error；
4. 先在 CLI/测试宿主 A/B；
5. 通过差分和生命周期门禁后，才考虑 Desktop 灰度。

## 变更验证顺序

每个阶段按以下顺序：

```text
合同/状态机纯测试
  → Runtime/Repository 合同测试
  → coding-agent Composition 测试
  → Desktop IPC/Renderer 测试
  → 质量守卫
  → 必要时宿主集成测试
```

不运行真实 Provider，不绕过架构守卫，不恢复旧 `src/core`/兼容入口。

## 当前下一步

当前最小下一步不是写 UI，而是：

1. 评审 `core-contracts.md` 的所有权；
2. 从现有测试中建立 Task/Artifact/Approval 的合同 fixture；
3. 选择一个 work 文档任务和一个 coding Diff 任务做纵向切片；
4. 先实现事件/投影和状态机，再接 UI；
5. 保持现有 Vetta Engine 不变。
