---
id: RESEARCH-0007
type: research
status: ready
priority: P1
owner: runtime-core/coding-agent
source: "user-request; GitHub 一手 README/ARCHITECTURE/源码/文档：cortexkit/magic-context（含 packages/pi-plugin 与概念文档）、badlogic/pi-mono（extensions/packages/skills/compaction/security 文档与 types.ts）、Haleclipse/CometixCode（Claude Code Rust 复刻源码常量与流程注释）"
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: []
depends_on: [RESEARCH-0004]
---
<!-- Copyright The Open Forge contributors. -->

# Agent 内核上下文管理三家对标：缓存稳定性、衰减确定性与插件钩子面

## 问题与范围

以 magic-context、pi 生态、CometixCode（Claude Code 的 Rust 1:1 复刻）为一手参照，回答一个问题：**Open Forge 内核（`packages/runtime-core/src/kernel/`）在上下文管理上还缺什么**。范围限定在消息上下文的缓存稳定性与衰减确定性；记忆子系统、dreamer、包分发与 UI 扩展不属于本文结论范围（只在钩子映射表中带过）。

与既有研究的关系：`RESEARCH-0004` 治理的是内存驻留（GUI 视图模型账本）；本文治理的是**模型上下文的 Provider 缓存账本**——两者独立。`exprot/kernel-replacement-feasibility.md` 的"不引入第二套事实源"原则本文继续有效。

## 事实来源

