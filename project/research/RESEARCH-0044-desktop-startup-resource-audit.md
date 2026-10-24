---
id: RESEARCH-0044
type: research
status: done
priority: P1
owner: desktop/coordinator
source: user-request; current-source; retained-performance-logs; official-documentation
created: 2026-10-24
updated: 2026-10-24
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_issue: []
related_tasks: [TASK-0398, TASK-0355, TASK-0399, TASK-0400, TASK-0401]
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 启动性能与资源占用再调查

## 问题与范围

**仍有明确的优化空间。优先消除启动后主线程的同步运行环境探测，再收缩启动静态依赖、修正冷恢复时未知大小落入全量历史的路径。资源占用需要先取得分进程基线，当前证据不足以承诺节省多少 MB 或 CPU。**

关联 [TASK-0398](../tasks/TASK-0398-desktop-startup-resource-audit.md)，复用 [REQ-0002](../requirements/REQ-0002-runtime-performance.md)。本轮仅调查：不修改生产代码、不运行真实应用/Provider、不读取用户会话正文或凭据。管理记录不代表优化实施或收益验证。与 PLAN-0024 的 Agent 内核/Team 投影性能工作分开，避免把启动研究扩大成内核重构。

## 事实来源与口径

- 调查日：2026-10-24，Asia/Taipei。源码基线 `main@ea67d951e8bb29a464219812465d3a4ae2939179`；工作区已有其他会话的 Project 修改，未覆盖或纳入本次交付。
- Desktop manifest：版本 `0.1.3`，Electron 依赖 `41.10.7`。包级 AGENTS 的技术栈概述仍写 Electron 39，以 manifest 为当前代码依赖事实；不据此认定所有历史运行都使用相同版本。
- 图谱 `.ua`：2026-10-12，commit `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`，17,009 节点、35,740 边；相对调查 HEAD 有 1,528 条变更路径。已读架构层、startup 节点与一跳关系，再用源码核实；未刷新图谱。
- 日志：读取 default/dev 的 2026-10-21 至 10-23 已保留 main/render 文件作上下文；以下新阶段指标聚焦 **dev 10-22、default 10-23** 两份 main 日志。没有 10-24 运行样本；不把旧记录表述成今天的启动实测。日志读取只输出阶段、耗时、计数与指纹，不复制原始日志。
- default 10-23 两次启动附近均有 `isPackaged: true`，该文件还有 `app.asar` 栈；可归为安装形态样本。不能以 default 目录本身证明其中所有记录都是安装版运行（历史研究已发现测试污染）。
- 两项原生只读调查分别覆盖主进程启动、Renderer 与常驻资源；Coordinator 负责日志提取、第一方资料、综合判定和记录。没有新构建、性能压测、堆快照或生产 A/B。

### 主要日志读取边界

别名 `dev` 对应 `~/.openforge-dev/desktop-app/logs`，`default` 对应 `~/.openforge/desktop-app/logs`；行号为当前文本行号。

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| dev/main/2026-10-22.log | 470,244 | `e1be24964c146342561470610da33eb6a44e256bedf62e1aa6aedcb132da0056` |
| default/main/2026-10-23.log | 600,359 | `9c3c89a53fca31aacd3b30e7a2aa8aa1514c235a9969a49816815be789b5a0be` |

方法：Python 标准库按日志事件头切分多行事件，仅取 main 的已知阶段与 `durationMs`。用事件时间减累计耗时关联同一启动起点（容许 8ms 日志时间差），每阶段只取首次记录；runtime 任务按相邻启动窗口关联。重复 route commit、15:10 的 renderer 重载等不增加冷启动样本。未按错误次数估计故障率，未因 n=2/6 发布总体 p95。

## 当前结论

### 1. 观测到的启动阶段

下表单位均为 **ms**。boot/module/route/content 是从 `main.ts:497` 的 Renderer 启动计时起点到主进程观测的累计时间，**不是从用户点击图标开始**。runtime 列是该任务自身的耗时，不能与累计时间直接相加。

