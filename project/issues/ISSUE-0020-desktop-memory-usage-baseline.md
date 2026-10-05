---
id: ISSUE-0020
type: issue
status: draft
priority: P2
owner: apps/desktop
source: user-report; source inspection
created: 2026-09-24
updated: 2026-10-03
related_requirement: []
related_plan: []
related_tasks: [TASK-0186]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 内存占用偏高需要建立基线并定位主导进程

## 背景

用户报告当前 Desktop 内存占用很大，但没有提供占用数值、持续时间、会话规模或发生时的进程信息。Electron 应用同时包含主进程、Renderer 和可能的辅助进程；仅凭总内存无法判断是稳定的基线成本、页面/会话数据增长、插件资源未释放还是异常泄漏。

## 已知事实

- `apps/desktop/src/main/app-monitor/perf-monitor-service.ts:255` 已采集 Electron 子进程的工作集/私有内存以及主进程 Heap/RSS/External 数值。
- 仓库的性能观测需要以可重复基线和指标归因，而不是仅凭主观感受平均优化所有模块。
- 当前报告没有进程级内存快照、采样时间序列、运行时长或复现路径，无法判断主进程、Renderer、GPU/utility 或插件资源是否为主要来源。

## 未决问题

1. 哪个进程占用最高，内存是启动即高还是随会话/附件/Canvas/插件操作持续增长？
2. 占用是否在关闭会话、切换页面、停止生成、关闭 Canvas/Browser 面板后回落？
3. 同一场景下稳定复现的增长斜率与可接受阈值是什么？
4. 当前 perf monitor 是否已持久化并能安全导出足以定位问题的进程指标？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 先用现有 App Monitor 按固定场景采样并比较启动/空闲/长会话/资源关闭后的进程曲线 | 无代码变更即可区分基线偏高与持续增长 | 需要先得到稳定复现和同机对照 | 场景覆盖不足可能漏掉间歇性泄漏 |
| B. 先新增更细粒度的 Renderer/资源内存观测，再分析主要增长源 | 更容易关联 UI 子树或资源生命周期 | 增加采集复杂度与数据维护成本 | 观测本身可能产生额外开销，且过早加指标会偏离主因 |

## 推荐

先采用 A：固定 Desktop 版本、窗口/项目、会话时长与操作步骤，采集 Electron 各进程 working set/private bytes 及主进程 heap/RSS 时间序列；记录关闭长会话、Canvas、Browser、插件面板前后的回落情况。只有现有指标无法区分主因时再增加观测。

## 决策触发条件

获取至少一组可重复基线后，如果某进程在清理资源后仍持续增长，或明确高于启动/空闲基线且随特定操作线性增加，转为可复现性能 Bug 并制定针对该资源所有权的回归验证。没有量化数据前不制定绝对内存阈值。

## 后续 Task

- 采集并记录 Desktop 启动、空闲、持续对话、Canvas/Browser/插件使用与资源关闭后的进程级内存样本；确认主导进程后再拆实现 Task。

## 首轮采样（2026-09-25，隔离 dev 实例，**非空载**）

采样状态：dev 实例打开项目 `E:\demo`、加载 1 个历史会话、无生成中（应用自身 perf 快照 `sampling:"idle"`、`activeSessions:0`、`queueDepth:0`、`sessionCount:1`）。dev home 有前序会话数据，**不能当空载基线**。

- 操作系统层（CIM `WorkingSetSize`/`PrivatePageCount`，按 PID + `--type`/`--utility-sub-type` 分类）：

| 时刻 (UTC) | main | renderer A | renderer B | gpu | utility(Node) | utility(Network) | 合计 |
|---|---|---|---|---|---|---|---|
| S1 04:29:04 | 254.7 MB | 436.2 | 301.3 | 134.4 | 327.6 | 64.3 | 1518.5 MB |
| S3 04:43:44 | 281.9 MB | 688.1 | 418.9 | 129.5 | 327.6 | 65.3 | 1911.3 MB |

