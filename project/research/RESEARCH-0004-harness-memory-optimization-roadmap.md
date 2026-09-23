---
id: RESEARCH-0004
type: research
status: ready
priority: P1
owner: apps/desktop
created: 2026-09-23
updated: 2026-09-23
source: 仓库源码逐行锚点 + Claude Code/Codex CLI/pi/opencode/Crush/DeepSeek DSH/grok-build/Gemini CLI/Cline/Roo/Aider 源码与官方文档 + Electron/Chromium/V8/Node/Windows 官方文档；Amp 相关说法未取得一手来源（未证实）
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0006]
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0003]
---
<!-- Copyright The Open Forge contributors. -->

# 业界 Agent Harness 内存治理对标与继续优化分级路线图

## 问题与范围

两轮内存/GPU 治理已完成（v0.5.59 前期的缓存 LRU/回放上限/MCP 上限/渲染节流，与本轮 Shiki/编辑器/快捷面板/Agent Team 热窗口/perf 清理），不再展开。本文回答一个问题：**在已完成两轮治理之后，继续压内存的下一批杠杆是什么、按什么顺序做**。目标是"最小运行时性能占用换取最大内存收益"——路线图每项标注运行时性能代价。

范围：渲染端 transcript 驻留、工具结果管线（runtime → JSONL → 渲染端三条路径）、子进程/隐藏渲染体生命周期、OS 级手段甄别。模型上下文 token 预算只在直接转化为驻留内存时纳入。

与既有研究的关系：`RESEARCH-0003` 给出了骨架路线图（基线归因、窗口化设计、统一工具上限）并已在 v0.5.59 落地 perf-snapshot 观测管道；本文基于 6 路深挖（本仓逐行锚点 + Claude Code + Codex CLI + pi/opencode/Crush + DeepSeek DSH/grok-build/Gemini CLI/Cline/Roo/Aider + Windows/Electron 一手资料）重排优先级、补齐业界对标、并甄别关闭低价值候选方向。实测基线输入：v0.5.58 空闲约 2.4GB 内存 / 25% GPU（RTX 3060 Laptop）。

## 事实来源

**仓内一手证据**（行号核对于 2026-09-23 工作区，关键锚点已抽查复核）

- 渲染端驻留：`apps/desktop/src/renderer/shared/store/chat-atoms.ts:186`、`apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts:247,282-283,521-522,619-649`、`apps/desktop/src/renderer/domains/conversation/services/chat-service.ts:526-529,561-777,763-771,838-849,977`、`apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts:129-138,575-584`、`apps/desktop/src/renderer/shared/store/subagents-atoms.ts:16,50`、`apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx:14`。
- 工具结果管线：`packages/coding-agent/src/tool-results/result-policy.ts:9,43-44,70-79,82-93`、`packages/coding-agent/src/extensions/runtime/extension-tool-runtime.ts:346`、`packages/coding-agent/src/composition/tool-surface/runtime-tools-composition.ts:103,217-219`、`packages/coding-agent/src/plugins/runtime/tool-runtime.ts:202-210,294-303`、`packages/runtime-mcp/src/tools/mcp-tool-result-policy.ts:5,105-107,120`、`packages/runtime-mcp/src/tools/mcp-media-policy.ts:1-3`、`packages/coding-agent/src/host/sdk-session/node-session-host.ts:128-132,243,248`、`packages/runtime-node/src/host/result-artifact-storage.ts`。
- 子进程与窗口：`apps/desktop/src/main/im-host/coding-agent-spec.ts:63-122`、`apps/desktop/src/main/im-host/sidecar-manager.ts:298-302,613-638`、`apps/im-gateway/cmd/im-gateway/host.go:143-180`、`apps/im-gateway/internal/hostclient/pool.go:53-56,214-221`、`apps/desktop/src/renderer/domains/activity-panel/components/BrowserPanel.tsx:5-6`、`apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts:13`、`apps/desktop/src/renderer/domains/activity-panel/services/activity-tab-residency.ts:4,24`、`apps/desktop/src/renderer/domains/plugins/runtime/plugin-ui-context.ts:353`、`apps/desktop/src/main/main.ts:155-159`。
- 低优先级盘点项：`apps/desktop/src/main/agent-teams/team-collaboration-store.ts:98-143,160-179`、`apps/desktop/src/renderer/shared/store/file-atoms.ts:45`、`apps/desktop/src/renderer/domains/file-explorer/hooks/useFileTree.ts:28-36,213-224`、`apps/desktop/src/renderer/shared/theme/runtime/themeLoader.ts:18,24-26,69-85`、`apps/desktop/src/main/downloads/download-service.ts:26-42`、`apps/desktop/src/main/batch-tasks/batch-task-executor.ts:434,604,632`。

**外部一手来源（按项目）**