| 形态 / 日期 / 启动时段 | boot painted | module 通知收到 | 首次 route commit 通知收到 | content 结果 / 时间 | runtime 初始化 / runtime-and-cli |
|---|---:|---:|---:|---|---:|
| dev / 10-22 08:56 | 1,116 | 12,616 | 12,625 | timeout / 10,489 | 1,595 / 2,219 |
| dev / 10-22 10:24 | 930 | 10,815 | 12,563 | timeout / 10,380 | 1,651 / 2,174 |
| dev / 10-22 11:06 | 1,046 | 13,051 | 13,515 | timeout / 10,423 | 1,514 / 1,570 |
| dev / 10-22 11:21 | 1,151 | 16,202 | 16,729 | timeout / 10,438 | 1,682 / 1,770 |
| dev / 10-22 11:49 | 1,352 | 15,845 | 16,314 | timeout / 10,624 | 1,556 / 1,774 |
| dev / 10-22 14:37 | 4,032 | 25,030 | 25,479 | timeout / 12,096 | 8,721 / 9,074 |
| 安装形态 / 10-23 10:04 | 572 | 528 | 621 | painted / 928 | 3,176 / 3,316 |
| 安装形态 / 10-23 21:29 | 4,159 | 4,112 | 4,239 | painted / 4,362 | 3,200 / 3,412 |

日志锚点：dev 六次 boot 在 83/682/1570/2212/2848/3374 行，module 在 189/786/1721/2319/2965/3456 行，timeout 在 185/774/1663/2280/2916/3378 行；default 的 module 在 68/2403 行，paint 在 92/2426 行，runtime 在 122/2437 行。

dev 六次 boot 中位 1,133.5ms，module 通知中位 14,448ms，但 content 六次均是 timeout，**没有这六次的最终真实 content paint 时间**。安装形态只有两次，paint 分别 928ms、4,362ms；这证明波动值得调查，不能作为可推广的冷/热启动基线。

重要口径限制：

1. `renderer/main.tsx:48–49` 在 import 完成后发阶段；`preload/apis/app-lifecycle.ts:20` 只发送字符串；`main.ts:472–473` 在收到 IPC 时取时间。**module 数值含潜在的主线程接收排队延迟**，不能把 10.8–25.0 秒全部归给 Renderer JS 下载、编译或 CodeMirror。
2. `app-lifecycle.ts:21` 超时会 resolve；`main.ts:869–887` 对 painted/timeout/hidden 结果没有重任务分流，都会启动监控并推进后续任务。约 500ms 后运行环境预热可与尚未完成的 Renderer 竞争；这不解释此前的全部 10 秒等待。
3. 当前 content Promise 超时之后，main 没再等待晚到 paint；已有测试证明后续新观察者能取得真实 paint，但这一启动的日志可能只留下 timeout。
4. 当前计时不包含主进程静态模块求值和 Electron ready 前开销；`startup phases drained` 只排名三个注册任务，不含全部插件、监控、IM、知识库工作。

### 2. 建议优先级与证据

| 顺序 | 已确认机制 / 候选 | 建议最小改变 | 最低验证与代价 |
|---|---|---|---|
| 前置 | 现有日志缺 Renderer 本地时间、IPC 排队差、进程启动外部计时；PerfMonitor 没有普通日志中的长期序列 | 复用现有监控，补进程入口时间、Renderer `performance` 时间与 main 接收时间；记录超时后的实际完成；旁路采集分进程占用 | 以相同 build/profile 的冷/热重复运行比较；监控失败不得阻塞业务。不是重建一套启动框架 |
| **P1-A** | `runtimes/manager.ts:87–99,429–457,569–602` 在主线程多次 `spawnSync` 探测 node/python/pip/git；pip 已有时仍检查版本；修复分支还含 30/60s 同步命令。安装形态两次 runtime 约 3.2s，但未测其中同步部分占比 | 改异步 `execFile`/spawn、明确超时/取消与有限并发；同一轮探测去重，健康工具按路径/文件版本缓存；缺失/失效才修复 | 核心目标是主线程可响应，不保证任务总墙钟耗时等比例下降。测试慢/失败子进程期间 IPC/心跳仍推进，验证 PATH/版本变化能失效、退出时清理 |
| **P1-B** | 全局 overlay 静态链把 CodeMirror 与多语言包带入启动应用模块，即使预览未打开 | 保留轻量状态/事件门面；首次文件预览/编辑时加载重组件，必要时可交互后有界预取 | 新发行构建依赖闭包、paint 与首次打开编辑器延迟；不能延迟整个审批/事件中心而漏请求。没有证据将现有慢启动全归因于该链 |
| **P1-C** | 自动恢复 `openSession` 不传文件大小；sessionsMap 初始为空时，`bytes === undefined` 默认 full。虽然先显示 tailTurns:2 预览，之后仍会 getFullHistory 全量映射并标记 unbounded。竞态可达，但非每次发生 | 自动恢复先取轻量元信息，或采用已有有界 tail；用户明确完整历史仍保留 | 覆盖“大会话 + 空 map + 延迟列表加载”的真实恢复入口，验证分页、流式合并、编辑/导出合同；量测恢复后 30/60s heap 与 privateBytes |
| **P2-A** | 命令面板关闭时三个 prefetch 仍启用；技能扫描/usage IPC、连接器配置和图标目录开始准备，连接器还随 open 切换重读。技能列表已有 inflight 去重，图标已有 Promise 缓存 | 按交互就绪/近期使用调度预取；重点减少连接器重复读取、明确数据失效，保留已有去重，不一律取消预取 | 统计启动 IPC/扫描次数、首次展开延迟；异步调用本身不等于无 CPU/IO 成本 |
| **P2-B** | 技能列表模块级 Map 按语言/cwd 累积；图标缓存按身份 token 保存 Promise，无容量/旧身份淘汰 | 有界 LRU、配置/插件/语言失效；身份切换仅保留有效代次 | 多 cwd/身份切换后条目数受限、失败可重试；heap retained size 证明价值。无界容器是代码事实，尚未证明它主导占用或发生泄漏 |
| **P2-C** | BrowserView 已限 detached 3 个，但没有时间 TTL；quickpanel 首次使用后 hide 常驻 | 长时间闲置/内存压力下选择性释放，保留恢复状态 | 豁免下载、未保存表单、活跃自动化等；比较隐藏后 5/15 分钟占用与重新打开延迟。此项不改善从未打开过这些界面的冷启动 |