- 应用自身观测（`perf-snapshot.json`，`2026-09-25T04:43:05.591Z`，`sampling:"idle"`）：main workingSet 267.7 MB / private 223.0 MB / heapUsed 113.3 MB（heapTotal 117.8、rss 274.1）；renderers 890.7 MB + 342.6 MB；gpu 133.7 MB；utility 335.4 MB + 65.3 MB；**totals: workingSet 2 035 420 KB / 6 进程**，cpu 3.72%。
- 诊断包：`%TEMP%\vetta-diagnostics-2026-09-25T04-43-26-065Z.zip`（只读了 `perf-snapshot.json` 与 `system-info.json`，未读日志）。
- 产品事实：perf monitor 只驻留**内存**（`perf-monitor-service.ts` 的 `this.samples`），仅随诊断包落盘；`~/.openforge-dev/app-monitor/summary.json` 无进程内存字段。
- 口径提醒：同一时刻 `tasklist` 的 Mem Usage 与 CIM 读数存在差异（读数时刻/口径不同），引用数字时必须标注来源与时刻。

**结论**：拿到一组可重复的"非空载"样本，但**尚不足以**触发决策条件（需要空载基线 + 持续对话/Canvas/Browser 前后对照）。下一步：在同一固定版本上补一组空载基线，再按文档的 A 方案做资源关闭前后的回落对照。

## 补充调查（2026-10-03，现有开发进程，只读 OS 计数）

### 范围与证据口径

用户报告通过 `bun run dev` 开发调试、仅进行一个对话时内存仍高。本轮仅分析，串行调查，不修改实现、不新建修复 Task、不启动/重启/附着 Desktop、不读取用户会话/状态/日志、不请求 Provider。通过 `Get-CimInstance Win32_Process` 读取进程元数据与内存计数；命令行仅用于本地识别父子关系、进程角色及仓库插件名，不保存或输出完整命令行。

调查时仓库为 `main@cf4c1147a`，Desktop manifest 为 `0.1.3`；这不证明正在运行的实例恰好使用该提交构建。Electron 主进程 PID 25124 创建于本地时间 03:33:17，完整开发启动子树以其上层 launcher PID 27824 为根。以下为 04:14:28 +08:00 的同次 CIM 采样，不含该子树以外的其他 Node/Bun 工作负载。

| 分类 | 进程数 | Working set（MiB） | Private bytes（MiB） |
|---|---:|---:|---:|
| Electron main | 1 | 322.9 | 288.7 |
| Electron renderer | 2 | 1841.7 | 1768.6 |
| Electron GPU | 1 | 188.7 | 185.3 |
| Electron utility | 2 | 391.5 | 279.6 |
| 插件开发服务器 | 15 | 1673.0 | 2200.8 |
| Renderer / theme Vite | 2 | 625.5 | 1233.4 |
| esbuild | 17 | 322.1 | 928.5 |
| 启动器及其他后代进程 | 27 | 360.5 | 340.9 |

整棵开发进程子树 working set 求和约 **5725.9 MiB（5.59 GiB）**；共享页可能重复计算，不等于系统独占物理内存，也不等于任务管理器应用分组的特定口径。Private bytes 表示私有提交量，不等于实际驻留 RAM。此前 04:13:11 的采样中两个 Renderer 分别为 1428.7 / 369.0 MiB；未映射 webContents，不能断言哪个 PID 是聊天窗口或 DevTools。多个时刻的快照不构成受控泄漏复现。

15 个直接隶属 Electron main 的插件开发服务器，按 `plugin-vite` 入口与仓库 `--root` 识别为：allstar-coding、browser、build-apple-apps、chart-renderer、comfyui-media-provider、content-creation、git、image-gen、media-viewer、office-viewer、plugin-workbench、preset-agent、svg-viewer、vetta-actions、vetta-ui-design。这证明启动了开发工具进程，不证明用户使用了这些插件，也不代表运行了 15 个对话。

