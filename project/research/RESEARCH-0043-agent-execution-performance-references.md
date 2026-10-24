---
id: RESEARCH-0043
type: research
status: done
priority: P1
owner: runtime-core/agent-team
source: TASK-0394；GitHub第一方固定SHA源码与本仓生产入口只读调查
created: 2026-10-23
updated: 2026-10-24
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0395, TASK-0396, TASK-0397]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent 执行与协作性能：固定源码参照

## 问题与范围

为 [PLAN-0024](../plans/PLAN-0024-agent-kernel-team-execution-performance.md) 筛选不改变模型输入、工具权限、取消、usage/stop 和持久化语义的窄优化。
所属 [TASK-0394](../tasks/TASK-0394-agent-execution-reference-research.md) 仅交付研究；实现分别归 TASK-0395/0396/0397。
研究覆盖执行开销、有界工具并发、事件队列、状态投影、完成通知 drain、共享上下文缓存。
不比较模型能力，不以 README 宣传或复杂度推算冒充实际加速；不建议替换 Runtime。

**结论先行**：优先同文档投影复用；确定性复现通知收尾遗漏唤醒；生产 EventStream 的 FIFO 容器是独立候选。
维持默认安全窗口 4、exclusive 与 steering 屏障。共享 checkpoint 已存在，下一步应减少命中前的重复物化，不再建第二套共享上下文。

## 事实来源

调查日期 2026-10-23；经公开 GitHub API 解析 HEAD 后，源码均使用以下完整 SHA 的 raw URL 读取。
引用链接使用同 SHA 的 GitHub blob 与行号；HEAD 仅用于选快照，不是证据版本。未安装或执行外部项目。

| 项目 | 固定 SHA | 许可证及版本边界 |
| --- | --- | --- |
| Pi，`earendil-works/pi` | `ede2c9b468d8e061c557d16957513715e6d49cd6` | [MIT][p-license]；该快照 [agent manifest][p-manifest] 为 1.4.0，不证明已发布 |
| OpenAI Codex，`openai/codex` | `1c0c45bfc372fb7d7d581508fdef5eef8235eab7` | [Apache-2.0][c-license]；源码快照，非发行版承诺 |
| OpenHands SDK，`OpenHands/software-agent-sdk` | `dd0892c80fffb1e59bac77242adafbd8b1168649` | [MIT][o-license]；只研究 SDK，不泛化到整个 OpenHands 产品 |