优先处理 P1-A 与 P1-C 的理由是机制明确，分别针对可响应性和大会话内存放大；P1-B 在当前静态依赖中也明确存在，但实际收益须由 bundle 闭包与 trace 分解。实施可分为独立 concern，先建立同源基线，再做单项 A/B，最后验证组合；本轮不创建已获实施授权的假象。

次级候选：

- `main.ts:542` 启动同步发现系统插件，经 `plugin-system-catalog.ts:33–80`/`plugin-package.ts:39–55` 读取目录/manifest/locales；本地 staging 只有 18 插件、36 locale JSON、120,183 字节 locale，尚不足以定为主导瓶颈。
- 启用知识库时 `knowledge/poller.ts:153–180` 每次 start/reload 重建缓存，`runtime-knowledge/src/processing/ingest-round.ts:50–57` 扫描 wiki 写三索引。大知识库可比较版本/mtime 增量方案，但当前未读用户知识库规模。
- `logger.ts:177` 同步日志写盘，`:350` 每次创建时间 formatter；可先量测格式化/写盘成本与启动日志数量。重入保护依赖同步管线，不可直接把 sync 改 false 而不保护顺序、退出 flush、错误诊断。
- IPC 注册期的共享 runtime 构造与模型初始化可分段计时；不等于所有 MCP 都提前启动，也没有证据支持先重构全部服务为懒加载。

### 3. 占用方面能确认什么

本轮没有可比的整应用 CPU/RAM 基线。只读 OS 进程查询未找到匹配 Desktop 的进程，因此没有为补数字而启动应用。两份主要日志均没有 `heapUsed/privateBytes/rssBytes/cpuPercent` 样本；dev 的两条 `workingSetKb` 为 61,440 与 70,820，仅是电源事件时的 **main 进程** 工作集观测（`power-trim-service.ts:107–158`），不能当全应用内存或证明释放了相同数量的对象。

现有采集骨架可以复用：

- `perf-monitor-service.ts:23–28`：idle 30s、active 2s、保留 180 个样本与 64 条 turn。
- `:94–105,229–235`：initialize 先排下一次定时采样，初始通常按 idle 等待；因此最初数秒启动峰值可能没有进程样本。不要误写成每次启动立即有 2s 采样。
- `:272–283` 将快照保存在进程内，不正常逐条写文本日志；诊断导出 `diagnostics-bundle.ts:107` 可携带 `perf-snapshot.json`。当前未导出真实实例诊断包。
- `:294–309` 从 `app.getAppMetrics` 取分进程 workingSet/private 与 main 的 Node heap；`perf-snapshot.ts:463–489` 总量只合计工作集/CPU，private 仍在各进程条目。后续需独立统计 private，并核对普通外部子进程是否被覆盖。
- Electron 文档中这些内存字段以 **KB** 计，`privateBytes` 名称不意味着字节；工作集与 private 含义不同，不能把含共享页的工作集相加当成系统唯一物理占用。