- Claude Code：[costs](https://code.claude.com/docs/en/costs)、[prompt caching](https://code.claude.com/docs/en/prompt-caching)、[context window](https://code.claude.com/docs/en/context-window)、[sessions](https://code.claude.com/docs/en/sessions)、[mcp](https://code.claude.com/docs/en/mcp)、[context editing API](https://platform.claude.com/docs/en/build-with-claude/context-editing)、[工程博客：prompt caching is everything](https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/)、[CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)（v2.1.x 内存修复条目）。
- Codex CLI（openai/codex，源码锚点基于 commit `04fc75ad`）：`codex-rs` 各 crate 源码；反面案例 issues [#19381](https://github.com/openai/codex/issues/19381)、[#31743](https://github.com/openai/codex/issues/31743)、[#37761](https://github.com/openai/codex/issues/37761)、[#38176](https://github.com/openai/codex/issues/38176)、[#43405](https://github.com/openai/codex/issues/43405)、[#24095](https://github.com/openai/codex/issues/24095)（社区报告的 Electron 壳内存问题）。
- pi（badlogic/pi-mono，HEAD `db91e033`/2026-09-22）：`packages/coding-agent/src/core/session-manager.ts`、`core/tools/output-accumulator.ts`、`experimental/session-worker-manager.ts`、`packages/server/README.md`。
- opencode（sst/opencode v1.18）：`packages/opencode/src/tool/truncate.ts`、`session/compaction.ts`、`session/message-v2.ts`、`packages/protocol/src/groups/message.ts`、`packages/core/src/session/sql.ts`。
- Crush（charmbracelet/crush）：`internal/agent/tools/bash.go`、`internal/pubsub/broker.go`、`internal/db/sql/messages.sql`、`internal/ui/chat/streaming_markdown.go`。
- DeepSeek DSH（deepseek-ai/deepseek-harness）：[config-catalog](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/config-catalog.md)、[persistence-catalog](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/persistence-catalog.md)。
- grok-build（xai-org/grok-build，内部 monorepo 定期同步的 code-drop）：config reference / memory / sessions 文档 raw URL。
- Gemini CLI（google-gemini/gemini-cli）：`packages/core/src/context/chatCompressionService.ts`、`context/profiles.ts`、`context/toolDistillationService.ts`、`tools/shell.ts`。
- Cline（clime/cline）：`sdk/packages/core/src/extensions/context/compaction-shared.ts`、`basic-compaction.ts`、`packages/shared/src/llms/tokens.ts`。
- Roo Code：[智能上下文压缩](https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing)。Aider：[repo map](https://aider.chat/docs/repomap.html)、`history.py`、`models.py`。
- 平台：[Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)、[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)、[Web Embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)、[powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)、[webview tag](https://www.electronjs.org/docs/latest/api/webview-tag)、[Chromium memory key concepts](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/memory/key_concepts.md)、`render_process_host_impl.cc`（renderer 上限自适应）、`ui_base_features.cc`（Windows 遮挡跟踪默认开）、[Windows EmptyWorkingSet](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-emptyworkingset)、[Working Set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set)、[V8 heap limit](https://v8.dev/blog/heap-limit)、[V8 trash talk](https://v8.dev/blog/trash-talk)、[Node CLI](https://nodejs.org/api/cli.html)、[Slack 内存治理](https://slack.engineering/reducing-slacks-memory-footprint/)。

**未证实项（如实保留标注）**：Amp 的 "tool result elision" 说法仅见搜索转述，未取得一手文本；Codex Rust 重写的量化内存收益无官方基准；Edge Sleeping Tabs 的 ~30% WS / ~8% CPU 数字来自转述（官方 FAQ 页当前 404）；Claude Desktop 每会话是否独立 OS 进程未证实；`--force-gpu-mem-available-mb`、`performance.measureMemory()` 在当前 Chromium/Electron 树未检索到稳定入口，不作为依据。

## 当前结论

### A. 合并六路调研后的总判断

1. **2.4GB 空闲地板的主体是 Electron 多进程基线，剩余最大增量机会集中在"运行中长会话的工作集上限"**，而非空闲态调参。Windows 的 commit 语义（分配即提交、`malloc(10GB)` 立即挤占系统）决定优先级：对象驻留是真实 commit，一切 OS 级裁剪手段救不回（Chromium key_concepts.md）。
2. **业界五个开源 harness（pi/opencode/Crush/Codex/DSH）收敛出同一套"最小驻留五件套"**：磁盘是事实源、内存只是活跃视图；工具输出有界截断 + 全量 spill 磁盘 + 路径引用；转录 cursor 分页按需加载；事件分级背压（流 delta 可丢、终态必达）；状态进程按需起停。全部可映射到本仓三个已知缺口。
3. **Claude Code 类 compaction 只压缩模型上下文，不解决 GUI 视图模型驻留**——Claude Code 自己为此单独修了一串渲染层泄漏（v2.1.238 显示窗口外释放、v2.1.50 压缩后清缓存、v2.1.77 progress 消息累积）。本仓的对应结论：runtime 侧压缩与渲染端 `chatMessagesAtom` 驻留是两条独立账本，需分别治理。
4. **反面佐证：Codex 的 Rust 内核有界、Electron 壳照样失控**（社区报告 Desktop/IDE 内存 10GB~63GB，全部指向 renderer、helper/MCP 进程群与子会话恢复路径，非 Rust 核心）。印证本仓瓶颈判断：renderer 全量 transcript 驻留与工具结果/MCP/子会话无界才是雷区。
5. **"超限落盘 + 引用进上下文"是单点收益最大的迁移**，本仓 artifact 存储已具备磁盘引用形态（`result-artifact-storage.ts` 写 session 隔离文件 + 生命周期清理），优先复用而不是新造外置存储层。
6. **主进程 `--max-old-space-size=4096` 是诊断护栏而非 RSS 杠杆**：V8 在 >2GB 内存的 64-bit 系统上默认堆上限本就是 ~4GB（v8.dev/blog/heap-limit），上限是 GC 触发点、按需分页、非预留。下调不省空闲 RSS，只让大 PDF/批量任务提前 `RangeError`。真正的杠杆是用已上线的 perf-snapshot 观察主进程堆实际水位。

### B. 候选方向甄别（对应"已知未做"清单的做/不做结论）

| 候选方向 | 结论 | 理由 |
|---|---|---|
| 渲染端 `chatMessagesAtom`/`getFullHistory` 全量 transcript 驻留 | 做（P0-3 前置 + P1-1 分步） | 单会话峰值 10–60MB、含媒体数百 MB；Claude Code 同样全量驻留但配了对冲机制，本仓补齐对冲即可，不必强改架构 |
| 插件/扩展工具结果无统一上限 | 做（P0-1） | 唯一完全无界入口，且以 runtime+JSONL+渲染端三份放大 |
| IM sidecar 子进程无内存上限 | 部分纠偏后做（P0-2） | "每 IM 会话无上限派生"已过时：`pool.SetCloseOnIdle(true)` + maxSize 钳制为 1，稳态 0–1 个子进程；剩余缺口是单回合堆无上限 |
| webview guest 池（warm=2+pinned） | 只做 pinned 上限（P1-5） | warm=2+空闲逐出已生效、persist 分区落盘不占 RAM；插件 pinned 是唯一无界口子 |
| `fileTreeCacheAtom` | 不单独立项 | 切 cwd 即清空、项目内仅随手动展开增长，极端数 MB |
| 主题模块缓存 | 并入渲染端盘点（P2） | `<10MB` 且仅重度换主题用户可见 |
| pet 窗口 | 无动作 | 默认关闭 |
| 主进程 `--max-old-space-size=4096` | 关闭该候选，改监控驱动 | 见 A-6；下调不省 RSS |
| downloads/batch-tasks 注册表 | 从候选清单移除 | 已核实有界，合计 `<2MB` |

### C. 分级路线图（核心交付）

排序公式：**预计内存收益 ÷ 实现代价 × 副作用风险倒数**。每项标注运行时性能代价（"最小性能占用"约束）。

#### P0（低代价 × 高确定性收益 × 低副作用，本轮即可做）

**P0-1 统一工具结果出口：一次封堵三条旁路（extension preserve / details 不裁 / images 透传）**

- 现状锚点：`packages/coding-agent/src/extensions/runtime/extension-tool-runtime.ts:346` 硬编码 `resultProjection: "preserve"`，进入 catalog 前被 `runtime-tools-composition.ts:217-219` 强制换成 PRESERVE 策略（50KB 预算完全失效），注册表兜底默认同样 PRESERVE（`runtime-tools-composition.ts:103`）；插件工具运行时无任何 policy，结果直接 `JSON.stringify(…,2)` 全文格式化（`tool-runtime.ts:202-210,294-303`）；coding 策略 `result-policy.ts:9` 的 50KB 内联 + artifact 对 `details` 全文（`result-policy.ts:70-79`）与 image 内容项不裁剪（`measureInlinePayload` 计入预算却不在输出侧裁剪）；MCP 20KB 策略同样把 images 原样透传（`mcp-tool-result-policy.ts:5,105-107,120`）。artifact store 已在 `node-session-host.ts:248` 就绪，`node-session-host.ts:243` 已挂 session 生命周期清理。
- 业界参照：Claude Code >50K 字符工具结果落盘 `<session>/tool-results/` 只留路径引用、落盘总量 1GB 上限（CHANGELOG v2.1.51/v2.1.265）、MCP 服务器可经 `_meta['anthropic/maxResultSizeChars']` 自报上限硬顶 500,000 字符（https://code.claude.com/docs/en/mcp）；Codex 统一 `DEFAULT_OUTPUT_BYTES_CAP=1MiB` 约束 exec/unified_exec/MCP 事件、超大结果折叠为 text 预览并丢弃 structuredContent/_meta（`core/src/mcp_tool_call.rs:122,975-1005`）；pi `OutputAccumulator` 滚动尾窗 2×50KB + 超限 spill（`core/tools/output-accumulator.ts`）；opencode 2000 行/50KB 双上限 + 全量外置 TRUNCATION_DIR 7 天 TTL + 委托提示三件套（`tool/truncate.ts`）；Crush head+tail 各 15,000 字符、中段 spill 落盘并给路径（`internal/agent/tools/bash.go:431-458`）；DSH `thresholdChars=8192` 裁剪保留 head 4096 + tail 1024、bash 输出内存只持有界尾部溢出落盘（docs/config-catalog.md）。pi/opencode/Crush 三家不约而同取 50KB 量级，是社区事实标准。
- 具体改法：(1) `extension-tool-runtime.ts:346` 与插件 `tool-runtime.ts` 结果路径统一接到 `createCodingAgentCodingToolResultPolicy`；插件卡片 payload（`liftPluginToolCards` 依赖完整结构）保 cards、截文本。(2) 两个 policy 的投影对 `details` 加尺寸预算：超限写 artifact、留引用 + 摘要，复用 MCP 侧已有的 `McpToolResultOffloadDetails` 形状；按 details 子字段白名单裁剪（diff/cards/ask_user_question 富视图降级而非整体砍掉）。(3) shell 类工具用 head+tail 保留（错误常在尾部、回显在头部），读文件类用 head（参照 Crush/pi 分型）。
- 预期收益：消除当前唯一完全无界的入口；一条 10MB 插件结果从 runtime+JSONL+渲染端三份全量驻留（30MB 级）变为一份 ≤50KB 截断体 + artifact 引用。
- 代价与风险：改动集中在 2 个 policy + 2 个注册路径；风险是 extension `preserve` 语义可能被插件卡片消费方依赖，需保结构截文本并随插件 API 版本化说明。
- 运行时性能代价：≈0——结果路径增加一次字节计数与比较；截断/落盘只在超限时发生，落盘走 artifact 既有路径。
- 验证方式：单测覆盖三类旁路（超限 `details`、插件大 JSON、extension preserve）的投影尺寸断言；合成"单条 10MB 插件结果"会话，用 PerfMonitor 快照（`apps/desktop/src/main/app-monitor/perf-monitor-service.ts:221`）对比 renderer/runtime privateBytes 与 JSONL 行大小。

**P0-2 IM sidecar 子进程 V8 上限 + "空闲即关"语义文档化**

- 现状锚点：`apps/desktop/src/main/im-host/coding-agent-spec.ts:88,106-107,118`（`CodingAgentSpec.prefixArgs` 三处 argv 组装，注入点现成）；`apps/desktop/src/main/im-host/sidecar-manager.ts:613-638`（完整重启/退避链路可复用）；`apps/im-gateway/cmd/im-gateway/host.go:150` Windows 走 `ELECTRON_RUN_AS_NODE=1`、`host.go:180` `pool.SetCloseOnIdle(true)`；`apps/im-gateway/internal/hostclient/pool.go:53-56` `NewProcessPool(hostClient, 0)` 钳制为 maxSize=1、`pool.go:214-221` in-flight 归零即关并释放会话文件锁。
- 业界参照：Codex 后台终端 64 上限 + last_used LRU 驱逐 + `kill_on_drop`、子 agent 驻留 LRU 驱逐前先 `ensure_rollout_materialized()` 再 shutdown 可透明复活（`unified_exec/process_manager.rs:1725-1760`、`agent/control/residency.rs`）；pi session-worker "零展示需求 + 无 Harness 活动 → 退休、按需重启"（`experimental/session-worker-manager.ts:34-37`）；DSH 子进程直接带 `maxOldGenerationSizeMb` / `RLIMIT_AS` 硬限（docs/config-catalog.md）；Slack 瘦客户端替换范式（slack.engineering）。
- 具体改法：`prefixArgs` 追加 `--max-old-space-size=2048`（起步值）；上限触发时复用 sidecar-manager 退避重启 + agent-rpc 错误回包；在相关文档明确"空闲即关、稳态 0–1 常驻"语义，避免重复立项。
- 预期收益：单 runAsNode 子进程基线 RSS 约 100–250MB（估算），最坏情况从 OS 级失控变为可诊断 `RangeError` + 退避重启；IM 长回合堆被上限化。
- 代价与风险：一行 argv + 测试；上限过低会让长图片/PDF 回合中途失败、IM 用户无人值守体验差——2048 起步并观察。
- 运行时性能代价：接近 0；上限收紧让子进程 V8 更早触发 major GC（略增 CPU），2048 下可忽略。
- 验证方式：`coding-agent-spec` argv 单测断言；IM 大图片/PDF 长回合端到端回归 + 子进程 `process.memoryUsage()` 峰值记录；确认 RangeError 路径用户可见报错而非静默。

**P0-3 工具结果 base64 媒体引用化（渲染端单项收益最大）**

- 现状锚点：`packages/runtime-mcp/src/tools/mcp-media-policy.ts:1-3` 准入上限 16 项/8MB 每项/24MB 每结果；`chat-service.ts:763-771,188-193,226-228`——`fullHistoryToChat` 与 live 路径把通过的 base64 整段存进 `block.imagePreviews[].data`/`audioPreviews`，DOM 滚出视野仍驻留，会话关闭才释放。外置读路径先例：`packages/runtime-node/src/host/result-artifact-storage.ts`；设计画布缩略图与终端回放已有按需加载路径。
- 业界参照：Cline 压缩时旧轮次 file/image 附件直接丢弃、只有最新 prompt 保留附件——"附件是陈旧上下文膨胀"（`basic-compaction.ts`）；DSH image/offload 事件把图片从后续请求永久剔除但节点不删（docs/persistence-catalog.md）；Codex MCP 事件超大结果折叠为 text 预览（`mcp_tool_call.rs:975-1005`）；DSH 请求侧 `maxInlineRequestImageBytes=20MiB` + offload 量子（docs/config-catalog.md）。
- 具体改法：`data: <base64>` 替换为 `vetta://media/<toolCallId>/<index>` 协议 URL，`<img>` 按视口加载、滚出视口释放解码位图，预取视口 ±N；media blob 目前内联在 JSONL，需一条按 entryId 定位的读路径（复用 artifact 存储或读 JSONL 行）；分享/导出若直接读 `data` 需适配。
- 预期收益：最坏单条工具结果 ~32MB（base64 膨胀 33%），10 条图片工具结果的会话从数百 MB 峰值降为 KB 级引用 + 视口内少数几份解码数据。transcript 驻留中最大的单项。
- 代价与风险：中——只动 `ToolCallBlock` 数据形态与一条读路径；风险是导出/分享适配与协议 URL 的 IPC 读路径设计。**必须排在 P1-1（transcript 窗口化）之前做**：它只需动一个组件的数据形态，就能先拿走窗口化收益的大头。
- 运行时性能代价：低且通常为正——按需解码替代一次性大字符串持有与拷贝；滚动加载有 IPC 往返（几十 ms 级），可预取缓解。
- 验证方式：合成"20 条图片工具结果"会话对比 renderer privateBytes 峰值/稳态；滚动回归确认图片按视口出现无闪烁；导出/分享用例回归。

**P0-4 `subagentsBySessionAtom` 会话级 LRU（快赢）**

- 现状锚点：`useSessionEventController.ts:575-584` 只在"当前活动会话快照为空"时删自己的键，`resetEventBuffers`（`useSessionEventController.ts:129-138`）与会话拆卸均不清此 Map，切走的会话快照永久驻留；`subagents-atoms.ts:16,50`；源头已裁剪 `packages/runtime-subagents/src/contracts.ts:193,209-212`（`SUBAGENT_FINAL_TEXT_LIMIT=16*1024`）；可复制模式：`chat-service.ts:838-849` `MAX_TURN_STATS_SESSIONS=128` LRU（本轮已验证可行）。
- 业界参照：Claude Code 同类修复——teammate 历史 pin 住父会话 GC（CHANGELOG v2.1.69/v2.1.63）、subagent tool results 离开显示窗口即释放（v2.1.238）。
- 具体改法：对齐 `turnStatsCache` 的 128-LRU：访问提升、超容淘汰最久未用会话的子代理快照；重开团队会话走同一快照恢复链路。
- 预期收益：数 MB 级（50 个含 5 子代理的会话 ≈ 数 MB），小而确定的无界增长归零。
- 代价与风险：极低，几乎无风险。
- 运行时性能代价：O(1) LRU 操作。
- 验证方式：单测（打开 >128 会话后最旧键被淘汰）；内存快照回归。

#### P1（收益明确、代价可控，或依赖 P0 前置）

**P1-1 渲染端 transcript 窗口化（分步：媒体先行 → 视口外元数据占位 → 向上游标分页 → compaction 边界恢复）**

- 现状锚点：`chat-atoms.ts:186` 持有当前会话全部消息对象；`useSessionOpener.ts:247` 切会话 `setChatMessages([])`（是"单会话峰值"而非跨会话累积）；`useSessionOpener.ts:282-283,521-522,619-649` `openViewer({tailTurns:2})` 首屏预览后 `getFullHistory` 全量拉回空闲期替换进 atom；`MessageListView.tsx:14` react-virtuoso 只虚拟化 DOM、数据全量驻留。
- 业界参照：Claude Code 显示窗口之外的 subagent tool results 即释放、显示层与模型上下文解耦（CHANGELOG v2.1.238）；Codex Paginated history（实验，`features/src/lib.rs:1155-1172` 默认关）：SQLite 按 `rollout_ordinal` 游标索引 + JSONL 字节偏移增量尾爬、UI 只装"最新后缀"（`thread_history_migrations/0001_thread_history.sql`、`thread-store/src/local/model_context.rs:27-40`）；opencode 协议级 cursor 分页 ≤200 条/页、server 不为客户端持有 transcript（`packages/protocol/src/groups/message.ts:7-25`）；Crush `ListMessagesBySessionFromSummary` 只加载 compaction 边界之后（`internal/db/sql/messages.sql`）。**重要纠偏：Codex legacy resume 同样全量读回（`history/src/lib.rs:310-331`）——"恢复即流式"并非业界已完成态，本仓不必一步到位。**
- 具体改法：三步各自独立可发布——(1) P0-3 完成后把视口外消息降为元数据占位；(2) `openViewer` 已支持 `tailTurns`，扩展为 beforeEntry 游标向上分页（上滚拉一段，模式同本轮 Shiki 挂载自愈）；(3) 评估存在压缩边界时只重放边界后内容（Crush 规则）。
- 预期收益：单会话工作集从 O(全量) 变 O(窗口)；重度 500 工具调用会话约 10–60MB、含图片翻倍的驻留上限化。
- 代价与风险：中-高——消息目录/统计/搜索若依赖全量数组需改为按页归并；undo/乐观消息 reconcile（`preserveMessagesAddedAfterSnapshot`）需适配窗口边界。排在 P0 之后正因代价/回归面最大。
- 运行时性能代价：上滑分页 IPC 往返（几十 ms 级/页）；驻留下降反而降低 GC 压力。
- 验证方式：PerfMonitor 长会话 renderer privateBytes 曲线 O(窗口) 化；会话切换回落幅度；undo/搜索/统计回归。

**P1-2 assistant 文本双份存储消除（历史回放路径先行）**

- 现状锚点：`chat-service.ts:740-742,526-529` blocks push 后又 `target.text = target.text + text` 同一段全文再拼一份；`chat-service.ts:977` 流式 `appendTextDelta` 同样双写。
- 业界参照：pi 内存镜像只存一份模型可见文本（`session-manager.ts:994-998` 仅 fileEntries + 两个 Map）；Codex `Arc` COW 快照共享，只读消费者零拷贝（`context_manager/history.rs:73-75`）。
- 具体改法：历史回放路径不再拼 `text`，让 `text` 成为派生值（selectAtom/惰性 join）；live 流式路径依赖 text 增量拼接可保留。需一次全量消费方盘点（导出、复制、搜索、匀速流出器）。
- 预期收益：纯文本会话省 assistant 文本总量 ~50%；5MB 文本会话省 2–3MB。
- 代价与风险：改动低但回归面广。
- 运行时性能代价：惰性 join 在导出/复制时一次性 O(n)；常态 ≈0。
- 验证方式：消费方盘点清单；`text === blocks join` 一致性单测；导出/复制回归。

**P1-3 事件分级背压（流 delta 可丢、终态必达）**

- 现状锚点：现有压缩背压（v0.5.59）只压载荷不分级；`ConversationProjection.pendingAssistantEvents` 无硬上限、由 100ms flush 约束（`RESEARCH-0003` B-5）。
- 业界参照：Crush 有界 pubsub——每订阅者 channel 4096、中间态满即丢 + 告警 + 计数、终态事件（finish/tool result/error/cancel）50ms 限时必达、DropCount 暴露遥测（`internal/pubsub/broker.go:18-40`）。
- 具体改法：kernel 事件总线加两档投递语义：中间流 delta 允许合并/丢弃（UI 只需最新值快照），终态事件限时保送；丢弃计数进遥测。
- 预期收益：长 turn 事件队列内存从根上受约束；高吞吐工具流峰值削平。
- 代价与风险：低-中；丢 delta 语义需 UI 侧"最新值合并"确认无丢块。
- 运行时性能代价：通常为负（更少事件投递 = 更少 CPU）。
- 验证方式：每 token 一事件的合成高吞吐流对比队列水位与 UI 正确性。

**P1-4 compaction 与渲染端驻留联动（含压缩防抖三件套）**

- 现状锚点：`packages/coding-agent/src/compaction/contracts.ts:82-87`、`backpressure.ts:30-34` 参数面已齐（reserve 36k/空闲阈值 20%/保留最近 20k）；渲染端驻留与压缩完全解耦。
- 业界参照：Claude Code 压缩后清内部缓存（CHANGELOG v2.1.50）、幸存集预算表（技能 5000/25000 token、>5000 token 文件降级路径引用，https://code.claude.com/docs/en/context-window）、防抖三件套：回填检测（v2.1.89 thrash loop）、失败熔断、溢出尺寸种子（v2.1.142）；Codex `replace_compacted()` 让内存释放与上下文收敛同动作，反面案例 Windows 重复 compaction 内存飙升（`context_manager/history.rs:575-608`、issue #24095）；opencode 压缩=剪枝、旧工具输出 elide 到 2000 字符（`session/compaction.ts:24-35`）。参数形状参照：DSH `thresholdRatio=0.8/headroomTokens=65536/retainRatio=0.16`；Gemini 0.5 触发/保留 30%/50k token 工具预算；Cline 0.9 触发/0.7 目标/保留 20k + `CHARS_PER_TOKEN=3` 保守估算。
- 具体改法：compaction 事件作为渲染端历史重建触发器（重放压缩后投影而非原全量）；压缩后清 Shiki/编辑器等内部缓存的钩子；实现防抖三件套（对 IM sidecar 无人值守长会话尤其重要）。
- 预期收益：长会话压缩后渲染端驻留同步下降；避免压缩死循环。
- 代价与风险：中；投影重建需与 P1-1 协同设计，涉及上下文合同，建议走 ADR。
- 运行时性能代价：压缩时一次性重建（已有）；防抖减少无效压缩调用（净省）。
- 验证方式：压缩前后 renderer privateBytes 对比；thrash 注入测试。

**P1-5 webview 剩余口子收口（插件 pinned 上限 + 面板收起卸载校验）**

- 现状锚点：`activity-tab-residency.ts:4,24` warm 上限 2 + 空闲逐出已生效，pinned 仅来自 `keepAliveWhenAvailable===true`；`plugin-ui-context.ts:353` 目前只有插件页签可声明 pinned；`BrowserPanel.tsx:5-6`、`useBrowserPanelModel.ts:13` 每 workspace 单 webview、`persist:vetta-browser` 共享分区（cookie/HTTP cache 落盘不占 RAM）。
- 业界参照：Electron webview = out-of-process iframe、每 guest 独立 renderer 进程（web-embeds、webview-tag 官方文档）；Chromium 同站进程复用/按内存自适应上限默认开启（`render_process_host_impl.cc`），无需也不应手动裁进程数；Slack 瘦客户端替换（slack.engineering）。
- 具体改法：(1) 插件 pinned 页签设总量上限或 LRU（属行为变更，随插件 API 版本化）；(2) 校验活动面板整体收起时 webview 是否卸载（当前保留 DOM 挂载的 warm 语义）；(3) 一次性预览改非 persist 分区（磁盘收益）。
- 预期收益：单 guest 50–150MB（估算）；不是 2.4GB 主因，属防御性收口。
- 代价与风险：低-中；pinned 是插件显式契约。
- 运行时性能代价：0（纯生命周期管理）。
- 验证方式：`app.getAppMetrics()` guest 进程计数在收起/空闲路径上的断言。

**P1-6 MCP 子进程生命周期补强（先盘点 `packages/runtime-mcp` 连接管理现状）**

- 现状锚点：runtime-mcp 已有 64/16MiB 响应上限与 deferred tools（`packages/runtime-mcp/src/deferred-tool-controller.ts:11`）；stdio 连接生命周期本次未逐行核查（**待盘点**）。
- 业界参照：Claude Code stdio 空闲 30 分钟超时、>2 分钟自动转后台、断连清 fetch 缓存（CHANGELOG v2.1.6x，https://code.claude.com/docs/en/mcp）；Codex 连接对象 Drop 即 cancel、显式 shutdown 杀 stdio 进程、LazyWhenCached 懒启动 + 工具目录持久缓存（`codex-mcp/src/connection_manager.rs:154-157,897-912`、`runtime.rs:68-73`、`tool_catalog_cache.rs`）。
- 具体改法：连接对象挂关闭钩子杀子进程树（Windows 杀树）；懒启动 + 目录持久缓存；空闲回收阈值。
- 预期收益：每 stdio server 子进程 50–150MB（估算，仅使用 MCP 时存在）。
- 代价与风险：中；懒启动引入首次调用延迟（目录缓存缓解）。
- 运行时性能代价：空闲归零换首次调用略慢。
- 验证方式：server 子进程计数与空闲回收时间点断言。

**P1-7 会话列表/恢复最小化（stat 轻索引 + 大会话恢复提议）**

- 现状锚点：`openViewer({tailTurns:2})` 首屏已有（`useSessionOpener.ts:282-283`）；会话选择器是否已用 stat 轻索引未核查（**待盘点**）。
- 业界参照：Claude Code resume 改 stat 索引渐进加载，多会话场景内存 -68%（CHANGELOG v2.1.30）；resume-from-summary（>100K tokens 且空闲 >1h 提供压缩恢复）；Codex `ReverseJsonlScanner` 从文件尾按 64KiB chunk 倒序只取最近几条做列表预览、不进内存即渲染摘要（`tui/src/resume_picker_transcript_preview.rs`）。
- 具体改法：会话列表用 stat（大小/mtime）轻索引、点开才全量解析；大会话打开时提供"从摘要恢复/只载尾部"选项。
- 预期收益：多会话用户的恢复路径内存与耗时下降。
- 代价与风险：低-中。
- 运行时性能代价：≈0（少解析 = 更快）。
- 验证方式：100+ 会话库的打开内存曲线与耗时对比。

**P1-8 powerMonitor 定向清理（suspend/lock-screen 免费清理点）**

- 现状锚点：已用 resume 信号（auth/updater/pet-idle-guard）；清理向用法未做。
- 业界参照：Electron powerMonitor 事件表（suspend/lock-screen Windows 可用）；Edge Sleeping Tabs 分级（hide/throttle → freeze → trim → discard）的量级参考（~30% WS，数字来自转述、原页 404，未证实）。
- 具体改法：suspend/lock-screen 时对非热窗口做主动收缩（空闲会话降级、一次性 working-set trim——仅此刻，回触无感）；resume 时懒回填。
- 预期收益：休眠场景驻留峰谷差增大；账面收益为主。
- 代价与风险：低；resume 立即有交互的场景要懒回填。
- 运行时性能代价：0 常态成本（事件驱动一次）。
- 验证方式：休眠/唤醒前后 PerfMonitor 快照。

#### P2（高代价或低收益，随自然演进）

- **P2-1 分页投影基础设施**（JSONL ordinal 索引 / SQLite cursor，Codex Paginated history 全套、opencode cursor 语义）：P1-1 第 2 步落地且数据仍不够时再评估；需索引存储、写入带 ordinal、分页 RPC。
- **P2-2 JSONL 写入后台任务化 + 冷数据压缩**（Codex `RolloutWriterTask`、>7 天 rollout zstd -3 后台压缩、fork 引用化）：磁盘/恢复收益，间接降内存页。
- **P2-3 `team-collaboration-store.readFromDocument` 增量投影**（`team-collaboration-store.ts:98-143,160-179`）：GC churn 而非驻留，长团队会话流畅度项。
- **P2-4 渲染端低优先级盘点**：themeLoader `moduleLoadCache` 淘汰（`themeLoader.ts:18,24-26,69-85`）、fileTree `visibleCache` memo 化（`useFileTree.ts:28-36`）；跨会话检索索引化（grok-build SQLite FTS5 模式：只存计数与主题、检索不走 transcript 内存）。
- **P2-5 工作区上下文预算化**（Aider repo map 模式：token 预算内有界派生摘要替代全树缓存，clamp(input/16, 1k, 8k) 公式）：对 `fileTreeCacheAtom` 的远期替代思路。

## 被否决的方案与原因

- **定时/空闲对自身进程 `EmptyWorkingSet`/`SetProcessWorkingSetSize(-1,-1)`**：Windows 只移出工作集页面、不释放 commit；被移除页是 transition page，再访问 soft/hard fault，"数字好看、真实驻留不变、恢复交互卡顿"（MSDN Working Set + Chromium key_concepts.md）。唯一可接受姿势是 powerMonitor.suspend 时一次（P1-8）。
- **定时强 GC（`--expose-gc` + 周期 `gc()`）**：与 V8 自适应堆策略对冲，gc() 后堆很快回填，等于白付两次标记停顿；major GC 全停顿（v8.dev/blog/trash-talk）。正解是消除引用 + 低 max-old-space 下自动勤回收。
- **`--disable-renderer-backgrounding` / 全局关 `backgroundThrottling`**：方向相反（后台不节流 = 更高常驻成本）。注意任一 webContents 关掉节流会令整窗不节流——remote-control 宿主窗口已关（刻意行为），需审计其是否污染同窗其他 UI（守门项，非新增）。
- **为省内存合并进程/关 site isolation/webview 大规模改 iframe**：进程分离是安全边界，默认姿态不得降级（Chromium/VS Code 文档）；iframe 迁移仅限可信第一方内容，当前无可迁移项。
- **下调主进程 `--max-old-space-size=4096` 换空闲 RSS**：V8 64-bit 默认即 ~4GB，上限是 GC 触发点非预留，下调不省空闲 RSS、只让大 PDF/批量任务提前 RangeError（v8.dev/blog/heap-limit + `main.ts:155-159` 注释动机）。`RESEARCH-0003` P1-6 的"分进程校准"保留为监控驱动项：perf-snapshot 显示主进程堆长期 <1GB 时再收紧护栏值。
- **把 "resume 流式化" 当对标目标**：Codex legacy resume 同为全量读回（`history/src/lib.rs:310-331`），业界完成态是分页投影与 stat 索引（P1-7/P2-1），不是恢复时流式。
- **一次性把 transcript 存储重写为 SQLite/重写渲染管线**：成本与风险远超收益；先走 P0-3 + P1-1 分步窗口化（与 `RESEARCH-0003` 结论一致）。
- **治理 downloads/batch-tasks/fileTreeCache/主题缓存**：个位数 MB 且多有界（B 表），从候选清单移除，避免浪费治理预算。
- **照搬 Claude Code "云会话卸载"**：本地优先产品无此形态；可借鉴的是其隔离原则（每会话 runtime 可独立创建/销毁、GUI 只持轻量视图与路径引用）。
- **引用未证实的开关/说法**：`--force-gpu-mem-available-mb`（当前 Chromium 树检索不到）、`performance.measureMemory()`（文档 404）、Chromium 生产调用 `EmptyWorkingSet`（已移除，仅剩 sandbox 测试命中）、`--renderer-process-limit`（已改内存自适应）、Amp elision 细节（未证实）。

## 代码锚点/测试或指标

- 关键 file:line 已内嵌各路线图条目；高频复用锚点汇总：`chat-atoms.ts:186`、`chat-service.ts:763-771`（媒体驻留）、`extension-tool-runtime.ts:346` + `runtime-tools-composition.ts:103,217-219`（上限旁路）、`result-policy.ts:9,70-79` + `mcp-tool-result-policy.ts:5,105-107,120`（policy 投影）、`coding-agent-spec.ts:88,106-107,118`（sidecar argv 注入点）、`useSessionOpener.ts:247,282-283,521-522,619-649`（会话打开/全量替换）、`chat-service.ts:838-849`（128-LRU 既有模式）。
- 指标口径：`apps/desktop/src/main/app-monitor/perf-monitor-service.ts:221` 起的 `app.getAppMetrics()` 每进程采样；**Windows 真实占用看 `privateBytes` 而非 `workingSetSize`**（WS 可被 trim 操纵、private 才是 commit 真相）；CPU 字段是"自上次调用以来均值"，采样节奏本身是行为参数。注意 `app-monitor` 约束：纯旁路、可失败、不阻塞业务。
- 可重复验证法：固定脚本构造合成会话（N 条工具调用 + M 张图片 / 大 details 插件结果 / 100+ 会话库）→ 修改前后对比 renderer/runtime privateBytes 峰值与稳态、JSONL 行大小、会话切换回落幅度。基线：v0.5.58 空闲约 2.4GB / 25% GPU。
- 测试命令：`bun run test:impact -- <file>` 日常；policy 层用 `bun scripts/quality/run-vitest.mjs --run <file>` 单文件。

## 失效条件与置信度

失效条件：

- Electron/Chromium/V8 大版本升级改变进程模型、内存记账或堆策略（本文平台结论基于 Electron 34 / Chromium 132 / 当前 V8 默认值）；
- 后续提交使行号锚点漂移（行号核对于 2026-09-23 工作区，关键锚点已抽查）；
- Codex Paginated history 等实验特性（`features` 默认关，快照 `04fc75ad`）转正或被移除；
- P0-1/P0-3 落地后实测显示热点转移（如基线归因指向图片/GPU 资源主导）；
- 外部 URL 失效（Edge Sleeping Tabs FAQ 已 404，相关数字维持"转述、未证实"标注）。

置信度：

- 仓内锚点：高——逐行核对并抽查复核。
- 业界机制描述：高——一手源码与官方文档；实验特性均标注默认开关状态。
- 收益量级：中——多为估算（标注"估算"处），需按"验证方式"实测后才可写死数字。
- 未证实项：已逐条标注（Amp、Codex Rust 量化收益、Edge 数字、Claude Desktop 进程模型、部分 Chromium 开关）。

## 下一步触发信号

- perf-snapshot 显示 renderer `privateBytes` 随会话时长单调增长、切换会话后回落不明显 → P1-1 提前立项（先做第 2 步游标分页）。
- 插件生态出现返回大结果的工具 → P0-1 优先级再提升，并同步审查插件卡片白名单。
- IM 用户报告长回合中途失败/子进程崩溃 → 调整 P0-2 的 2048 上限并核查 agent-rpc 错误回包链路。
- 使用内置浏览器出现内存压力 → P1-5 pinned 上限从"防御"转"必修"。
- Codex Paginated history 转正（`features` default_enabled=true）→ 重估 P2-1，直接借鉴其已验证的索引/游标设计。
- MCP 接入数量增长或出现孤儿 server 进程 → 触发 P1-6 现状盘点。
- Electron 大版本升级 → 重验平台假设与 B 表中"默认已生效"项（遮挡跟踪、进程复用、节流）。