本次请求的 `earendil-works/pi-mono` 与 `badlogic/pi-mono` API 均返回上述 Pi SHA；[仓库元数据](https://api.github.com/repos/earendil-works/pi-mono) 的 `full_name` 为 `earendil-works/pi`，正文采用规范地址。
许可证已读取固定版本正文；本研究只重述机制、引用短符号，不复制外部实现。未来若移植代码，另核对版权、修改标记及 Apache NOTICE 义务。
本仓基线由 Task 指定为 `ea67d951e8bb29a464219812465d3a4ae2939179`；本 worker 未操作 Git，以下本地事实来自主检出相关文件回读。

### 本仓已具备什么

- 真实链路是 [StatelessAgentCoreTurnEngine.execute](../../packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts) → [runAgentTurn](../../packages/agent/src/engine/run-agent-turn.ts)，不是只供兼容的旧 loop。
- [executeRuntimeToolCalls](../../packages/agent/src/engine/tool-executor.ts) 默认并发 4；连续 `parallel-safe` 才组成窗口，未知/独占工具单独执行；preflight/授权有序，结果按调用顺序收集，窗口后检查 steering。
- [TeamCollaborationStore.readFromDocument](../../apps/desktop/src/main/agent-teams/team-collaboration-store.ts) 每读遍历全部 entries、重建七个 Map，再物化七组数组；相同键后写覆盖，但保留 Map 首次插入顺序。
- [TeamNotificationJournal](../../apps/desktop/src/main/agent-teams/team-notification-journal.ts) 的 isStopped/read/pending/contexts 多次全历史扫描；pending 还对当前 workItems 逐项查找。`notificationIds` 是持久准入回执，不是临时 Set 的替代品。
- [scheduleNotification](../../apps/desktop/src/main/agent-teams/team-turn-coordinator.ts) 在 `pendingContinuations` 已占用时退出；finally 当前只删 key。[恢复扫描](../../apps/desktop/src/main/agent-teams/team-recovery-monitor.ts) 间隔为 30,000ms，但通知是否因此延迟尚未复现。
- [TeamSharedContextService.generate](../../apps/desktop/src/main/agent-teams/team-shared-context-service.ts) 已复用 checkpoint/generation；仍先 project、排序、生成 import records 与 raw fingerprint，再判断 checkpoint 命中。
- [EventStream](../../packages/ai/src/utils/event-stream.ts) 的 event queue 与 waiter queue 都用数组 `shift()`；本仓另有 fail/reject、无结果 end 报错等严格协议，不能被外部简单流实现覆盖。

## 当前结论

### 1. Pi：只替换 FIFO 数据结构，不照搬流协议

**机制与锚点**：Pi 的 `FifoQueue` 用 incoming/outgoing 两个数组；入队 push，出队时仅在 outgoing 空时倒转 incoming，随后 pop。[p-queue]
每个元素至多跨栈一次，给出摊销常数级出队机制；这不是真实任务 wall time 的测量结论。
EventStream 优先将新事件交给最早 waiter；迭代先排空 queue 再处理 done，保留结束前已缓存的事件。
第一方测试覆盖先缓冲后消费、消费中再入队、waiter 注册顺序、end 后 drain。[p-tests]

**本仓等价物/差距**：已有同类 EventStream 和生产消费者；差别主要是 FIFO 表示，不缺事件流能力。
本仓 `fail()` 会拒绝 waiter/result，并在已缓冲事件排空后向迭代器抛错；`end()` 无结果属于协议错误，而 Pi 相应测试接受正常结束。
因此只借鉴双栈或游标队列，保留本仓分支、异常和终止时序；不引入外部包，不复制 Pi 文件。

**最小兼容想法**：TASK-0397 先测快生产/慢消费的真实 EventStream 路径；若搬移成本显著，仅替换私有 queue 容器。
仍允许按需优化 waiter queue，但通常 waiter 少，应单独确认收益；禁止为了减队列长度丢弃 delta 或提前完成 result。

**正确性/性能验证**：保留 FIFO、终止一次、complete 后忽略 push、多个 waiter、`end(undefined)` 与 `end()` 区别、判定/提取回调抛错、fail 后 drain。
比较交替生产消费和 1k/10k/100k 突发积压，分别计总耗时、分配/保留内存与最长同步段；加生产 engine fake-stream 连续流程，核对事件和 usage/stop。
**不采纳理由**：若生产队列通常接近空且差异低于噪声，则不改；双栈首次倒转仍有 O(n) 单次工作，不宣称解决背压或无界积压。

### 2. 工具并发：三家实现证明的是不同安全合同，不是“越大越快”

**Pi**：`executeToolCalls` 遇任一 sequential 工具时整批串行；并行路径有序准备后对全部已准备调用 `Promise.all`，按输入顺序生成结果；该路径未见数值并发上限。[p-tools]
**Codex**：`ToolCallRuntime` 持有共享 `RwLock<()>`；supports_parallel 取读锁，其他取写锁；readiness 与准入等待可取消，handler 某些取消路径仍需等待其终态。[c-parallel]
该锁证明共享/独占门控，不能从该文件推导整个产品具有某个固定并发数。
**OpenHands**：`ParallelToolExecutor(max_workers=1)` 的专用线程池限制每批实际执行数，按 futures/gather 输入顺序返回；资源声明决定锁键，未声明时退到工具名锁。[o-parallel]
锁安全依赖正确的 `declared_resources()`；每实例/批次的线程池限制不等于整个多 Agent 系统有全局预算。

**本仓等价物/差距**：现有窗口 4 + parallel-safe + exclusive + steering 已满足本批保守需求，比“全部 Promise.all”更受限。
窗口后等待所有已启动结果是既有 steering 时点；滑动补位、流中提前启动工具或按完成顺序提交都不是纯性能重构。

**最小兼容想法**：借鉴 Codex 分开记录 dispatch waiting 与 execution started 的边界；先将等待、授权、工具体、结果提交分别归因，而不是先调并发。
若工具名查找成为热点，可在同一次工具快照内建索引；必须保持原 `.find()` 的首项命中与未知工具行为，不能默认重复名不存在。
**正确性/性能验证**：固定 1/4/8 个调用，混合 safe/exclusive、慢首项、授权拒绝、取消和窗口中 steering；记录最大同时活跃数、开始/提交轨迹与阶段耗时。
**不采纳理由**：不照搬 Pi 无数值上限的批执行、Codex Rust 锁实现或 OpenHands Python 线程池；语言运行时不同，资源声明也不能替代本仓授权。

### 3. OpenHands：按稳定身份维护派生视图，非追加路径显式重建

**机制与锚点**：`Event` 配置 `frozen=True`；追加时通过 `model_copy` 设置 parent，而不是改原事件。[事件模型][o-event]、[追加与视图][o-view]
`ConversationState.view` 以 active leaf 作标记：相同 leaf 直接返回；旧 leaf 是新 leaf 祖先时只 replay tail；分支切换或增量失败回到 `View.from_events`。[o-view]
这依赖事件树和稳定事件身份；`View.append_event` 实际原地修改列表，不能将其误称为深不可变快照。[o-view-impl]
完整重建还会 enforce tool-call/batch 等属性，增量路径并非每次执行同样的全量校验；这一差别不能机械套到 Team 校验上。
`EventLog` 另持有 ID↔index 与反序列化缓存；append 更新索引，长度 marker 失效时回查磁盘，重建失败/缺失需回退。[o-log]
其 `_sync_from_disk` 仍调用目录重扫，不能仅凭注释称为“所有恢复都是 O(新增量)”。

**本仓等价物/差距**：Team 已有持久日志、revision 和纯投影，但反复 read 重新做七类校验/折叠；不需要更换存储格式。
**最小兼容想法**：TASK-0395 先做同一不可变 document 快照的投影缓存，用弱持有或有界生命周期避免保留所有历史文档。
必须先核实生产读接口是否返回稳定快照、所有 mutation 是否换身份/增 revision；只用 sessionId 或 entries.length 不足以判同一内容。
跨文档引用但同 revision 的恢复/替换不能误命中；无法证明等价就全量回退。热路径不靠每次全量 hash 验证缓存，否则可能抵消收益。
缓存对外数组应保持只读合同；旧结果不得被下一次增量更新污染，不能照搬 OpenHands 可变 View 的别名行为。

**正确性/性能验证**：保留未缓存全量投影作 oracle；混入七类记录、无关/畸形条目、重复 ID 修订，逐步比较全部值与顺序。
覆盖冷读、同快照热读、正常追加、等长替换、恢复/回退、旧快照回读、并行 session、无 coordination；分别报告命中率、耗时和内存。
OpenHands 的 `test_state_view_cache.py` 已展示 full-rebuild 等价、重复读取、恢复重建与重建失败保留旧缓存等测试题材；并非本仓已通过证据。[o-view-tests]
**不采纳理由**：第一轮不做增量事件数据库；未证明 append-only 或旧结果隔离前，不跨 revision 增量；不移植文件锁/长度 marker 到本仓内存文档。

### 4. Codex + Pi：完成通知必须区分入队、准入与消费

**机制与锚点**：Codex `notify_parent_of_terminal_turn` 捕获终态后经控制器路由，不保留子 Agent 活跃 turn context；completion 的 `trigger_turn=false`。[c-completion]
文件明确 best-effort；指标记 `queued`/`failed`，没有把发送成功称为“已消费”。卸载会话的 mailbox 在锁内追加/take，并用 watch 发布是否非空。[c-mailbox]
Codex 测试区分 reasoning/commentary 后接续、sleeping root 唤醒和 final answer 后不重启；queue-only 不等于任何时点都自动再跑。[活跃回合测试][c-pending-tests]、[休眠唤醒测试][c-sleep-tests]
Pi 主 loop 则在自然退出前检查 follow-up，必要时回到外层循环；长 prepare 后还会重取此前未取到的 steering。[p-loop]
这说明“检查结束条件时再看新增输入”的设计价值，但不能证明本仓 Team 竞态或代替持久恢复。

**本仓等价物/差距**：已有成员 lane、持久 notice、notificationIds 回执、stop generation 与恢复扫描；不缺 mailbox 基础设施。
待验证时序是 A notice 已被选取 → initiator 正在 continuation → B notice 到达却被 pending key 抑制 → A 收尾只删除 key。
**最小兼容想法**：TASK-0396 用显式闸门复现；若成立，在释放 pending key 后针对新待准入 notice 再检查/调度，仍走原成员 lane 与原准入逻辑。
只对“本轮期间新增且仍有效”的工作安排下一次 drain；失败、不可准入、已 stop 或无进展时交回原恢复/退避，不无条件递归重排。
新通知到达与释放 key 的所有交错都要覆盖；已有 key 只是并发抑制，不是持久完成证明。

**正确性/性能验证**：用 fake clock + deferred 同步点固定 A/B 顺序，不等待真实 30 秒；断言 B 无需扫描即可准入且仅一次。
另覆盖 B 在收尾前后、stop 中途、同 revision 重复 notice、旧 revision 过期、准入失败、持久化后崩溃恢复；没有新 notice 时不能产生空模型回合。
记录 notice 持久化→准入、准入→结果、恢复扫描唤醒次数，区分调度延迟与模型耗时。
**不采纳理由**：不能把 Codex best-effort 内存 mailbox 当成本仓 durable journal；不能用更短轮询、模型心跳或“总是再跑一轮”掩盖丢唤醒。

### 5. 共享上下文：缓存投影与 Provider prompt cache 是两层问题

**外部参照**：OpenHands 按 leaf 复用本地 View、按事件 ID 索引原始事实；Pi 只在模型调用边界执行 `transformContext/convertToLlm`。[视图][o-view]、[索引][o-log]、[模型边界][p-loop]
两者支持“源事实→可复用派生视图→模型边界转换”的职责分离，但没有证明不同 Agent 的私有上下文可以混用。
OpenHands LLM 另有 prompt-cache 过小后的无标记重试，说明 Provider 缓存有独立能力/阈值约束，不是本地缓存命中即可保证。[o-provider-cache]

**本仓等价物/差距**：已有共享 checkpoint、sourceFingerprint、generation、成员 receipt，以及 production prompt-cache diagnostics；不是缺缓存开关。
当前 checkpoint 命中仍支付前置投影、排序和 fingerprint 成本；是否主导 CPU 必须在 TASK-0395 后重新归因。
**最小兼容想法**：仅当这些步骤仍是热点，另开窄切片缓存确定性公共投影/物化结果，复用现有 checkpoint 和摘要结果。
候选 key 至少覆盖源快照/有效 revision、policy、活跃成员/可见性、member handles 与 currentRequestId 等实际输入；成员私有 delta 仍在各自边界组合。
不能只按团队 ID、checkpoint ID 或模型名缓存所有最终消息；当前请求排除规则或成员权限变化会使旧投影不适用。
**正确性/性能验证**：逐成员比较模型输入、顺序、指纹、receipt 与 generation；覆盖成员变化、权限/policy 变化、恢复和并发请求。
统计 project/序列化/fingerprint 次数与 CPU、冷暖命中及 retained heap；Provider cacheRead/费用和真实任务时长另需授权实验，本轮未测。
**不采纳理由**：不缩短上下文、不改 prompt、不新调模型生成缓存摘要、不共享成员私有上下文；不把 Provider cache retention 设置当作本地状态优化。

## 被否决的方案

| 方案 | 拒绝原因 / 重新考虑信号 |
| --- | --- |
| 整体迁移 Pi/Codex/OpenHands 内核 | 本仓生产 engine、持久 Team 与权限合同已齐；语言和生命周期不等价，无替换必要证据 |
| 默认增加并发、窗口改滑动补位 | 改变 steering/失败止损/授权边界；只有另立行为合同与受控测量才考虑 |
| 所有读都维护复杂增量索引 | 先证明同快照缓存仍不足；非追加、替换与恢复成本不能隐藏 |
| 事件队列限长丢事件/合并 terminal | 改变协议；本批仅优化存取，不改变事件内容或背压合同 |
| finally 无条件续跑/缩短恢复间隔 | 无进展或失败时可能 busy-loop、额外模型费用；应以新增可准入 notice 驱动 |
| 全局共享最终 Prompt/去掉指纹检查 | 可能跨成员泄露与错误命中；只能缓存经证明等价的确定性中间结果 |

## 代码/测试/指标锚点

下表是交给实现 Task 的验证合同，不是本 worker 已执行结果。

| Task | 本地现有锚点 | 最低证据与性能口径 |
| --- | --- | --- |
| TASK-0395 | [store 测试](../../apps/desktop/src/main/agent-teams/team-collaboration-store.test.ts)、[journal 测试](../../apps/desktop/src/main/agent-teams/team-notification-journal.test.ts) | 全量 oracle 差分；小/长历史 × 1/4/8 成员 × 冷/热/追加；总耗时、p95、内存 |
| TASK-0396 | [session concurrency 测试](../../apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts) | 真实内部调度装配 + fake Provider；可失败 A/B 交错基线，准入一次、无空回合 |
| TASK-0397 | [EventStream 测试](../../packages/ai/test/event-stream.test.ts)、[engine 差分测试](../../packages/agent/test/agent-engine-differential.test.ts) | 队列协议差分 + production engine 流程；积压/近空分报，不仅测裸数组 |
| 后续共享投影 | [成员上下文测试](../../apps/desktop/src/main/agent-teams/team-member-context.test.ts) | 公共 checkpoint 等价、私有 delta 隔离；前置 CPU 与 Provider cacheRead 分开 |

基准保持相同输入/语义/运行时，热身后交错 A/B、多轮中位数及离散度，留出规模/种子；含冷读/内存回退，收益低于噪声不保留。
实施阶段按仓库 Node runner、test:impact/适用 test:changed 与完整 check 执行；本研究禁止跑测试，未产生性能数字。

## 失效条件与置信度

- 外部机制：高置信度，仅限固定 SHA 已读取函数；未执行外部测试，不推导生产 SLA、全局并发预算或版本兼容。
- 本仓扫描/队列表示：高置信度源码事实；热点占比与缓存命中率未知，不据此宣称已加速。
- 30 秒通知等待：中等置信度竞态假设；必须由 TASK-0396 确定性复现或证伪后才能登记为已确认 Bug。
- 快照缓存：条件性建议；若文档被原地修改、revision 不完整或消费者依赖可变返回值，应改失效设计而非绕过合同。
- 调度、文档所有权、上下文 policy、外部上游版本改变时重新核查。源码中的 frozen/readonly 不等于深不可变运行时保证。

## 下一步触发信号

1. Coordinator 已回读本研究并直接复核 Pi FIFO、Codex completion、OpenHands state 三份固定 SHA 原始源码，链接/适用边界成立；研究 done 不代替任何优化工程或集成验收。
2. TASK-0395 优先同快照缓存与正确性 oracle；只有剩余热点证明需要时再增量化 journal/关联索引。
3. TASK-0396 先固定中途通知时序；成立才补 drain，证伪则记录反证，不制造修复。
4. TASK-0397 优先评估 EventStream FIFO 的独立收益，保留本仓更严格终态合同；不同时修改并发策略。其当前 write_paths 未含 `packages/ai/`，采纳前先由 Coordinator 更新 Owner/路径/消费者验证合同，不能直接越界写入。
5. 本 worker 仅新增本文件；索引、Task 状态、发布说明与集成由 Coordinator 统一处理，未触碰代码/配置/Git，未运行测试、模型或付费 API。

### 固定源码引用

[p-license]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/LICENSE
[p-manifest]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/packages/agent/package.json
[p-queue]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/packages/ai/src/utils/event-stream.ts#L3-L88
[p-tests]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/packages/ai/test/event-stream.test.ts#L5-L95
[p-tools]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/packages/agent/src/agent-loop.ts#L518-L669
[p-loop]: https://github.com/earendil-works/pi/blob/ede2c9b468d8e061c557d16957513715e6d49cd6/packages/agent/src/agent-loop.ts#L172-L417
[c-license]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/LICENSE
[c-parallel]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/codex-rs/core/src/tools/parallel.rs#L125-L318
[c-completion]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/codex-rs/core/src/agent/control/completion.rs#L1-L154
[c-mailbox]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/codex-rs/core/src/agent/control/mailbox.rs#L23-L115
[c-pending-tests]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/codex-rs/core/tests/suite/pending_input.rs#L1046-L1200
[c-sleep-tests]: https://github.com/openai/codex/blob/1c0c45bfc372fb7d7d581508fdef5eef8235eab7/codex-rs/core/tests/suite/pending_input.rs#L523-L610
[o-license]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/LICENSE
[o-parallel]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/agent/parallel_executor.py#L51-L311
[o-event]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/event/base.py#L20-L39
[o-view]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/conversation/state.py#L304-L404
[o-view-impl]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/context/view/view.py#L111-L160
[o-log]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/conversation/event_store.py#L53-L308
[o-view-tests]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/tests/sdk/conversation/test_state_view_cache.py#L41-L232
[o-provider-cache]: https://github.com/OpenHands/software-agent-sdk/blob/dd0892c80fffb1e59bac77242adafbd8b1168649/openhands-sdk/openhands/sdk/llm/llm.py#L1956-L1974