只读旧构建可提供方向：`renderApp-DCuAhOL9.js` 为 4,057,959 bytes（3.87 MiB），全部 386 个 Renderer JS 合计 17.31 MiB，文件修改于 2026-10-22。它不是当前 HEAD 的受控新构建，合计包含懒加载代码；**不能把这些字节当启动载入量、CodeMirror独占体积或节省的 RAM**。

### 4. 已有优化，保留而不重复立项

- [TASK-0105](../tasks/TASK-0105-startup-phase-idle-governance.md) 已有首屏/idle 相位、boot shell、分阶段预热；8ms 预算只在单任务完成后检查（`startup-phases.ts:198–208`），不能抢占 task 内的同步调用。
- [TASK-0355](../tasks/TASK-0355-startup-paint-observation.md) 已区分 paint/timeout，补 module/route 观测；仍有本报告指出的接收时间与晚到 paint 缺口。
- 路由普遍 lazy；Office/PDF 按格式加载；`vite.config.ts:164` 已有 index.html warmup。不要泛泛再建议加 lazy/warmup；dev 专项应通过 transform/profile 验证 warmup 对动态 renderApp 依赖的实际覆盖。
- [TASK-0050](../tasks/TASK-0050-transcript-cursor-pagination.md) 已有 tail/游标分页，本次是恢复入口策略的问题，不是“尚无分页”。
- [TASK-0039](../tasks/TASK-0039-webview-pinned-bounds.md) 已有限制 pinned 驻留；BrowserView detached 也有上限；quickpanel 已首用才创建。
- IM 仅启用且凭据条件满足时起 sidecar（`im-host/index.ts:518`），不把它说成所有用户必然常驻。
- 旧 [RESEARCH-0003](RESEARCH-0003-desktop-memory-footprint.md)、[RESEARCH-0035](RESEARCH-0035-fourteen-day-log-performance-audit.md) 仅作历史对照，不能把其中已经落地的待办继续当新缺口。

## 代码、现有测试与后续验证合同

Renderer 证据锚点：

- 静态重依赖：`renderer/main.tsx:48` → `renderApp.tsx:8` → router/App → `root-layout/RootLayoutView.tsx:20` → `RootGlobalOverlays.tsx:3` → `FilePreviewDialog` → `FilePreviewDialogView` → `PreviewContent:14` → `EditableTextFileView:6` → `packages/theme-ui/src/file-preview/TextFileEditorView.tsx:3` → `TextCodeEditorView.tsx:1` / `text-editor-language.ts:1–8`。
- 自动恢复（相对 `apps/desktop/src/renderer/`）：`root-layout/useRootLayoutModel.ts:154`；`shared/store/project-atoms.ts:127`；`domains/project/hooks/useProjects.ts:202,209,245`；`domains/conversation/hooks/useSessionOpener.ts:99–113,611,713,724`。
- 恢复可达性复核：`useSessionOpener.ts:340` 在该阶段第一个 await 前读取策略，没有等待项目列表的门控；`:349` 先打开两轮预览不等于后续 full 被取消。
- 命令面板（相对 `apps/desktop/src/renderer/domains/conversation/hooks/`）：`useCommandPanelModel.tsx:67–75`、`useSkillList.ts:44,55–61,108–113`、`useSkillIconMap.ts:20,26–29,57`、`useConnectorGrid.ts:46–60`。
- 隐藏驻留：`main/browser-automation/browser-view-host.ts:82,133–142,208–222`、`main/quickpanel-window.ts:122,249–252`。

已读测试、未执行：`app-lifecycle.test.ts:38,62,82` 覆盖 timeout/后到 paint/合法阶段；`startup-phases.test.ts:72,90,118` 覆盖 idle/让出/饥饿兜底；`renderer-startup.test.ts:5,33,40` 覆盖清缓存与启动顺序；`useSessionManager.session-switch.test.ts:585` 覆盖已知大小/显式 tail；命令面板 model 测试 mock 三个 hook，不能证明真实请求数量。

后续实施最低场景：