- **magic-context**（cortexkit，~2.2k stars，MIT）：README / ARCHITECTURE.md / STRUCTURE.md / CONFIGURATION.md / `packages/docs` 概念文档（cache-architecture、historian、context-reduction）/ `packages/pi-plugin` 源码与 PARITY.md / historian prompt 生成源文件。三路深挖（11+ 轮抓取）。
- **pi 生态**（badlogic/pi-mono，MIT）：`packages/coding-agent/docs/`（extensions.md / packages.md / skills.md / compaction.md / security.md / sdk.md / containerization.md）+ `src/core/extensions/types.ts` + [pi.dev/packages](https://pi.dev/packages) 画廊（5,693 包）+ 代表插件（pi-mcp-adapter ~1M/月、pi-subagents ~455K/月、pi-claude-bridge）。npm scope 已迁 `@earendil-works/pi-*`。
- **CometixCode**（Haleclipse，AGPL-3.0，~506 stars）：Claude Code 的 Rust 逐文件复刻，源码注释携带上游锚点（"copied from CC 2.1.88" 等），`src/services/compact/`、`src/utils/tool_result_storage.rs`、`src/utils/session_storage.rs`、`src/utils/permissions/`、`src/services/mcp/`。
- 本仓锚点：`packages/runtime-core/src/kernel/`（contracts.ts / turn-pipeline.ts / stateless-agent-core-turn-engine.ts / prompt-cache-layout.ts / runtime-observations.ts / runtime-message-context.ts）、`packages/coding-agent/src/compaction/`（microcompact.ts / context-pressure-reduction.ts / runtime/model-call-context-projection.ts）、`packages/ai/src/providers/anthropic/`（request.ts / messages.ts / cache.ts）。

## 当前结论

### A. 钩子面：Open Forge 内核已达到或超过 pi 宿主水平

| pi 钩子 | Open Forge 等价物 | 状态 |
|---|---|---|
| `context` / `context_with_system` 消息变换 | `ModelCallContextTransformer`（每次模型调用，含 envelope 身份） | 已有 |
| `before_agent_start` 系统提示注入 | `ModelCallContributionProvider` + `InstructionBlock.cacheability`（stable/volatile） | 已有，且优于 pi（pi 无 messages transform 时只能靠 before_agent_start 字符串拼接） |
| `session_before_compact`（取消/接管） | `ContextStrategy` 排他式拥有压缩全链 | 已有 |
| `sendMessage` `deliverAs: steer/followUp/nextTurn` | `SessionInputQueue` steer/followUp + `queuePromptIfRunning` | 已有 |
| `appendEntry`（持久但不进上下文） | `SessionContextRecord`（`modelVisible: false`） | 已有 |
| 稳定消息 id / entry 图 | `RuntimeMessageEnvelope` 持久 entry ID + `reconcileRuntimeMessageEnvelopes` | 已有（magic-context 在 pi 上被迫绕的坑） |
| turn-abort 原语 | 取消宽限截止（`cancelDeadlineMs`） | 已有 |
| 子代理派生 | `runtime-subagents` | 已有 |
| 工具注册 + 动态启停 | `ModelCallContribution.tools` + 每 Turn `bindForTurn` | 已有（渐进披露属产品层组合） |
| `cache_warming_decision`（空闲保温） | — | 缺，无对应产品需求，暂不立项 |

结论：**插件钩子不是缺口**。缺的是用这些钩子建立起来的纪律原语与度量（见 B/C/D）。

### B. 缺口一：消息上下文没有缓存稳定合同与度量

- 现状：系统提示词侧已有稳定前缀合同（`InstructionBlock.cacheability` → `compilePromptCacheLayout` → `systemPromptStableLength` → Anthropic 系统块断点，`packages/ai/src/providers/anthropic/request.ts:59-79`）与遥测（`runtime.prompt.frame` 的 `stableCharacterCount`）。**消息侧完全空白**：Anthropic Provider 把消息侧断点打在最后一条消息的最后一个块（`packages/ai/src/providers/anthropic/messages.ts:132-144`），意味着前缀中任何旧消息字节变化都使缓存失效，但内核既不度量也不观测。
- magic-context 的解法（参照系）：m[0] 冻结基线 + m[1] 易失增量双槽合成消息构成字节恒定前缀，每轮只有对话尾部移动；三级 bust 分类（SOFT+ 零破坏 / SOFT m[1] / HARD m[0] 折叠）+ 字节快照台账 + 审计脚本把每个 provider 请求与 pass 记录 join 归因。HARD 触发用白名单枚举（模型变化、缓存 TTL 过期、epoch 变化等），明确排除"新 compartment、会话内写记忆"等可走增量的变更。
- CometixCode 佐证：Claude Code 的 cache-driven microcompact **不改写消息**，只记 `PendingCacheEdits`，等 API 返回权威 `cache_deleted_input_tokens` 后才落 boundary——"客户端声明式删除 + 服务端计数"分离，避免客户端估算误差驱动缓存改写。

### C. 缺口二：衰减投影的清理时机被墙钟门推迟到缓存最贵的位置

- 现状锚点：`packages/coding-agent/src/compaction/runtime/model-call-context-projection.ts:43-48` 以 `maxAgeMs: 30_000` 调 `microcompact`（该路径 `pruneToolResults: false`，只清 thinking 块）；`now` 取 Turn 内固定的 `timeBoundary`。
- 代码验证修正（2026-09-24）：翻转机制真实存在，但因果方向与直觉相反——**keepRecent 窗口滑动本身是独立的前缀翻转源**（消息出窗即清，与墙钟无关）；30s 墙钟门的作用是把"出窗时仍年轻"的消息（Turn 内突发 ≥8 条带 thinking 的 assistant 消息的长 tool loop 群体）的清理**推迟到下一 Turn 边界**——恰是已缓存前缀最长、重算代价最高的时刻。若无墙钟门，这些消息会在 Turn 中段出窗当次调用被清（此时缓存前缀较短，代价低）。因此修复方向不是调大间隔（CC 的 60 分钟门同样只是推迟并把失效点钉在 Turn 边界），而是**把清理决策变成消息流坐标的纯函数（出窗即清）**，接受"出窗点"作为唯一切割位置。
- 翻转的另一特性：每条消息至多翻转一次，损害 = 翻转点之后已缓存区域的一次 re-read + re-write，仅在 Provider 缓存 TTL 存活期内有意义。
- 对照系：Claude Code time-driven MC 用 **60 分钟**间隔门 + `keepRecent 5`，且 **`tokens_saved == 0` 时整个变更废弃**（稳定性卫生）；magic-context 衰减是"每个 pass 预算压力只算一次并冻结、同段历史永远渲染相同字节"的幂等规则，保护尾部锚定在稳定边界（最后 compartment 结束处），丢弃模式打 tag 时冻结。
- `reduceContextByPressure` 的截断本身幂等（UTF-8 安全切片、已清结果有占位符身份检查），但以压力比率驱动，压力估算含 usage 噪声，存在围绕软阈值（0.5）振荡的理论空间；会话内压力单调升、压缩后回落与压缩自身的 bust 重合，属可接受。
- 附带发现：跨 Turn 的消息对象不保持引用身份——每次模型调用 `projectModelCallContext` 输出中，未被触碰的 user/assistant/toolResult 保留原引用，但 custom/bashExecution 消息（经 `convertToLlm` 转换）、被剪思考块的 assistant、压力剪裁过的 toolResult 每次都是新对象。任何基于 `===` 的前缀稳定性追踪在长会话下会系统性低估稳定前缀，必须以内容比较为主、身份仅作快路径。

### D. 缺口三（本轮仅登记，不实施）

- 分层摘要（historian 的 P1–P4 四层一次写入、渲染选层）vs 现有单发 `ContextCompactionRecord`。
- 跨会话记忆注入合同（m[0]/m[1] 布局是其在消息维度的投影）。
- Agent 主动 `ctx_reduce` 类工具（排队式丢弃 + tag 占位符）。
- 压缩后缓存卫生（CC：清 microcompact/classifier/CLAUDE.md 发现缓存，主线程与子代理区别对待）——与 `RESEARCH-0004` P1-4 部分重叠。

### E. CometixCode 携带的 Claude Code 常量（备查）

- auto-compact：有效窗口 = `contextWindow − min(maxOutput, 20000)`；触发阈值 = 有效窗口 − 13,000（Sonnet 200k → 167,000）；失败熔断 3 次；递归防护（compact 自身不再触发）；所有权互斥（context-collapse 启用时 autocompact 让位）。
- 压缩：摘要输出上限 20,000；全量压缩不保留原消息，摘要消息带 transcript 路径（信息不销毁）；boundary 三锚点（headUuid/tailUuid/anchorUuid）保证 resume 链重链；压缩后恢复最近 5 个文件状态（总预算 50,000 token、单文件 5,000）。
- 工具结果：系统级 50,000 字符落盘判定、单结果上限 400,000 字节、单消息预算 200,000 字符、超预算从最大者开始清且决策冻结；落盘预览 2,000 UTF-16 单元（纯头部）；幂等判定用 `<persisted-output>` 前缀。
- token 估算：`(UTF-16 长度 + 2) / 4`；图片/文档块硬编码 2,000 token。
- 续跑预算：完成阈值 0.9；收益递减判定 = 连续 3 次且最近两次增量 <500 token → Stop。
- 上下文服务 slot 化：collapse/snip/autocompact/reactive 各占固定控制流槽位、同构 Result（`messages + boundary_messages + tokens_freed`）、所有权门控而非同时生效。

## 被否决的方案

- **引入 magic-context 作为产品依赖**：它自带 SQLite 第二事实源、宿主排他（关宿主 compaction）与跨宿主池化，与 `exprot/kernel-replacement-feasibility.md` "不引入第二套 Session/Storage/Compaction 事实源"直接冲突；正确姿势是吸收机制进内核合同。
- **照搬 m[0]/m[1] 双槽**：需要消息注入位置与字节级冻结的整套合同，牵动 `SessionContextRecord` 投影与所有 transformer 实现方；应先落地度量（让 bust 可见）再谈布局。
- **把 pi 的 `cache_warming_decision` 等逐钩子对齐内核**：无对应产品需求，钩子面结论 A 已表明不必追平每一个。
- **在内核引入 CC 的 slot 注册表**：Open Forge 的 `ContextStrategy` 已经是单一 owner 槽位；slot 化适用于未来多个互斥上下文服务并存的场景，现在引入是过度设计。

## 代码/测试/指标锚点

- 本仓缺口锚点：`packages/ai/src/providers/anthropic/messages.ts:132-144`（消息侧断点在最后块）、`packages/runtime-core/src/kernel/runtime-observations.ts:39-54`（观察事件先例：`runtime.prompt.frame` 带 `stableCharacterCount`、`cache-layout-issue` 降级告警）、`packages/runtime-core/src/kernel/runtime-message-context.ts:51-53`（身份快路径 + 内容比较回退的 `messagesEqual` 先例）、`packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts:167-201`（每次模型调用最终 `Context` 组装点 `resolveModelCall`）。
- 衰减锚点：`packages/coding-agent/src/compaction/microcompact.ts:24-27`（keepRecent 8 / maxAgeMs 30s）、`context-pressure-reduction.ts:9-14`（软 0.5 / 硬 0.75 / 保护 3 个用户 Turn / 8KB）、`compaction/user-turn-boundary.ts`（稳定坐标可复用的 `findRecentMatchingUserTurnBoundary`）。
- 度量口径：稳定性以"相邻两次模型调用投影的最长公共前缀（消息数）"表达，身份比较快路径 + 内容比较回退；bust 分类至少区分 append-only / 前缀改写 / 前缀收缩。

## 失效条件与置信度

- 失效条件：上游机制演进（magic-context 迭代快，报告基于 2026-09-24 抓取）；CometixCode 是复刻而非 Claude Code 本体，常量以复刻源码注释锚定上游版本（CC 2.1.88 附近），上游后续版本可能变化；pi npm scope 迁移（`@mariozechner/*` → `@earendil-works/*`）原因未证实。
- 置信度：机制描述高（一手源码/文档）；"Open Forge 内核钩子面已覆盖 pi"为逐项映射结论，高；缺口二的翻转因果已由代码验证复核（2026-09-24，结论已回写 C 节）。

## 下一步触发信号

- 内核落地消息侧稳定性度量后，若观测显示高频前缀改写且归因于产品层 transformer，则评估 m[0]/m[1] 式双槽布局立项。
- 插件生态出现上下文管理类插件需求（如外置记忆、按需检索）时，依据本文钩子映射表核对缺口，再决定是否补 `ctx_reduce` 类工具合同。
- Claude Code 官方公开 context-management API（CometixCode 已复刻 `clear_tool_uses_20250919` 等编辑原语）转正后，重估 @vetta/ai Provider 层是否需要原生支持声明式上下文编辑。
