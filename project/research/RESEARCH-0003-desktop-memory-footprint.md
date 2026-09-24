---
id: RESEARCH-0003
type: research
status: ready
priority: P1
owner: apps/desktop
created: 2026-09-23
updated: 2026-09-23
source: user-request + 仓库源码 + 官方文档（Electron/Chromium/Node/Windows/VS Code/各 Agent 产品）
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0006]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端内存足迹持续优化路线图

## 问题与范围

目标：给出一份可持续执行的桌面端内存压降路线图——以最小运行时成本换取最大内存收益，并把每一次调优绑定到可测量的指标上。

范围：`apps/desktop` 的 Electron 主进程、渲染进程、utility process / worker / 子进程与 Go sidecar；`packages/runtime-*`、`packages/coding-agent`、`packages/agent-team`、`packages/theme-ui` 中持有内存的边界。模型上下文（token 预算）只在它直接转化为驻留内存（消息对象、工具结果、JSONL 缓存）时纳入本研究，纯粹的调用成本问题归 RESEARCH-0002/PLAN-0002。

约束：不破坏会话恢复与持久化正确性、会话隔离、取消/释放语义、隐私与安全边界；不做大规模重写；不以牺牲可恢复性换内存数字。

## 事实来源

**仓库源码与项目文档（一手证据）**

- 启动与进程：`apps/desktop/src/main/main.ts`、`apps/desktop/src/main/renderer-startup.ts`、`apps/desktop/src/main/quickpanel-window.ts`、`apps/desktop/src/main/speech-input/speech-input-service.ts`、`apps/desktop/src/main/uiohook-worker.ts`、`apps/desktop/src/main/im-host/sidecar-manager.ts`。
- 会话/事件边界：`apps/desktop/src/main/conversations/idle-session-residency.ts`、`apps/desktop/src/main/agent-teams/team-session-service.ts`、`packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts`、`packages/runtime-node/src/conversation/file-conversation-repository.ts`。
- 渲染端驻留：`apps/desktop/src/renderer/shared/store/chat-atoms.ts`、`apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts`、`apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts`、`useSessionEventController.ts`、`useDeferredMessageEnhancements.ts`、`apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx`、`apps/desktop/src/renderer/domains/activity-panel/components/BrowserPanel.tsx`、`apps/desktop/src/renderer/shared/store/browser-atoms.ts`。
- 有界资源：`terminal-service.ts` / `terminal-session.ts` / `TerminalSurface.tsx`、`plugins/offscreen-capture-service.ts`、`conversations/session-search-worker-client.ts`、`image-cache/image-cache-service.ts`、`app-monitor/perf-monitor-service.ts`、`chat-service.ts`（turnStatsCache）、`theme-ui/src/shared/syntax-highlight-cache.ts`。
- 上下文/工具预算：`packages/coding-agent/src/tool-results/result-policy.ts`、`packages/coding-agent/src/compaction/contracts.ts`、`backpressure.ts`、`packages/runtime-mcp/src/deferred-tool-controller.ts`、`mcp-tool-result-policy.ts`、`mcp-media-policy.ts`、`packages/runtime-subagents/src/subagent-dispatcher.ts`、`packages/agent-team/src/contracts.ts`。
- 既有结论：`project/tasks/TASK-0006-history-memory-bounds.md`（status: done）、`project/research/RESEARCH-0002-agent-product-performance.md`、`docs/desktop/preformance/session-switch-observability-2026-08-20.md`。

**外部一手资料（官方文档/源码文档）**

- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)：先测量、迟加载、谨慎引入模块、不阻塞主/渲染进程。
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)：每个 BrowserWindow 一个渲染进程；`utilityProcess` 适合不可信/CPU 密集/易崩溃组件。
- [BrowserWindow Options](https://www.electronjs.org/docs/latest/api/structures/browser-window-options)：`backgroundThrottling` 默认 true（后台节流计时器/动画）、`offscreen`、`v8CacheOptions`、`webviewTag`、`spellcheck`、`contextIsolation`/`sandbox` 默认开启。
- [Command-Line Switches](https://www.electronjs.org/docs/latest/api/command-line-switches)：`--js-flags`、`--disk-cache-size`、`--disable-renderer-backgrounding`、`--force_low_power_gpu` 等。
- [Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)：可 `stopPainting`/控制帧率，只在脏区域产生 paint 事件，无变化不产生帧。
- [Session API](https://www.electronjs.org/docs/latest/api/session)：`getCacheSize`/`clearCache`/`clearStorageData`/`setCodeCachePath`/`clearCodeCaches`/`setSpellCheckerEnabled`。
- [powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)：suspend/resume、on-battery、lock-screen、speed-limit-change 等系统信号。
- [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)：Chromium 管理的 Node 子进程，可独立 kill。
- [Chromium memory key concepts](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/memory/key_concepts.md)：Windows 按 commit 记账，`EmptyWorkingSet`/`DiscardVirtualMemory` 只减工作集不释放 swap，不能防 OOM。
- [Chromium process model & site isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)：进程隔离以内存开销换安全/稳定；同站点进程可复用。
- [Windows `EmptyWorkingSet`](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-emptyworkingset) 与 [`SetProcessWorkingSetSize`](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-setprocessworkingsetsize)：裁剪工作集 ≠ 释放提交内存。
- [Windows `SetProcessInformation`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessinformation)：`ProcessMemoryPriority` 低优先级页面先被裁剪；`ProcessPowerThrottling` 对应 EcoQoS。
- [Node CLI](https://nodejs.org/api/cli.html)：`--max-old-space-size`、`--max-semi-space-size`、`--heapsnapshot-near-heap-limit`、`--max-old-space-size-percentage`。
- [VS Code Sandboxing](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox)：渲染进程 sandbox 化、特权操作移出 renderer、独立进程承载扩展/共享服务。
- 上下文/历史策略参考：[Cline auto-compact](https://docs.cline.bot/features/auto-compact)、[Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching.md)、[Codex CLI reference](https://developers.openai.com/codex/cli/reference)、[OpenHands agent arch](https://docs.openhands.dev/sdk/arch/agent)（stateless step + condenser）、[Aider repo map](https://aider.chat/docs/repomap.html)（~1k token 仓库地图）、[Zed agent settings](https://zed.dev/docs/ai/agent-settings)（auto_compact 默认开、阈值 90%）、[xAI context compaction](https://docs.x.ai/developers/advanced-api-usage/context-compaction)（服务端 compaction item，客户端可丢弃原始消息）、[DeepSeek context caching](https://api-docs.deepseek.com/guides/kv_cache)（前缀单元命中、best-effort）。

**方法论约束**：外部文档是证据不是仓库指令；任何"节省 X MB"的量化结论必须来自本仓库实测。当前仓库没有任何实测内存基线数据——这是第一个要补的洞。

## 当前结论

### A. 已有内存边界盘点（事实，已验证）

| 资源 | 上限 | 锚点 |
|---|---|---|
| 交互会话热驻留 | 3 个 idle resident | `conversations/idle-session-residency.ts:12` |
| Team 会话热驻留 | 2 个 idle resident | `agent-teams/team-session-service.ts:74-75` |
| in-flight 事件回放缓冲 | 4096 条/会话 | `runtime-core/src/runtime-host/runtime-host-session-event-relay.ts:19` |
| Conversation 写缓存 | 16 文档 LRU | `runtime-node/.../file-conversation-repository.ts:66,81` |
| 终端会话 | 24 个 × 256KiB ring | `terminal/terminal-service.ts:18`、`terminal-session.ts:6` |
| 终端渲染 scrollback | 5000 行（快照 1000） | `TerminalSurface.tsx:20,26` |
| Shiki 高亮缓存 | 300 条 / 5MB 字符 | `theme-ui/src/shared/syntax-highlight-cache.ts:17-18` |
| 渲染端 turn 统计缓存 | 128 会话 LRU | `chat-service.ts:835-847` |
| Offscreen 插件捕获 | 4 session/插件，30s idle TTL | `plugins/offscreen-capture-service.ts:21,23` |
| Session 搜索 worker | 单例懒建 + idle 终止 | `conversations/session-search-worker-client.ts:72-78` |
| MCP deferred tools | ≥15 工具时只暴露索引 + `tool_search` | `runtime-mcp/src/deferred-tool-controller.ts:11` |
| MCP 工具结果内联 | 20KB | `runtime-mcp/src/tools/mcp-tool-result-policy.ts:5` |
| MCP 媒体 | 8MB/项，24MB 总计 | `runtime-mcp/src/tools/mcp-media-policy.ts:2-3` |
| Coding 工具结果内联 | 50KB，超出落 artifact | `coding-agent/src/tool-results/result-policy.ts:9` |
| Subagent | 并发 3，terminal handle 50 | `runtime-subagents/src/subagent-dispatcher.ts:20-21` |
| Team 投递回执窗口 | 256 事件 ID | `agent-team/src/contracts.ts:16` |
| Compaction | 开启；reserve 36k / 空闲阈值 20% / 保留最近 20k；backpressure 60s/120s/4096 | `coding-agent/src/compaction/contracts.ts:82-87`、`backpressure.ts:30-34` |
| 图片磁盘缓存 | 7 天 TTL | `image-cache/image-cache-service.ts:16` |
| PerfMonitor | 2s/30s 采样、180 快照、64 turn 记录 | `app-monitor/perf-monitor-service.ts:19-24` |
| GUI 主进程 V8 | `--max-old-space-size=4096`（仅 GUI 模式） | `main.ts:155-159` |
| 会话切换预览 | `tailTurns=2` 预览 + 异步全量；校验 1–10，fallback 32 条 | `useSessionOpener.ts:283`、`session-history-preview.ts:3`、`ipc/session.ts:1738-1743` |
| 流式渲染 | delta flush 100ms；markdown 按稳定块 memo；非关键派生延迟（2×rAF + 400ms + idle 1500ms） | `useSessionEventController.ts:69-70`、`MarkdownContent.tsx`、`useDeferredMessageEnhancements.ts` |

另有生命周期事实：quickpanel 首次触发才建窗（建后 hide/show 常驻）；pet 经 `DESKTOP_PET_ENABLED=false` 整体下线（`shared/feature-flags.ts`）；GPU/disk-cache 关闭开关只在 CLI 模式生效（`main.ts:216-218`）；开发态启动先 `session.defaultSession.clearCache()` 再加载 renderer（`main.ts:449-454`）；managed runtime 与 sandbox 初始化延迟到首帧后 500ms（`main.ts:843-846`）；speech-input 用 `utilityProcess.fork`；uiohook 因 CGEventTap 投递问题刻意留在 `worker_threads`（`uiohook-worker.ts:9`）；im-gateway 是 Go sidecar 子进程。

### B. 已识别的驻留热点（按预期收益排序）

1. **渲染端全量 transcript 驻留**：`chatMessagesAtom`（`chat-atoms.ts:186`）在打开会话后持有完整历史对象；`openViewer(tailTurns:2)` 只优化了首屏，canonical 全量 hydration 随后仍然发生。虚拟列表只裁剪 DOM，不裁剪 JS 对象——TASK-0006 已把窗口化/上滑加载标注为需要 IPC 与产品交互变更的独立特性。**这是当前最大的单一可压降项，收益与最长会话大小成正比。**
2. **Extension/插件工具结果无统一上限**：TASK-0006 记录 coding-agent 的 50KB 内联 + artifact 策略只覆盖产品工具，extension/插件工具结果可无界进入 JSONL 与内存 document。
3. **隐藏 renderer/webview 常驻**：`BrowserPanel` 的 `<webview>` 常驻挂载 + CSS 隐藏（`BrowserPanel.tsx` 注释），跨活动 tab 保活；`browserUrlByWorkspaceAtom`（`browser-atoms.ts:9`）按 workspace 保留 URL 使恢复成为可能，但 webview 本体是一个独立渲染进程，空闲时仍在占内存。quickpanel 首开后常驻同理。
4. **Team/多会话投影增长**：`deliveredEventIds` 持久化窗口已限 256，但投影侧消息裁剪需要 `packages/agent-team` 合同变更（TASK-0006 备注），属单独任务。
5. **长会话流式期间峰值**：`ConversationProjection.pendingAssistantEvents` 无显式条数上限，实际由 100ms flush 定时器与归属闸门约束排空（TASK-0006 验证"确认有界"），风险低但非硬上限。
6. **`--max-old-space-size=4096`**（`main.ts:158`）：是有意设计的 OOM 护栏（注释说明：把静默 SIGKILL 变成可落盘的异常），不是泄漏证据；但 4GB 是经验值，`--js-flags` 会传给应用内所有 V8 实例（含 renderer/utility process），是否每个进程类型都该吃 4GB 上限需要分进程实测后再定。

### C. 优先级路线图（最大效果 / 最小运行时成本）

**P0 — 先测量，再加最便宜的硬上限（本轮就该做）**

1. **建立进程级内存基线与归因**。`PerfMonitorService` 已用 `app.getAppMetrics()` 采每进程 `workingSetSize`/`privateBytes` 加 `process.memoryUsage()`（`perf-monitor-service.ts:221-235`），骨架齐全。差距在：采样数据未按"会话数/终端数/webview 数/插件数"关联归因，也没有长时程基线。做法：在现有旁路采样里补上下文维度与慢速持久化聚合（遵守 app-monitor 规则：纯旁路、可失败、不阻塞业务），产出"典型工作流下各进程稳态内存"的第一张基线表。成本接近零，是所有后续决策的前提。
2. **渲染端 transcript 窗口化（设计先行）**。为 `chatMessagesAtom`/`getFullHistory` 设计窗口化 hydration：内存只驻留最近 N 个 turn + 滚动触发的向上分页。需要 IPC 参数、产品交互（顶部加载指示/跳转）与 `ConversationProjection` 对齐；TASK-0006 已确认这是独立特性，建议立项。预期收益是内存曲线随会话长度从 O(全量) 变 O(窗口)，是所有单项里天花板最高的。
3. **统一工具结果大小兜底**。把 coding-agent 的 50KB 内联 + artifact 化策略提升为 runtime 层对所有工具结果（含 extension/plugin）的通用约束，artifact 化落盘而不是进 JSONL/内存。改动面小、只动策略层。

**P1 — 有明确收益、成本可控**

4. **隐藏 renderer 生命周期预算**。给 BrowserPanel webview 与 quickpanel 增加 idle 驱逐策略：离开视野/空闲超时后销毁 webview 或窗口内容，URL/状态已在 atom 中可恢复。参考已有先例：offscreen capture 的 30s idle TTL + `stopPainting()` + 每插件 4 个上限。每销毁一个空闲渲染进程可省下整个 renderer 的固定开销。
5. **驻留驱逐时间化**。现有 3+2 idle resident 只按数量；补 idle 时长维度，并结合 `powerMonitor` 的 suspend/lock/on-battery 信号主动收缩（低功耗时机优先驱逐）。保持驱逐只释放热驻留、不动磁盘持久化。
6. **分进程 V8 上限校准**。在 P0-1 基线出来后，按进程类型决定 `--max-old-space-size`：主进程、renderer、utility process、agent-rpc 子进程工作集差异很大，统一 4GB 可能纵容 renderer 膨胀。注意 `--js-flags` 影响所有 V8 实例，拆分需要按进程入口注入不同 flag（agent-rpc 已是独立 spawn，可先动）。
7. **后台进程低内存优先级**。对 session-search worker、im-gateway sidecar、speech-input 等后台组件评估 `SetProcessInformation(ProcessMemoryPriority=Low)`（Windows）：让系统在压力时先裁剪它们的页面，而不是对主进程做 `EmptyWorkingSet`。仅 Windows、纯调度提示、不改语义。

**P2 — 结构性机会，随自然演进推进**

8. **CPU/崩溃风险组件迁 `utilityProcess`**。speech-input 已示范；评估 session-search worker（当前 worker_threads + `maxOldGenerationSizeMb`）等迁到 `utilityProcess` 换取独立 RSS 上限与独立 kill 能力。uiohook 有实测记录不能迁（CGEventTap），不要重复尝试。
9. **Session/上下文预算联动**。Compaction 已有完整策略与 backpressure；下一步是让"压缩时机"感知渲染端驻留——例如压缩发生时同步裁剪 renderer 中已折叠区段的展开对象（当前 compaction 主要省 token，对象驻留不变）。
10. **缓存预算全面审计**。已有上限的见 A 表；审计其余 renderer/main 中的 `Map`/`atom`（如 `browserUrlByWorkspaceAtom` 按 workspace 无限增长、TASK-0006 记录的 `suggestionTokenRef` 慢增长）补 LRU/TTL。单项收益小，但这类"无上限容器"是长尾内存增长的主要来源。
11. **回归门禁**。在 P0-1 基线稳定后，把"每进程 privateBytes 阈值 + 会话切换后 renderer 回落幅度"纳入 PerfMonitor 诊断输出与发布前人工核对清单；不上自动阻断（监控必须是旁路）。

### D. 必须先测量再决策的假设（置信度：中低）

- `--js-flags` 对 renderer 进程的实际生效范围与收益/代价（文档上它传给所有 V8 实例，Electron 34 下未实测）。
- webview 常驻 vs 重建的真实内存差与恢复延迟差。
- `pendingAssistantEvents` 在极端吞吐下是否会造成可观测峰值（理论上 100ms flush 内有界）。
- 隐藏 BrowserWindow（remote desktop、quickpanel）各自的稳态成本——需要基线数据才能判断优先级。

## 被否决的方案

- **对主/渲染进程主动 `EmptyWorkingSet` 或 `SetProcessWorkingSetSize(-1)`**：Windows 只把工作集页面移出，不释放 commit/swap，页面按需回 fault；Chromium 文档明确这类操作不能防 OOM，且会制造二次缺页开销。属于"数字好看、实际更差"的伪优化。
- **`--disable-renderer-backgrounding` 或全局关 `backgroundThrottling`**：方向相反——会让后台 renderer 的计时器/动画不被节流，增加而非减少常驻成本。remote desktop host 关 throttling 是刻意行为，不是反例。
- **关闭 site isolation / 合并进程省内存**：Chromium 文档确认进程分离的成本就是内存开销，但它是安全边界；webviewTag/sandbox/contextIsolation 的默认安全姿态不得为省内存而降级。
- **GUI 模式复用 CLI 的 `disk-cache-size=0`**：CLI 无 UI 才成立；GUI 关 HTTP 缓存会增加重复加载，内存收益微小而交互成本明显。
- **无基线调 `--max-old-space-size`**：4GB 是经验护栏（让 OOM 可诊断），在拿到分进程基线前上调下调都是盲动。
- **一次性把 transcript 改成分页存储/重写渲染管线**：成本与风险远超收益；先做窗口化 hydration（P0-2）拿主要收益。
- **在业务关键路径上同步采样/落盘监控**：违反 app-monitor 规则（旁路、可失败、不阻塞），只会让内存工具本身变成性能税。

## 代码/测试/指标锚点

- 指标入口：`app-monitor/perf-monitor-service.ts`（`app.getAppMetrics()` 每进程 workingSet/private + `process.memoryUsage()`），采样 2s/30s、快照 180、turn 记录 64。
- 驻留管理：`conversations/idle-session-residency.ts`（3）、`agent-teams/team-session-service.ts`（2）。
- 事件缓冲：`runtime-core/src/runtime-host/runtime-host-session-event-relay.ts:19`（4096）。
- 渲染端驻留：`chat-atoms.ts:186`（`chatMessagesAtom`）、`conversation-projection.ts:38`（pendingAssistantEvents）、`useSessionOpener.ts:283`（tailTurns=2）。
- 窗口/进程生命周期：`plugins/offscreen-capture-service.ts`（30s TTL/4 per plugin）、`quickpanel-window.ts`（懒建常驻）、`BrowserPanel.tsx`（webview 常驻）、`speech-input/speech-input-service.ts:79`（utilityProcess）、`im-host/sidecar-manager.ts`（Go sidecar）。
- 工具/上下文预算：`result-policy.ts:9`（50KB）、`mcp-tool-result-policy.ts:5`（20KB）、`deferred-tool-controller.ts:11`（15）、`subagent-dispatcher.ts:20-21`（3/50）、`compaction/contracts.ts:82-87`。
- 既有任务结论：`project/tasks/TASK-0006-history-memory-bounds.md`（窗口化、extension 工具上限、投影裁剪三项剩余缺口均出自此处）。

## 失效条件与置信度

失效条件：

- Electron/Chromium 大版本升级改变进程模型、内存记账或 flag 语义；
- 产品需求变化（例如要求离线全文搜索需全量 transcript 驻留）；
- P0-1 基线显示瓶颈不在本文识别的热点（例如图片/GPU 资源主导）；
- `--js-flags` 传播行为在新 Electron 版本变化；
- TASK-0006 之后新落地的改动使某些锚点过时。

置信度：

- A 表（已有边界）：高——全部为源码常量，逐条核对过行号。
- B 节热点排序：中高——驻留事实已验证，但量级排序依赖常识推断（无实测数据）。
- C 节预期收益方向：中——方向有官方文档与同类项目支撑，具体 MB 数未验证。
- D 节假设：中低——明确列为待测量项。

## 下一步触发信号

- PerfMonitor 快照显示 renderer `privateBytes` 长时间单调增长或会话切换后回落不明显 → 优先做 P0-2 窗口化。
- 新增任何无上限的内存容器（Map/数组/atom/webview/进程）→ 触发 C-10 审计项。
- 用户侧出现"长时间运行后内存膨胀/系统内存压力"反馈 → 先跑 P0-1 归因再动策略。
- Electron 升级 → 重验 D 节假设与 flag 语义。
- 会话切换延迟或首次打开大会话变慢 → 评估 tailTurns 预览与 hydration 分片的进一步收窄。