1. **受控隔离基线**：同一个 build/commit、同一机器负载、插件集合、数据规模、缓存条件，各组重复至少 5 次。空首页/恢复大历史分组；开发态/安装形态分组，不将热重载计入冷启动。不使用用户真实状态作为测试夹具。
2. **启动时间**：外部进程启动→boot→内容真实 painted→可交互；Renderer 本地阶段与 main 收到阶段分开；timeout 后最终成功必须可见。记录启动后 60s 最大事件循环阻塞、CPU 峰值与积分，而非只有后台任务总时长。
3. **占用**：主进程、主 Renderer、GPU、utility、普通子进程分别记录 working set/private/main heap；0–60s 峰值与 5 分钟稳态分开。记录打开的会话/终端/网页/插件数量等聚合上下文，无标题、URL、Prompt、凭据。
4. **连续流程**：启动→自动恢复大会话→切换数个项目→开关命令面板→打开/隐藏网页和 quickpanel→闲置 5/15 分钟→重新打开；判断占用是否回落及首次使用是否退化。
5. **机制回归**：慢子进程不阻断心跳/IPC；timeout 不能无限饿死必要后台初始化；未知大小恢复保持有界；预取去重与失效；隐藏驱逐保护未完成工作。按测试政策从真实入口覆盖，不靠 Mock 调用次数单独宣布用户体验通过。

## 第一方参考与适用边界

以下资料于 2026-10-24 核查；均为设计依据，不是本仓实测收益。

- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)：避免过早加载无关模块、避免主进程阻塞，以 profiling 选瓶颈；对应本报告 P1-A/B。
- [Node.js Child process](https://nodejs.org/api/child_process.html)：spawnSync/execSync/execFileSync 会阻塞事件循环；异步 execFile 默认直接执行目标而非 shell。Windows 命令路径、取消/超时仍须按现有合同实现。
- [Vite Performance](https://vite.dev/guide/performance)：dev 按请求转换与依赖瀑布、server.warmup 和 profiling；只支持开发态专项，不能用 dev 秒数估计安装版。
- [Electron MemoryInfo](https://www.electronjs.org/docs/latest/api/structures/memory-info/)：workingSetSize、privateBytes 的含义和 KB 单位。
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)：主进程/Renderer/utility 的职责边界；增加独立进程有管理成本，不因为同步热点就整体迁移应用架构。

## 被否决的方案

- 不通过延长 paint timeout、继续延后同一同步任务、关闭沙箱或 GPU、扩大权限掩盖问题。
- 不把内存工作集裁剪当对象释放，不无基线调整 max-old-space-size；保留既有电源事件策略，不扩成主动周期清空。
- 不一次性重写 Electron 架构、不把所有服务懒加载、不取消所有预取；必须保护早到请求、运行任务、首次使用延迟和恢复语义。
- 不基于旧产物体积/历史研究/单次测试给出“可减少几百MB”“启动提速百分之多少”的承诺。

## 失效条件与置信度

同步进程探测、静态依赖、未知大小 full 分支、缓存无容量边界为高置信源码事实；其真实占比与收益是待测假设。历史日志证明这些观测发生过，不证明当前 HEAD/每台机器可重现。没有受控环境信息，日志时序不构成唯一因果链。

源码依赖、Electron/Vite版本、会话恢复合同、缓存失效或隐藏窗口保活要求变化时应重验；主导占用若为图片/GPU/外部子进程，则调整排序。当前结论不是所有 Desktop 模块逐行审计或不存在其他问题的证明。

## 下一步触发信号

用户要求实施后，将 P1-A、P1-B、P1-C 分别收紧为独立 Task 并先复测基线。若基线表明同步探测实际占比很小，按 trace 调整顺序；若隐藏驻留或技能缓存未构成显著资源增长，保持 P2，不为理论收益增加生命周期复杂度。

## 后续实施回链（2026-10-24）

以上正文保留调查时点的源码与日志基线。用户随后授权三个 P1 的实施，已按 [PLAN-0002](../plans/PLAN-0002-performance-reliability.md) 交付 [TASK-0399](../tasks/TASK-0399-runtime-startup-async-probes.md)、[TASK-0400](../tasks/TASK-0400-file-editor-lazy-startup.md)、[TASK-0401](../tasks/TASK-0401-bounded-session-auto-restore.md)；当前实现、实际验证与兼容边界以这些 Task 为准，不能再把原同步探测和默认启动依赖链描述为当前未修状态。

受控证据为异步探测期间心跳可推进、组合构建启动静态 JS 减少 29.40%、合成 2000 条历史自动恢复仅驻留 10 条且保留分页/full。三个 Task 已完成独立复审及组合检查，在本地 main 原子提交，保持 `verifying` 等待人工体验验收；未推送、未发布。没有新的真实启动或分进程 RAM/CPU 样本，调查中关于实机测量和 P2 候选的限制仍然适用。
