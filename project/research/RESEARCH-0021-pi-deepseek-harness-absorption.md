---
id: RESEARCH-0021
type: research
status: done
priority: P1
owner: packages/agent/packages/ai/packages/coding-agent
source: user-request；Pi 与 DeepSeek Harness 及桌面端第一方源码对照
created: 2026-10-03
updated: 2026-10-03
related_requirement: []
related_plan: []
related_tasks: [TASK-0195, TASK-0197, TASK-0198]
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0007, RESEARCH-0010, RESEARCH-0015]
---
<!-- Copyright The Open Forge contributors. -->

# Pi 与 DeepSeek Harness / Desktop 能力吸收评估

## 问题与范围

用户希望了解：从早期 Pi 演进的 Open Forge，面对现代 Pi、DeepSeek Harness 及其桌面版，有哪些值得吸收的机制。本轮仅研究与管理记录，不实现、迁移、提交或发布；不调用真实 Provider，不运行外部项目、用户 Desktop 或真实状态目录。

“poagent”结合上下文按 Pi Agent 理解。没有定位到当年 fork 的精确 upstream commit，因此本文是**当前能力对照**，不是“所有 fork 之后上游 commit 的移植清单”。不把更新日志中每一项都当成本仓缺失项。

主代理调查本仓与 Pi；背景研究代理只读 DeepSeek 公开资料，将独立证据写入工作区外临时目录；最终由主代理串行维护本记录和研究索引。

## 事实来源

### 版本与身份锚点

