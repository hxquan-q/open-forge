---
id: RESEARCH-0047
type: research
status: done
priority: P1
owner: runtime-core/runtime-subagents
source: user-request; earendil-works/pi-source; GitHub-issues-and-commits; current-source
created: 2026-10-28
updated: 2026-10-28
related_requirement: []
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Pi codemode worker 排队、并发限制与 Open Forge 内核参考

## 问题与范围

核查 `PI_CODEMODE_MAX_WORKERS`、`Pi codemode worker limit reached`、codemode 排队与多智能体失败的官方来源，并对照 Open Forge 当前内核的准入、取消和资源释放合同。用户本轮只要求调研，不实施运行时、配置或公共合同变更。

本仓基线为 `bf15534dd931998b510ada94d787df8e834d072d`。已有 `.ua` 图谱分析于 2026-10-12，基线 `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`；已验证该 commit 并比较目标目录增量，相关当前源码与测试优先于旧图摘要。

## 事实来源

- Pi 官方仓库为 `earendil-works/pi`，固定源码 SHA `b9e3eef6c2e192f69f387c8f95245639c413d549`；旧 `pi-mono` 名称不代表另一套 codemode 实现。
- [官方 codemode 限制](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/docs/codemode.md)、[环境变量](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/docs/environment-variables.md)、[宿主执行与准入](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/src/extensions/codemode/execute.ts)。
- [官方 Issue #11184](https://github.com/earendil-works/pi/issues/11184) 与 [仍未解决的跨会话等待 Issue #11350](https://github.com/earendil-works/pi/issues/11350)。Issue 中的报告和第三方方案分别标识，不视作主仓已合并行为。
- [worker 生命周期修复 3daa20280](https://github.com/earendil-works/pi/commit/3daa20280f6a7c7cbe0935680c9a38fdc3863005)、[FIFO 准入修复 885a564b3](https://github.com/earendil-works/pi/commit/885a564b3b22dc6eefd55a78a8f6bb757ddfbc69)、[v1.4.0 发布](https://github.com/earendil-works/pi/releases/tag/v1.4.0)。
- [sandbox 宿主与退出回调](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/codemode/src/runtime/host.ts#L13-L68)、[准入回归测试](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/test/codemode-worker-admission.test.ts)、[官方 subagent 示例扩展](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/examples/extensions/subagent/index.ts)。
- 本仓当前源码：`packages/runtime-subagents/src/subagent-dispatcher.ts`、`subagent-pool.ts`、`subagent-run.ts`；`packages/agent/src/engine/tool-executor.ts`；`packages/runtime-core/src/kernel/session-input-queue.ts`；`packages/runtime-tools/src/coding/async-execution-gate.ts`。

## 当前结论

**Pi 的主要改进是把短时容量不足从工具错误变成有期限、可取消的等待，同时按实际 worker 生命周期记资源账。Open Forge 已有子代理 FIFO 与窗口并发，更有价值的增量是分清限制作用域、补齐资源等待与持有诊断，以及把有界逻辑收尾和物理资源释放分开。** 本轮没有证据支持直接提高本仓默认并发，也不建议替换内核。

### 1. 已合并、已发布与仍在讨论的区别

| 变更 | 版本/时间 | 行为与证据 |
| --- | --- | --- |
| 取消及时返回与残留 worker 限制 | `3daa20280`，2026-10-13 UTC，随 v1.3.0 | Bun 内置计算可能暂不响应中断；脚本结果可先终结，但名额保留到真实 exit，防止不断新建残留 worker。见上述生命周期修复与 `host.ts`。 |
| 满额从立即报错改为 FIFO 等待，新增环境变量 | `885a564b3`，台北 2026-10-21 02:50；随 v1.4.0 | [#11184](https://github.com/earendil-works/pi/issues/11184) 已 closed/completed；不是待实现建议。 |
| v1.4.0 发行 | CHANGELOG 标 2026-10-21；GitHub 发布时间为台北 2026-10-22 06:49 | 同一事件采用不同日期来源，应区分提交、版本文档与实际发布。 |
| 长脚本占满名额、交互会话等待超时 | [#11350](https://github.com/earendil-works/pi/issues/11350)，调查时仍 open | 主仓当前源码仍是单一 FIFO；第三方 fork 的公平性/holder 诊断建议不能当成上游已落地。 |

### 2. 队列化是什么，何时仍会失败

codemode 是让模型提交一段受限 JavaScript，在 worker 内组织工具调用、过滤/聚合结果后再交给模型。worker 是脚本运行的资源单位，不是完整子代理身份。Pi 每次执行创建 worker/VM，完成后终止；这里的队列不是预先启动并复用常驻 worker 的池。

限额为 2 时，A/B 正在运行，C/D 到达：旧版直接拒绝 C/D；新版让 C/D 在宿主内排队，尚不创建其 worker。A **实际退出**才让 C 启动，D 继续等待。作用是吸收突发，既没有增加实际并行度，也不提供持久队列、断点恢复、自动重试或运行中抢占。

| 合同 | 固定 SHA 的实际行为 |
| --- | --- |
| 作用域 | coding-agent 宿主进程内所有 session 共享；同进程 SDK 子代理同样竞争。独立 `CodemodeSandbox` 库通过可选 `acquireWorker` 接宿主，不是库本身强制所有宿主只能开 2 个。 |
| 容量默认/配置 | 默认 2；`PI_CODEMODE_MAX_WORKERS` 用 `Number(...)` 转换后接受大于 0 的整数，缺失、0、负数、非整数、非数字回退 2；源码没有额外安全上限。 |
| 配置读取 | 每次准入/预留读取进程环境，不是每 session 偏好项。由源码推断：降低值不抢占在途 worker，仅改环境变量也不主动触发队列唤醒。 |
| 排队规则 | FIFO；无 session key，也没有队列条数上限。最长容量等待 60 秒。 |
| 脚本时限 | 设置的 `timeout_ms` 包含排队时间；获准后扣掉已等待时长。实际等待上限为总 deadline 的剩余预算与 60 秒的较小值。 |
| 未设脚本时限 | 整体 deadline 为 Infinity，但准入仍最多等 60 秒；获准后的执行不因这个 60 秒获得总运行时限。设置更长脚本时限也不会延长排队上限。 |
| 取消/启动失败 | 排队取消移除 waiter；执行取消可能先返回结果、稍后才真正退出；构造失败归还名额，WASM 加载迟到不能启动已终结脚本。 |
| 资源释放 | worker 真实 exit 归还资源名额，不能仅凭脚本 Promise 已结束就归还。 |
| 内存 | 每脚本 QuickJS VM heap 上限为 256 MiB；不是整个 worker/进程的 RSS 上限，不表示启动即预留全部内存。 |

源码锚点：[容量、FIFO 与校验 L58–110](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/src/extensions/codemode/execute.ts#L58-L110)、[排队错误、deadline 与剩余预算 L553–619](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/src/extensions/codemode/execute.ts#L553-L619)、[物理退出释放](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/codemode/src/runtime/host.ts#L13-L68)。

旧版 v1.3.0 在已有 2 个仍运行或退出中的 worker 时抛出 `Codemode worker limit reached`；源码异常没有检索词中的 `Pi ` 前缀。它是本地 sandbox 容量错误，不是 Provider RPM/TPM 或通用 Agent 数量配额。见 [v1.3.0 guard](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/extensions/codemode/execute.ts#L515-L530)。

v1.4.0 则先等：60 秒仍无名额、较短脚本 deadline 已耗尽或用户取消，依然可能失败；排队阶段失败会附 `The script did not start.`。执行已经启动后的工具/模型/sandbox 错误属于另一阶段，不能对两者统一盲重试。遇到旧报错应先核对**实际加载的包/打包版本**；旧版本不识别新环境变量，设置它不会修复旧版。

### 3. `PI_CODEMODE_MAX_WORKERS` 如何设置与选值

PowerShell，在启动 Pi 或使用它的 SDK 宿主进程之前设置：

```powershell
$env:PI_CODEMODE_MAX_WORKERS = "4"
pi
```

SDK 宿主可在进程启动配置中设置，或在创建会话前写入 `process.env.PI_CODEMODE_MAX_WORKERS = "4"`。不要让各 session 相互覆盖进程级偏好。Open Forge 当前 `packages/`、`apps/` 的 TypeScript 与包清单检索未发现 codemode/QuickJS 接入或读取该变量；给本仓设置同名变量不能代替自有调度配置。

上游默认是 2，没有给所有机器统一推荐 4/8。工程上可将 **4 作为同进程多会话的第一档实验值**，根据活跃脚本数、持续时长、排队 p95、超时率、RSS 和底层工具/Provider 在途数决定是否保留。4 个 VM heap 上限合计可达 1 GiB，8 个可达 2 GiB，还须给宿主、模型上下文和工具结果留余量；这不是实测常驻占用。无限上调只是把拥塞转移到内存、CPU 或外部服务。

### 4. Pi 子代理并发与 codemode 并发是不同层

| 层 | 限制与作用域 |
| --- | --- |
| codemode 脚本 worker | coding-agent 宿主进程共享默认 2，可由该环境变量改变。 |
| 单脚本的分类/生图模型调用 | `models.classify` / `models.generateImages` 最多 4 个同时在途，更多调用在该脚本内部排队；提高 worker 数不改变此常量。 |
| 官方 subagent **示例扩展** | 每批 parallel 最多 8 项，实际同时启动 4 个独立 Pi 子进程；其余由示例 `mapWithConcurrencyLimit` 调度。这不是所有 Pi 扩展/宿主共同的子代理上限。 |

来源：[模型调用限制](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/src/extensions/codemode/execute.ts#L49-L56)、[示例子进程说明与常量](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/examples/extensions/subagent/index.ts#L4-L35)、[示例批次校验与调度](https://github.com/earendil-works/pi/blob/b9e3eef6c2e192f69f387c8f95245639c413d549/packages/coding-agent/examples/extensions/subagent/index.ts#L603-L643)。

多代理失败的典型条件是**同进程**多个 session 同时申请 codemode；独立 Pi 子进程各有自己的资源计数，默认 2 不构成整个操作系统所有 Pi 进程的总上限。底层 Provider 配额又是另一约束。[#11184](https://github.com/earendil-works/pi/issues/11184) 的失败次数仅为报告者环境观察，不能外推成普遍失败率。

### 5. FIFO 仍未解决的公平性和资源等待环

[#11350](https://github.com/earendil-works/pi/issues/11350) 报告两个同进程子代理的长脚本占满名额，主会话连短脚本也反复等 60 秒失败。源码的 worker 从启动到 exit 一直占槽，等待 bash/模型/工具 I/O 同样占槽；FIFO 只决定有名额时谁先拿，不能让长任务主动让出。

该 Issue 的[第三方回复](https://github.com/earendil-works/pi/issues/11350#issuecomment-6376522496) 提出按 session 有界让行，以及显示 holder 的 session/tool-call ID、持有时长和 pending tool 名称。固定主仓快照未实现这些机制。公平排队也不能抢占正在运行的 worker，不能承诺任何 deadline 都能获准。

**设计推断，未在本仓复现**：若父 codemode 持有全部名额并同步等待同进程子代理，而子代理又要申请同类 worker，会形成资源等待环。60 秒只让该等待最后变成错误，调大上限不能从原则上消除。控制/等待路径应避免依赖自己占住的执行预算；未来接入 codemode 时应显式覆盖此类场景。

### 6. Open Forge 已有合同与真实增量

| 当前机制 | 已核实的源码事实 | 对本次调研的含义 |
| --- | --- | --- |
| 单子代理准入 | [subagent-dispatcher.ts](../../packages/runtime-subagents/src/subagent-dispatcher.ts#L21) 默认 `maxConcurrent=3`；`spawn()` 满额拒绝，终态 `followUp()` 无名额也拒绝。 | 每个父会话 coordinator 的限额，不能描述成全进程总计 3。产品/SDK 已有 `subagentMaxConcurrent` 选项。 |
| 批量 workflow | [批量准入](../../packages/runtime-subagents/src/subagent-dispatcher.ts#L89) 接受后溢出进入 `queued`；[pool](../../packages/runtime-subagents/src/subagent-pool.ts#L85) FIFO 补位；[工具 Schema](../../packages/coding-agent/src/composition/subagent/tools/dispatch-workflows/dispatch-workflows-tool.ts#L7) 每次批次最多 8 项。 | 已有队列化，不需要重新发明；单批最多 8 不等于跨多次调用存在队列总长度/等待时限。已核查 pool/dispatcher 没有通用 queue deadline/总长度预算。 |
| 工具执行窗口 | [tool-executor.ts](../../packages/agent/src/engine/tool-executor.ts#L50) 每次调用默认窗口 4；仅 `parallel-safe` 工具体重叠，其他工具形成独占窗口，授权与结果顺序受保留。 | 这是每次执行的局部窗口，多个会话/子代理可各自有窗口；不能当成全进程只有 4 个工具在途。 |
| 用户输入队列 | [session-input-queue.ts](../../packages/runtime-core/src/kernel/session-input-queue.ts#L54) 管理 steering/follow-up、身份、暂停和恢复。 | 拥有的是用户/控制输入顺序，不能直接充当物理 worker 的资源预算。 |
| 专项共享资源 gate | [OCR gate](../../packages/coding-agent/src/tool-policy/ocr-execution-gate.ts#L3) 已按进程模块共享，默认 1；[FIFO 基元](../../packages/runtime-tools/src/coding/async-execution-gate.ts#L4) 在操作 Promise 收敛后释放。 | 本仓并非完全没有跨会话资源限制；该基元未含 AbortSignal、排队 deadline/长度上限，也不表达实际 worker exit。 |
| 中断与调度槽释放 | [subagent-run.ts](../../packages/runtime-subagents/src/subagent-run.ts#L338) 中断后先等 abort/idle；默认收尾宽限 10 秒，到期仍可 `markSettled`；[dispatcher](../../packages/runtime-subagents/src/subagent-dispatcher.ts#L262) 才释放槽并补位。 | [BUG-0001](../bugs/BUG-0001-session-terminal-state.md) 明确要求有界收尾，避免忽略 AbortSignal 的子会话卡死整个 coordinator。逻辑可再调度不证明底层所有资源都已退出。 |

在所核查的子代理/工具入口中，没有找到覆盖所有会话与全部重资源的统一总预算；该结论不否认上述 OCR 专项 gate，也不宣称已审计所有宿主资源。`spawn_agent` 工具当前直接走 `spawn()`，`dispatch_workflows` 走批量路径，因此“一个报错、一个排队”是既有公开行为，不宜借优化静默统一。

### 7. 建议优先级与归属

1. **先补等待与资源归因。** 在现有 observation/宿主边界区分入队、准入、执行、取消结果、收尾和实际释放，记录 queue wait、占用时长、live/exiting、每 session waiter/holder 数。诊断只用稳定 ID、工具名与耗时，不复制脚本正文、参数或私有数据；新增观察投影不应擅改持久化终态。
2. **再按真实重资源补宿主共享预算。** 保留父会话子代理限额和工具窗口；为测得会争用的 VM/OCR/浏览器等资源分别定义容量、可取消等待、排队上限、总 deadline 和 owner。通用合同由 Runtime 所有，具体线程/进程生命周期由 Host Adapter 注入，产品默认值由 Coding Agent/宿主选择；`agent` 包不接管 Session Queue 或进程生命周期。
3. **把逻辑槽和物理资源租约分开。** 保留 BUG-0001 的 10 秒有界收尾；若物理 worker 仍存活，保留单独的资源占用/退出观测与宿主处置能力。不能只因 markSettled 就无限补建物理 worker，也不能让 UI/Coordinator 无限等退出。后续是否终止隔离进程必须由实际宿主能力和兼容合同决定。
4. **容量竞争证据出现后再做会话公平。** 可比较按 session 轮转、每 session 份额或有限让行；需要同时测交互短任务与长后台任务，防止主会话被后台突发长期挤占。不要声称 Pi 已完成这一步。
5. **显式选择等待还是拒绝。** 若未来给单次 spawn 提供排队，应使用明确合同并保留现有默认/兼容路径；不能一律改为盲重试或无限排队。已有 workflow 排队先补可观察 deadline、队列总预算与取消证据，再考虑提高并发。

相关背景见 [RESEARCH-0043](RESEARCH-0043-agent-execution-performance-references.md) 与已完成的 [PLAN-0024](../plans/PLAN-0024-agent-kernel-team-execution-performance.md)。既有窗口 4 的收益/语义不能用此次 Pi worker 改动推翻；新建议尚未立项实施。

## 被否决的方案

- 直接上调本仓子代理默认数或照搬 Pi 的环境变量：当前资源层和所有者不同，缺少本仓负载基线。
- 将 FIFO 等同于跨会话公平或保证成功：长任务仍可能占满全部 worker，排队仍可能超时。
- 改成无限等待子代理退出后才释放逻辑槽：违反本仓 BUG-0001 的有界中断收尾合同。
- 把 Pi 的缺省 60 秒直接套到所有本仓任务：交互工具、长流程和物理资源的 deadline 所有者不同，应按实际合同设计。
- 直接引入整个 Pi codemode 或第三方调度框架：本仓本轮未提出脚本编排产品需求，现有 Runtime 所有权与授权审计仍须先满足。

## 代码/测试/指标锚点

2026-10-28 在 `packages/runtime-subagents` 运行仓库 Node runner：

```powershell
bun ../../scripts/quality/run-vitest.mjs --run test/coordinator-api.test.ts test/coordinator-scheduling.test.ts test/coordinator-terminal-state.test.ts
```

结果：3 个文件、20 个测试通过，覆盖单次 spawn 满额拒绝、批量 FIFO 补位、排队取消、正常中断等待 idle，以及收尾不响应时有界释放逻辑槽。未调用真实 Provider、付费 API 或用户运行实例；未测量真实模型吞吐/内存收益。

文档验证：`bun run check:quick -- project/research/RESEARCH-0047-pi-codemode-worker-admission.md project/research/README.md` 通过（Markdown 未由 Biome 处理，全量静态 guards 通过）；`git diff --check` 通过，13 个本地文档/源码链接目标存在，Research 模板所需章节完整。本轮仅新增研究记录和索引，无运行时代码变化；未运行完整类型检查/构建、上游测试或真实模型性能实验。

Pi 上游测试本轮只读未执行；其 `codemode-worker-admission.test.ts` 包含实际退出才释放、排队取消/deadline、WASM 加载迟到、突发只启动限额数量、环境变量与非法值回退。这些是未来资源 gate 可借鉴的合同，不是本轮在 Open Forge 验证通过的 codemode 能力。

若后续实施，最低验证场景应包括：多会话同时突发、队列总预算、排队取消/总 deadline、长任务占满、启动失败/迟到、取消已返回但资源未退出、动态减限额不超发、逻辑收尾到期后物理资源仍存活，以及父子代理共享预算的等待环。正常连续用户流程应从公开工具/Session 入口进入，不只测私有计数器。

## 失效条件与置信度

源码与现有测试可确认指定快照的合同；Pi 后续发布、Issue 状态变化或本仓改动准入/资源所有权时应复核。未把静态源码、合成测试或上游修复外推为本仓真实模型任务的加速结果。

## 下一步触发信号

出现多会话下可归因的排队超时、真实资源超发或长期占槽证据，或者用户决定加入 codemode，才把对应建议转入实施 Task。只有用户后续要求实施，才按 Project 路由冻结兼容合同并修改运行时；本研究记录本身不授予实施许可。