### 源码核对与当前结论

1. 根 `package.json` 的 `dev` 只 watch 核心库，并不启动 Electron；实际 Desktop `dev` 位于 `apps/desktop/package.json`，并行运行 renderer、themes、electron。后续说明启动命令必须明确目录。
2. `apps/desktop/scripts/run-dev-electron.mjs#resolveDevPluginIds` 在未显式配置时选取当前 tenant 的全部预置插件；`src/main/plugins/plugin-dev-bootstrap.ts` 分批启动所有已选项目，`START_CONCURRENCY=4` 是启动并发数，不是常驻数量上限；`plugin-dev-watch.ts#spawnPluginDevServer` 为每个项目派生独立 Node CLI。开发工具开销与对话数量无直接对应关系。15 个服务器本身已有约 1.63 GiB working set，尚未计其 esbuild 后代。
3. `src/main/devtools-policy.ts#shouldAutoOpenDevTools` 与 `window-manager.ts` 默认自动打开分离式 DevTools。README 和源码注释指出 DevTools 动画调试可能延长页面对象保留时间；这是后续对照方向，不是本轮对 1.4 GiB Renderer 的堆归因证据。
4. 已有 `apps/desktop/package.json#scripts.dev:lean` 将 `VETTA_PLUGIN_DEV` 设为空并设置 `VETTA_DEV_AUTO_DEVTOOLS=0`。README 明确继续使用 staged 插件归档，而非禁用插件功能；`run-dev-electron.node-test.mjs` 已有默认全选、空字符串禁用开发服务器、指定列表三种合同测试，本轮只读未执行。

从 `codebase-design` 视角，应先在开发启动 Module 的 Interface / Seam 上选择已有轻量配置，让插件开发进程的生命周期服从开发需求；尚无证据支持先重构会话 Module、压低 V8 堆上限或删减聊天能力。

### 推荐的下一步与未验证项

- 日常只调试对话时，可在用户正常结束当前实例后，从仓库根运行 `bun run --cwd apps/desktop dev:lean`；本轮不代为执行。该入口仍运行 renderer/theme 开发环境，不等于生产包。
- 若迭代单个插件，使用 `VETTA_PLUGIN_DEV=<plugin-id>` 配合普通 Desktop `dev`；不要用会覆盖该变量为空值的 `dev:lean`。
- 经授权后在同机、同版本、同数据、同样操作下比较普通 dev / lean 的启动空闲、固定对话、停止生成后曲线。先确认插件进程消失，再看 Renderer 是否仍持续增长；不能承诺固定节省数值或已消除泄漏。
- 本轮未做应用内操作、堆快照、GC 对照、生产包比较、真实对话复现或代码修复；Issue 保持 `draft`，不能标为性能问题已解决。
- 本轮仅续记调查管理证据，无实现或交付物变化，不新增 Task、Release Notes 或提交；进入实施后再完成 Task、验证及版本说明合同。

## 实施切片（2026-10-03）

用户要求继续 Renderer 优化。已创建 [TASK-0186](../tasks/TASK-0186-office-preview-on-demand.md)：Office 预览按格式加载与 PDF worker URL 释放；不把全插件激活延迟或 dev 策略变更夹带进来。完成后仍需受控 Renderer 内存对照，Issue 不提前关闭。

TASK-0186 首片工程验证通过：Office MF 同步代码由 3,488,824 降至 72,338 bytes（-97.93%），四种解析器均延迟加载；PDF worker URL 最后一个预览异步关闭后释放。4 条回归、影响测试、构建与完整 check 已过；主树有其他未提交修改，独立分支待集成。未做实机 RAM 对照，不能用该字节降幅推算 Renderer 内存，也未修改全部插件激活/dev-server 策略。