- **Open Forge**：开始调查时 HEAD 为 `1956263b6ba7be5ad91dfa065424094c7ce72ca2`，续接时为 `48b8e487fd47e4009da7edf0d09169426a873529`。其他任务在此期间提交了会话投影修改；已核对这些提交没有改变本文涉及的 `packages/{agent,ai,runtime-core,runtime-mcp,runtime-node,coding-agent}`。Desktop 投影以续接时已提交源码为准。本轮不改、不夹带其他任务。
- **Pi**：GitHub API 查询 `badlogic/pi-mono` 重定向至 [`earendil-works/pi`](https://github.com/earendil-works/pi)；2026-10-03 观测 main commit 为 `69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1`；[latest release 为 v1.0.0，2026-10-01](https://github.com/earendil-works/pi/releases/tag/v1.0.0)。下文 P 系列链接固定到该 SHA，**包含 v1.0.0 之后的 Unreleased 改动**，不能把整个快照等同于已发布 1.0.0。
- Pi 仓库顶层 [LICENSE](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/LICENSE) 为 MIT。未来实际复制代码仍须保留许可与署名，另审依赖/资产许可证；本文仅借鉴机制。
- 历史脉络：[内核替换评估](../../exprot/kernel-replacement-feasibility.md)、[上下文研究 RESEARCH-0007](RESEARCH-0007-context-cache-stability-references.md)、[PI-Desktop 研究 RESEARCH-0010](RESEARCH-0010-pi-desktop-borrowing-opportunities.md)、[Cordis 研究 RESEARCH-0015](RESEARCH-0015-cordis-meta-framework.md)。它们解释旧取舍，不代替今天的源码。

### Pi 第一方证据索引

| 编号 | 一手来源 | 支持的事实 |
|---|---|---|
| P1 | [agent CHANGELOG](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/agent/CHANGELOG.md) | 1.0 移除 agent-core 内的实验 harness；0.87 的 request/turn hooks；0.99 的 provider 原始事件观察 |
| P2 | [agent-loop.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/agent/src/agent-loop.ts)、[types.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/agent/src/types.ts) | prepareRequest、finishTurn、工具预检/执行/终结、parallel/sequential、结果排序 |
| P3 | [agent-loop.test.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/agent/test/agent-loop.test.ts)、[agent.test.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/agent/test/agent.test.ts) | 并发、hook、队列、取消的可借鉴回归场景；本轮只读未执行 |
| P4 | [codemode 文档](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/coding-agent/docs/codemode.md)、[execute.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/coding-agent/src/extensions/codemode/execute.ts)、[tool.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/coding-agent/src/extensions/codemode/tool.ts) | QuickJS 限制环境、工具代理、按需发现、输出筛选、懒加载与资源预算 |
| P5 | [durable README](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/durable/README.md)、[harness/tool.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/durable/src/harness/tool.ts) | 实验 API、持久工具意图、safe/unsafe 重放、子任务所有权 |
| P6 | [session/observation.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/durable/src/session/observation.ts)、[generation.ts](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/durable/src/harness/generation.ts) | 慢订阅者超过 100 committed frames 后回落最新完整视图；partial 节流提交 |
| P7 | [security.md](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/coding-agent/docs/security.md) | 项目信任不等于 OS 沙箱、并非每工具询问授权、context 文件仍是不可信输入 |
| P8 | [coding-agent CHANGELOG](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/coding-agent/CHANGELOG.md)、[ai CHANGELOG](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/ai/CHANGELOG.md)、[Responses parser](https://github.com/earendil-works/pi/blob/69f0be6f0a6ca1bf66a2a9cf59c821b632e6bca1/packages/ai/src/api/openai-responses-shared.ts) | MCP/鉴权/stream 修复来源；未完成 tool-call 拒绝；不能将发布方性能宣称当本仓基准 |

### DeepSeek Harness 与 Desktop 的准确指向

- **Harness 官方主仓**：[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)，默认 `master`，固定 SHA `639ed015397290b3745d163aafe02ffee4aa3f84`（2026-09-29）。[README](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/README.md#L5-L15) 明确 developed by DeepSeek AI、developer preview；最新观测发布为 [`dsh-v0.2.0-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)，是 prerelease，tag 对应上述 SHA。`releases/latest` 返回 404 不代表没有预发布。
- 旧 `deepseek-harness/deepseek-harness` 地址当前返回 404，旧文档站的 GitHub 链接指向上述官方仓库。不推断完整迁移历史，也不继续沿用“社区 Harness”的主体判断。
- **Desktop 主样本**：[`ningbainb/deepseek-harness-desktop`](https://github.com/ningbainb/deepseek-harness-desktop)，SHA `8ba3869117e730996a7b7c6fe568296487acba10`，[`desktop-v4.3.0`](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v4.3.0)（2026-09-22）；已核对 annotated tag 指向该 SHA，但没有验证安装制品。[维护方 README](https://github.com/ningbainb/deepseek-harness-desktop/blob/8ba3869117e730996a7b7c6fe568296487acba10/README.md#L35-L47) 明确非官方、独立应用/数据/更新身份，锁定 **DSH 0.1.6-alpha.2 + dsh-web 0.3.23**。下文 DSH 最新源码不能直接算作这个 Desktop 已有能力。
- “desktop 版”仍可能指其他社区壳；例如 [`lencx/Minke`](https://github.com/lencx/Minke/blob/ff57d63f2bc6da1e6b1aa74cf08ae6208ba98f77/README.md) 也声明基于 Harness。本轮选名称直接匹配且有维护方声明的 `ningbainb` 为主样本，Minke 只做消歧，没有比较其内部实现；不声称用户指向已被唯一确认，也不据社区 README 推断官方全部发布矩阵。
- 许可：Harness [MIT](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/LICENSE)，Desktop [BSD-3-Clause](https://github.com/ningbainb/deepseek-harness-desktop/blob/8ba3869117e730996a7b7c6fe568296487acba10/LICENSE)，Minke [Apache-2.0](https://github.com/lencx/Minke/blob/ff57d63f2bc6da1e6b1aa74cf08ae6208ba98f77/LICENSE)。实际复用须另审第三方 notices、保留许可，不继承品牌背书或产品身份。

| 编号 | 固定 SHA 的第一方源码/测试 | 机制 |
|---|---|---|
| D1 | [summarizer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/compaction/compaction-basic/src/summarizer.ts#L120-L180)、[compaction tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/compaction/compaction-basic/tests/compaction-basic.spec.ts#L1463-L1497) | 原 system/messages/tools 前缀用于摘要请求 |
| D2 | [tool-calls.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/tool-calls.ts#L113-L235)、[classification tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/tests/execution-mode.spec.ts#L28-L106) | 保守并行分类、exclusive 屏障、有界 in-flight、顺序提交 |
| D3 | [agent.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/agent.ts#L154-L234)、[cancel tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/tests/cancel.spec.ts#L1040-L1078) | 输入/唤醒/取消/回合闭合的不同语义 |
| D4 | [tools/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/src/index.ts#L212-L231)、[post-policy](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/src/index.ts#L1796-L1840)、[spill-policy](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/spill/spill-policy/src/index.ts#L90-L150) | canonical value / model content / presentation meta 分离 |
| D5 | [scope/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/scope/src/index.ts#L104-L185)、[scope tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/scope/tests/scope.spec.ts#L55-L71) | 可等待、重复调用共享收敛的资源静止边界 |
| D6 | [desktop 实际入口](https://github.com/ningbainb/deepseek-harness-desktop/blob/8ba3869117e730996a7b7c6fe568296487acba10/apps/dsh-desktop/src/electron-app.mjs#L1561-L1583)、[pipe admission](https://github.com/ningbainb/deepseek-harness-desktop/blob/8ba3869117e730996a7b7c6fe568296487acba10/apps/dsh-desktop/src/runtime-pipe.mjs#L578-L596)、[Electron bridge](https://github.com/ningbainb/deepseek-harness-desktop/blob/8ba3869117e730996a7b7c6fe568296487acba10/apps/dsh-desktop/src/runtime-electron-transport.mjs#L91-L137) | 独立 runtime、protocol/token/generation、stream owner；autoRestart=false |
| D7 | [checkpoint policy](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/session/session-checkpoint-policy/src/index.ts#L29-L83)、[tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/session/session-checkpoint-policy/tests/session-checkpoint-policy.spec.ts#L53-L108) | 副作用前 flush；失败不 dispatch |

## 当前结论

### 1. 不要把“基于早期 Pi”理解成“整个内核已经落后”

当前实际生产适配器是 [StatelessAgentCoreTurnEngine](../../packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts)，调用 [engine/run-agent-turn.ts](../../packages/agent/src/engine/run-agent-turn.ts)，而不是只用兼容的 `agent.ts / agent-loop.ts`。如果仅 diff 上游 `agent-loop.ts` 与本仓同名文件，会错判真正的生产差距。

已有的关键能力包括：

| 领域 | 本仓当前事实与源码 | 对上游吸收的影响 |
|---|---|---|
| 每次模型调用的工具与上下文重组 | `StatelessAgentCoreTurnEngine.createRequest` 的 `resolveTools`、`resolveModelCall`、frame、message finalizer；Agent `checkpoint(model_call/assistant_result/assistant_error)` | Pi 新 hooks 有参考价值，但不能据此说本仓缺少这些阶段 |
| 策略与授权 | [tool-executor.ts](../../packages/agent/src/engine/tool-executor.ts) 在执行前调用 `policy.authorize`；Runtime adapter 接入 snapshot policy | `beforeToolCall` 不应变成绕过现有 Policy 的第二权限入口 |
| 上下文压缩 | [prefire](../../packages/coding-agent/src/compaction/prefire.ts)、[runtime/cache](../../packages/coding-agent/src/compaction/runtime/compaction-prefire-cache.ts)、[microcompact](../../packages/coding-agent/src/compaction/microcompact.ts)、[summary-quality](../../packages/coding-agent/src/compaction/summary-quality.ts) | 已有后台预压缩、指纹失效、轻量裁剪和摘要质量筛查；不是需要从零搬来的新功能 |
| 缓存与工具暴露 | `stateless-agent-core-turn-engine.ts` 有稳定 prompt 前缀/消息前缀观测；[McpDeferredToolController](../../packages/runtime-mcp/src/deferred-tool-controller.ts) 默认阈值 15，按 Session 激活，绑定 Turn 目录快照 | 已有 `tool_search` 渐进披露；应研究增量机制而非再造目录 |
| Responses 流一致性 | [events.ts](../../packages/ai/src/providers/openai-responses/events.ts) 拒绝 unfinished items、缺失终态、冲突 item；[adapter tests](../../packages/ai/test/openai-responses-adapters.test.ts) 覆盖 interleaved/index 缺省场景 | Pi 新修复是差分用例来源，不代表本仓也有同一 Bug |
| 持久化与恢复 | [TurnPipeline](../../packages/runtime-core/src/kernel/turn-pipeline.ts) 对相关持久事件先 append 再 publish；[recovery](../../packages/runtime-core/src/kernel/conversation-recovery.ts) 将未闭合 Turn 标中断，不重放模型/工具/进程队列 | 不能声称“没有持久化”；真正差别在工作进行到一半的恢复粒度 |
| 订阅与 UI 投影 | [subscriber queue](../../packages/runtime-core/src/runtime-host/session-event-subscriber-queue.ts) 合并 delta 且不丢终态；[conversation projection](../../apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts) 有 sequence 过滤 | 已有背压与顺序治理，但“完整快照重同步”仍是值得定向比较的机制 |

Pi 1.0 恰恰把 Agent core 收窄回 `Agent / loop / proxy / types`，将 durable sessions 指向独立的实验性 `pi-durable`（P1/P5）。这与 Open Forge 已分离 Agent、Runtime、产品策略、平台 I/O 的方向相容。它支持“保留分层、局部吸收”的判断，**不证明任一产品整体更强或性能更优**。

### 2. Pi 值得吸收的差异机制

#### A. 有安全约束的工具批次并发——优先做可控验证

**外部事实（P2/P3）**：Pi 支持 parallel/sequential；串行完成预检后运行可执行工具；完成事件可以按完成顺序到达，但 tool-result 消息按 assistant 原始调用顺序发出。任一工具声明 `executionMode: sequential` 时该批次回退串行。当前默认并行。

**本仓差距**：[生产 tool-executor](../../packages/agent/src/engine/tool-executor.ts) 的 `executeRuntimeToolCalls` 仍逐一 `await executeOne`，每个结果后消费 steering 并跳过剩余工具。已有 [Task 合同](../../packages/runtime-core/src/task/contracts.ts) 的 `parallel-safe/exclusive` 不等于此模型工具批次已经并发。

**吸收方式（建议，不是现有行为）**：先只给纯读工具白名单启用有限并发，未知工具和写文件/进程工具默认串行；同路径读写或审批交互不得无序。保留顺序确定的持久结果与现有授权入口。不要照搬 Pi 的“默认并行”。

**最小证据**：显式同步点控制两个读取不同文件的工具；验证 wall time、权限逐一生效、结果顺序；注入取消、steering、部分失败和迟到 update。steering 到达时，已经启动的工具不能伪装成“从未执行”，因此需先明确新合同。收益尚未测量。

#### B. 慢消费者的“增量 → 最新快照”退化——桌面可靠性候选

**外部事实（P5/P6）**：`pi-durable` 的 watch 基于已提交视图及 cursor；队列超过 100 frames 时用最新完整视图替换积压增量，重连从当前视图开始。该阈值是它的设计值，不是本仓应照抄的数值。

**本仓差距/已有能力**：`SessionEventSubscriberQueue` 为防丢字，delta 和 terminal 在必要时可超过 `maxSize`；不能直接丢弃它们。当前项目又已有 Conversation 快照和 sequence，因此可评估在投影/传输层建立**显式 resync 帧**，而非在 Agent 核心做丢事件优化。

**吸收方式**：只有消费者能用 `snapshot + cursor` 原子替换且继续接增量时才丢弃被快照覆盖的旧 delta；approval、tool result、终态仍以持久事实为准。不要替换现有存储系统为 Chord。

**最小证据**：暂停 Renderer/模拟慢 IPC 后恢复，比较最终 transcript 与宿主持久视图；测队列字节峰值而不只数事件；覆盖断线、迟到旧帧、切会话、终态与未决审批。当前未测，不能称为已确认内存 Bug。

#### C. Codemode：工具结果先在受限环境内处理，再返回模型——值得试验

**外部事实（P4）**：模型写短 JavaScript，在 QuickJS 中通过代理调用已有工具；脚本没有直接 Node、文件系统、网络、timer API；只把选定输出交还模型。支持 `searchTools/describeTool/describeNamespace`，工具声明有预算，执行器延迟加载并限制资源。

**本仓差距**：已存在 deferred MCP 搜索，但本次在相关 TypeScript 源码中未定位到同等的脚本化工具编排入口。`bash` 能跑脚本不等同于“只获得特定工具能力的脚本沙箱”。

**吸收方式**：先用单一 capability 包封装少量只读工具，所有代理调用仍走现有 Policy/权限/取消/审计；不暴露凭据或任意 imports；限制脚本时间、内存、并发、输出字节和持久小状态。QuickJS 的隔离不自动隔离获授工具的副作用。

**最小证据**：对同一“搜索多份资料→取字段→汇总”样例比较模型往返次数、输入 token、时延、正确率；本地假工具先验证，真实模型评测另获费用授权。Pi CHANGELOG 中“约 40% fewer prompt tokens”只属于发布方特定改动，不能作为 Open Forge 的预期收益。

#### D. 工具意图日志与 replay-safe 恢复——需求明确后再立专项

**外部事实（P5）**：执行前记录工具最终参数与 replay policy；恢复时**已记录 policy 和当前工具 policy 都为 safe**才允许重跑，否则落 `interrupted` 错误，并明确可能已经部分执行。`pi-durable` 自称 Experimental，API 可不预告变化。

**本仓差距**：已有持久事件与中断收敛，但当前 recovery 明确不自动重放工具。这是安全取舍，不是漏实现。

**吸收方式**：若长任务跨进程恢复成为产品需求，先定义工具级 execution identity、结果记录、外部幂等键及用户确认恢复；默认 unsafe。只读工具也要考虑网络请求、额度和数据变化，不凭名字判 safe。不得承诺 exactly-once；不能给支付、提交、写文件等操作直接加自动重试。

**最小证据**：在 intent 提交前后、执行副作用后但结果落盘前后逐点模拟 crash，保证 unsafe 不重复执行，safe 不重复应用已有结果；再验证子任务取消与恢复。优先借鉴状态机，不引入第二 Session/Storage。

#### E. 新 hooks 与 Provider 观察：主要吸收合同和测试，不追求同名 API

**外部事实（P1/P2/P3/P8）**：`prepareRequest` 覆盖首次及后续请求；`finishTurn` 在工具结果定稿后、`turn_end` 前执行，错误/取消仍是硬退出；队列 peek 不消费；`onProviderStreamEvent` 暴露归一化前的 provider event。

**本仓已有**：model-call frame、checkpoint、输入队列、事件交付屏障和独立 stream 协议已覆盖大部分职责。**建议**把首次/后续请求、终态 hook、取消不重启、peek 不消费、损坏 tool-call 不执行等场景对照现有测试；只有真实缺口才加窄接口，不把上游 hook 表整体复制进 Runtime。

若诊断确实需要保留 provider 特有数据，应增加默认关闭、脱敏、字节有界的受控 observation；不能把完整原始事件流写进日志，不能泄漏提示词/工具结果/凭据，也不能让诊断回调影响执行结果。

### 3. DeepSeek Harness：优先学它的保守执行合同与缓存路径

#### F. Cache-aware compaction——本轮最明确的低侵入候选

**外部事实（D1）**：摘要请求保留原 system head、待压缩消息前段及最近实际路由 header 中的 tools，在尾部添加 user 摘要指令；按显式摘要模型/实际路由模型选择目标，以目标 capacity 和预留 output 计算预算。测试直接断言前缀和 tools 保持。

**本仓差距**：[compaction.ts 的 completeSummaryCandidate](../../packages/coding-agent/src/compaction/compaction.ts) 先 `serializeConversation(convertToLlm(...))`，然后以 `SUMMARIZATION_SYSTEM_PROMPT + 单条 user prompt` 调用模型。**已有后台 prefire，不等于摘要请求复用了主对话的热前缀**；这两项优化解决不同问题。

**建议**：不替换压缩引擎，先在现有摘要请求构造边界增加可关闭的 prefix-preserving 策略；同模型/同 Provider/兼容请求格式时采用，其他情况回退现状。输入必须是实际最终请求的合法前缀，不把内部 history 不经转换就复制；校验 tool-call/result 配对和 token 预算；摘要阶段不执行模型返回的工具调用，保留现有摘要质量筛查、降级、取消和 prefire 指纹合同。

**最低验证**：假 Provider 断言 system/messages/tools 保持与尾部指令，覆盖路由模型变化、专用摘要模型、溢出、取消、质量降级和回退。真实收益需另获授权后比较 cache-read/cache-write/fresh-input、摘要请求成本、压缩等待时延及任务信息保留率。不是 TTL 控制、不保证缓存命中，也不是“压缩后主对话前缀永不失效”。

#### G. 并发调度：优先参考 DSH 的默认保守，而非 Pi 默认并行

**外部事实（D2）**：只有显式 parallel-safe 才并行，未知工具、分类异常或非 boolean truthy 不授予并行；`maxParallelToolCalls` 有界；exclusive 工具构成屏障；准备阶段有序、body 重叠、finalize/post-policy/结果与附加 context 按原始顺序提交。取消后不再启动新任务，已启动任务需要收敛。

**与 A 合并采纳**：这是一个工具调度候选，不另造第二调度器。比起全局 `Promise.all`，DSH 的模型更贴合本仓权限与确定性要求。其运行前动态重分类不应机械覆盖 Open Forge 的 Turn 冻结能力合同；应以本仓 snapshot/能力切换规则为准。

**风险**：声明 parallel-safe 不等于自动冲突分析；同路径资源仍需冲突策略；顺序提交有队首阻塞；不响应取消的同进程工具仍可能挂起。现有取消 deadline/恢复状态应保留，而不是为模仿上游无限 drain。

#### H. 工具结果三层分离——已有大半，增量是结构校验与替换语义

**外部事实（D4）**：工具 body 返回 canonical JSON，经 output schema 校验；render 生成 model content，presentationMeta 生成 UI 元信息。post-policy 不能同时替换 value 与 content；替换 value 会重新校验/投影，content-only 改动不改变 canonical value。**canonical value 本身不写入 durable tool/result**，需要重放的 UI 数据必须保存在 meta 或受管理引用。

**本仓已有**：[RuntimeToolResult](../../packages/agent/src/engine/types.ts) 有 `content/details/isError`；[result-policy](../../packages/coding-agent/src/tool-results/result-policy.ts) 明确 details 不进模型，设置内联预算、保留卡片子集、完整结果落 artifact；[Desktop artifact runtime](../../packages/runtime-desktop/src/result-artifact-runtime.ts) 已接线。因此“结果分离、截断、外置保存”不是缺失功能。

**只吸收增量**：当要新增机器可组合的工具结果或 codemode 时，为选定工具定义 canonical output schema 与清晰的 value/content/meta 替换合同；不要全仓强改公共结果协议，也不要照搬“不持久化 canonical value”而丢掉本仓既有原始产物。先用一个结构化查询工具验证 schema 失败、policy 改写、卡片重放、artifact 丢失与读权限。属于中期合同优化，不排在缓存/并发之前。

#### I. Cancel、生命周期与 checkpoint——主要当对抗性测试来源

- **D3** 区分 followup、steer、inject，cancel 的清/留队列，以及取消收敛期间新输入的唤醒。可借其竞态样例验证本仓 [SessionInputQueue](../../packages/runtime-core/src/kernel/session-input-queue.ts) 和 [cancel deadline 测试](../../packages/runtime-core/test/kernel/agent-session-cancel-deadline.test.ts)，但不改用户当前 stop/queue 语义以“兼容上游”。
- **D5** 的 `dispose()` 等到 fiber 异步清理静止，即使已被别处先 dispose 也等待。Open Forge [RetryableCleanup](../../packages/runtime-core/src/lifecycle/retryable-cleanup.ts) 已共享在途清理、保留失败项重试；值得比较的是插件热切换/重复关闭的边界用例，而非断言本仓没有生命周期治理。Cordis scope 是同进程组织机制，不是恶意插件隔离，未标记 listener 还可能全局接收。
- **D7** 在模型请求、top-level 工具 body、下一 step 前 flush；失败则不 dispatch。Open Forge 已有 append-before-publish 和事件交付屏障，但它们不自动证明“每个工具副作用前的持久化意图屏障”都覆盖了。先针对慢/失败 repository 写入与工具启动之间的顺序做合同审计；没有可失败复现前不登记为 Bug。该机制可与 Pi replay-safe 研究合并；不能承诺 exactly-once 或掉电不丢数据。

### 4. 社区 Desktop：值得借的是进程边界，不是再套一层 Web UI

**外部事实（D6）**：默认本地 pipe，指定远程 host 时走 HTTP；独立子进程运行 DSH。每次启动建立独立 token/generation，业务 dispatch 前校验协议、token 和 generation；Electron 自定义 scheme 桥有 authority、payload、stream owner、cancel/quiesce 合同。旧 generation 被拒绝、其他 renderer 不能写/取消已有 stream，有对应静态测试证据。

**本仓对照**：[apps/desktop 主进程 composition](../../apps/desktop/src/main/agent-runtime/composition.ts) 直接 `new RuntimeHost(...)` 并组合 backend pool。它不是该样本的“整套 Harness 独立子进程”模式；不过本仓其他工具/插件/MCP 已有各自进程实现，不能说整个产品只有单进程。

**适合吸收的内容**：若要缩小主进程故障影响范围或隔离高内存 runtime，可研究“薄 Electron 控制层 + 可独立退出/回收的执行宿主”，复用现有 Runtime Port；传输必须显式具有 instance generation、请求/stream owner、cancel ack、重连 snapshot、生命周期 drain 和身份校验。工具权限不因本地 pipe 受信而放宽。

**不建议现在直接迁移**：这是跨 IPC、会话恢复、工具能力与打包的架构变更，不是简单换 `spawn`。多进程可能增加总 RSS，收益应看 UI 响应/主进程故障域/可回收性；没有基准不声称省内存。实际 Desktop 入口是 **`autoRestart: false`**，即使 Controller 有重启辅助代码，也不是产品默认自动自愈。独立进程不等于 OS 沙箱；本轮未完成整个 renderer 准入和 HTTP 远程模式安全审计。

### 5. 建议采纳顺序（提案，不是已批准实施计划）

| 顺序 | 候选 | 本轮差距判断 | 首个有限实验 / 停止线 |
|---|---|---|---|
| 1 | DSH 摘要请求保留热前缀 | 明确请求构造差异；已有 prefire 可复用 | 假 Provider 请求合同 + 现有摘要回退；之后获授权才做费用/质量对照 |
| 2 | DSH 保守调度 + Pi 结果排序经验 | 生产工具批次目前串行 | 两个白名单只读工具，限并发、exclusive 屏障、取消与 steering；收益不足则不扩大 |
| 3 | Pi durable 慢消费者 snapshot resync | 已有 delta 合并，但保真队列可超上限 | 先模拟慢 Renderer 并测字节峰值/最终一致性，没压力证据不全量改协议 |
| 4 | Pi codemode | 未定位同等受限工具脚本入口 | 小型只读工具集试验；权限/预算/取消不闭合就不扩展 |
| 5 | DSH typed output/value-policy 合同 | content/details/artifact 已有，机器结果 schema 可增量强化 | 仅在需要结果组合的新工具上尝试，不为整齐重构所有工具 |
| 6 | Desktop 独立执行进程 | 与当前主进程组装方式不同 | 主进程故障/内存基线先证明需求；形成专门架构方案，不当微优化 |
| 7 | Pi replay-safe + DSH 副作用前 checkpoint | 现有策略是中断收敛，不自动重放 | 用户需要跨进程续跑后才立项；先测故障窗口，不自动重试副作用 |
| 持续 | stream/queue/cancel/lifecycle 测试对照 | 已有丰富实现，逐项确认而非视作缺失 | 吸收能暴露真实差异的用例，不复制同名 API 或另一状态机 |

## 被否决的方案

1. **整体升级/替换为当前 Pi harness**：本仓已独立分层，存在 Session、权限、持久化、Compaction、MCP、Plugin、多宿主事实源；直接嵌入另一 harness 会重复所有权。没有性能或维护收益实证。
2. **同时使用两套 AI/provider/catalog 与 durable session**：会扩散消息、usage、stop、错误和取消合同；不能为追新引入双权威。
3. **把 Pi 默认权限和并行策略当产品安全方案**：Pi 自己明确 project trust 不是 OS 沙箱（P7）；应保留 Open Forge 现有更严格的权限和宿主边界。
4. **直接引入 Cordis 替换整个 Runtime**：插件 effect/disposer 的机制可研究，但框架迁移是独立高影响决策，须比较接口、生命周期、生态与回滚，不由本调研自动授权。
5. **把全文摘要、tool_search、缓存前缀、流协议校验重新做一遍**：已找到本仓实现；没有先证明差距就重做，只会增加复杂度。
6. **将 README 宣称、源码常量或单一单测等同于性能/安全保证**：本轮未执行外部项目，任何 token、内存、时延收益均待相同条件实测。

## 代码/测试/指标锚点

上面的相对源码链接可直接定位本仓事实；P 系列固定 SHA 来源可复查外部实现。候选验证均是**未来建议**，本轮未新增或执行这些运行时测试。

已执行并在 DeepSeek 证据合入后复验：记录元数据、相对文件链接、ID 唯一性和目录索引（复用仓库 frontmatter/链接读取器）；通过 `git diff --check` 检查研究索引，另对未跟踪研究正文检查尾随空白/冲突标记。外部链接以取证时的实际读取为依据，没有执行全量在线链接/锚点检查。纯管理研究不改运行行为，不要求为形式运行完整构建、`bun run check`、UI 或真实 Provider 测试。

## 失效条件与置信度

- 对已逐项阅读的状态机/公开合同：高；仓库级“未发现等价机制”：中，限定本次检索范围；性能、模型质量与生产可靠性：未验证。
- Pi main 与 release 不等同；若后续 release 改变工具并发、durable、codemode 合同，按新 SHA 重审。
- 本仓在并行演进；如果 `runAgentTurn`、工具策略、Conversation 存储、Desktop resync 或 MCP 暴露发生变化，重做差距判定。
- 研究不等同于 ADR、已批准实施计划或用户验收，不改变现行安全/公共协议/数据兼容合同。

## 下一步触发信号

先交付“已存在 / 有差距 / 高风险探索”的分层结论；用户选定真实问题后再建立或续接来源和实施 Task。不因为研究列出多个方向就批量开 Task，也不自动编码。

## 2026-10-03 实施审计修正

TASK-0195 的可失败请求测试揭示了研究未充分评估的安全差异：现有 `summary-support.ts` 明确把历史与旧摘要序列化为不可信 JSON，并由专用 system prompt 禁止继续历史操作；`summary-prompt-boundary.test.ts` 已固化该边界。直接复用原 system 与历史消息不能同时保持这份合同，因此 **F/采纳顺序第 1 项暂缓，不能据本文直接开启默认前缀复用**。未经安全等价性论证，不以缓存收益降低边界。

TASK-0198 在独立 TASK-0197 Worktree 先实现保守工具并发；它不依赖压缩方案。原前缀试验的失败已记入 TASK-0195，不算产品回归、不冒充已通过的 red/green。慢消费者重同步尚未实施。
