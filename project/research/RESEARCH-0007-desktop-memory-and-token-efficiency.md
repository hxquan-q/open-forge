---
id: RESEARCH-0007
type: research
status: done
priority: P2
owner: apps/desktop
source: user-request; 本会话 CDP/进程采样 + 官方文档与 GitHub issue 对照
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 开发内存占用与 Agent token 效率优化对照研究

## 问题与范围

dev 环境（`bun run dev`）整机 ~4.6–4.8 GB，用户反馈内存过高；同时要求对照官方文档/GitHub 结论评估还能优化什么，覆盖 Electron/Chromium 进程、渲染器内部分配、Vite dev 开销，以及模型侧 token 消耗与产出效率。生产包内存是次要关注（dev 专属开销不计入），但需区分两类来源。

## 事实来源

实测（本会话，2026-09-23/24，Windows，Electron 34 dev 实例）：

- 进程分类采样（每 60s，`Temp\openforge-monitor.csv`）：基线 4.6–4.8 GB = 渲染子进程 ~2.1–2.3 GB + 14 个插件 dev server ~1.84 GB + 主进程 ~0.3 GB + esbuild/工具链 ~0.4 GB。
- 关闭 DevTools 后渲染子进程 2.2 → 1.04 GB（CDP `documents/frames=74` 清零、约 9.2 万 DevTools DOM 节点释放），证实 DevTools 持有的动画/DOM 数据是渲染侧最大可回收入口。
- `dev:lean`（`VETTA_PLUGIN_DEV=` + `VETTA_DEV_AUTO_DEVTOOLS=0`）实测 **~1.3 GB**：渲染子进程 ~0.7 GB（4 进程）、插件 dev server 0、esbuild 0。相比基线 **-73%**。
- Chromium memory-infra：主渲染 PartitionAlloc ~610 MB、malloc ~277 MB、Blink GC ~235 MB、V8 ~143 MB；渲染进程脚本字符 ~66.3 MB，其中内联 sourcemap URL 字符 ~27.5 MB（dev 专属），最大单文件 pdfjs 6.4 MB / pptx-renderer 3.1 MB / three.js 1.6 MB。
- token（会话 JSONL usage）：大 turn total 38.5M 中 98.4% 为 `cacheRead`（DeepSeek 盘缓存），新鲜 input ~110K、output ~215K，output/fresh-input ≈ 52%–66%；另有 218K input 的压缩形 turn，接近上下文上限需关注。

官方/上游一手资料：

- Electron Performance 指南：measure-first；避免阻塞主进程/渲染进程；延迟加载重模块；打捆；避免多余 polyfill 与网络请求（electronjs.org/docs/latest/tutorial/performance）。
- BrowserWindow：`backgroundThrottling` 默认开启（隐藏窗口节流 rAF/定时器），文档建议在 hidden 时暂停昂贵操作；`paintWhenInitiallyHidden` 控制初始绘制。
- `<webview>` tag 官方明确建议**不要使用**（Chromium webview 架构剧变中），推荐 `WebContentsView` 或 iframe（electronjs.org/docs/latest/api/webview-tag）。本仓库 in-app browser 目前用 `<webview>`。
- Vite Performance 指南：避免 barrel files、审计插件、`server.warmup` 预热高频文件、原生工具链（LightningCSS）、显式扩展名减少 resolve 探测；DevTools「Disable cache」会显著拖慢 dev 重载。
- DeepSeek Context Caching：自动开启、按前缀单元（user-input 末尾 / model-output 末尾 / 固定 token 间隔）持久化；命中要求完整匹配前缀单元；`prompt_cache_hit_tokens`/`miss_tokens` 字段；best-effort、小时-天级过期。
- Anthropic Prompt Caching：顶层 `cache_control` 自动缓存或显式断点；默认 5 分钟 TTL（1h 加价）；缓存覆盖 tools+system+messages 前缀；读 ~0.1×、写 ~1.25×。
- OpenAI Prompt Caching：默认开启（≥1024 token）；隐式/显式断点；cached-input ~0.1×；`tools`、`parallel_tool_calls`、`text.format`、`reasoning.effort`、`context_management`（compaction）变化都会从首个变化 token 起作废前缀。
- Svelte sveltejs/svelte#15203：transitions 持有已移除节点导致 detached-node 泄漏——与本次「DevTools/动画持有游离 frame 文档」同类问题模式，证实「动画/过渡机制滞留 DOM」是跨框架真实泄漏来源。

## 当前结论

已落地（本会话）：

1. `dev:lean` 脚本 + `VETTA_DEV_AUTO_DEVTOOLS=0` + `VETTA_PLUGIN_DEV` 语义：dev 基线 4.8 → 1.3 GB。
2. DevTools 自动打开改为策略函数 `shouldAutoOpenDevTools`（dev 默认开、`0` 关、E2E/打包恒关），行为测试覆盖 6 场景。
3. `model-catalog` lite 构建不再调未注册的 `vetta:models:fetch-remote`（BUG-0007，回归测试 + 实测日志确认）。

官方建议与仓库现状的差距（按收益排序）：

4. **重依赖按流程懒加载**：pdfjs/pptx-renderer/three 合计 ~11 MB 经 `optimizeDeps` 预打包随 dev 全量加载；Electron「defer expensive modules」与 Vite 插件审计建议一致——把它们挪到 artifact/预览打开时的 `import()` 边界可同时省 dev 内存与打包首屏。需先确认它们当前是静态还是动态引入。
5. **in-app browser 迁向 `WebContentsView`**：官方已不建议 `<webview>`；且 `WebContentsView` 由主进程持有 webContents，正好落在 `InAppBrowserSessionController` 所在进程，为 TASK-0063 的 Agent browser_tab 桥提供天然宿主（现状 webview 在 renderer，桥要跨一层 IPC）。属架构变更，应走 ADR + TASK-0063 一并评估。
6. **token 效率基本已到顶**：provider 层已有 Anthropic `cache_control`（含 `systemPromptStableLength` 稳定前缀切分、1h TTL）、OpenAI `prompt_cache_key`/`prompt_cache_retention`、Codex session 缓存头、DeepSeek 自动盘缓存（实测 98.4% 命中）。剩余收益点不在 provider 而在**上下文管理**：工具 schema 顺序/内容稳定（前缀失效因子）、压缩策略（218K turn 接近上限）、`output/fresh-input` 指标继续按会话监控。
7. **backgroundThrottling 已正确使用**：全仓仅 remote-control host 关闭节流（远程控制场景需要持续绘制，合理）；隐藏 webview/tab 默认被 Chromium 节流。
8. **Module Federation 共享已正确**：`plugin-shared-modules.ts` 声明共享 singleton（React 等），无多副本 React 风险。
9. 次级可选项（收益小、先不动）：Vite `server.warmup` 主 config 未配置；barrel file 审计；dev sourcemap 体积累积（27.5 MB 内联字符）属 dev 固有成本。

## 被否决的方案

- **把「14 插件 dev server」换成单进程 monorepo dev server**：现有 `VETTA_PLUGIN_DEV` 白名单已把成本降到可选；改架构的收益不抵复杂度。
- **renderer 堆上限/V8 flag 调优**：Chromium 渲染进程不适用 node `--max-old-space-size` 思路，且实测 JS 堆只占 ~143 MB，大头在 PartitionAlloc/DOM，调 V8 参数无效。
- **给 `<webview>` 单独写补丁维持现状**：与官方方向相反，不如直接评估 WebContentsView。
- **Anthropic 自动缓存以外再显式布点**：`packages/ai` 已实现稳定前缀切分 + TTL，重复建设。
- **V8 编译缓存（`module.enableCompileCache` / `NODE_COMPILE_CACHE`）**：Electron 34.5.8 内嵌 Node **20.19.1**，该 API 与环境变量均为 Node 22.1+ 才存在——真机冒烟 `enableCompileCache is not a function` 实证不可用；`v8-compile-cache` 包只补丁 CJS `Module._compile`，主进程 ESM bundle 不受益。待 Electron 升级到 Node 22+ 再重估（届时 dev 由启动脚本注入 `NODE_COMPILE_CACHE`、入口首 import 调 `enableCompileCache` 即可覆盖外置包与动态 chunk）。

## 代码/测试/指标锚点

- 改动：`apps/desktop/src/main/devtools-policy.ts`(+test)、`window-manager.ts`、`apps/desktop/package.json`(`dev:lean`)、`apps/desktop/README.md`、`run-dev-electron.node-test.mjs`、`renderer/shared/store/model-catalog.ts`(+test)。
- 文档锚点：`apps/desktop/src/main/browser-automation/webview-session-controller.ts`、`renderer/domains/plugins/runtime/plugin-shared-modules.ts`、`packages/ai/src/providers/anthropic/cache.ts`、`openai-responses/request.ts`。
- 指标脚本（Temp，未入仓）：`openforge-monitor.ps1`、`openforge-cdp-*.mjs`、`openforge-usage.mjs`。
- 测试：`devtools-policy.test.ts` 6 例、`model-catalog.test.tsx` 6 例（含 lite）、`run-dev-electron.node-test.mjs` 插件白名单用例；`check:quick` 通过。

## 失效条件与置信度

- dev:lean 的 -73% 是单机单次采样（Windows、无活动会话峰值）；不同机器/会话负载下绝对值会变，但「插件 dev server + DevTools ≈ 2.9 GB」的结构比例稳定。置信度：高。
- 「DevTools 持有游离文档」结论建立在关闭前后对照采样上，非 heap 引用链证据；若未来渲染器内存仍异常需重新抓 snapshot 验证。置信度：中高。
- pdfjs/three 等依赖的实际引入方式未逐一核实，懒加载建议标注为待验证。置信度：中。

## 下一步触发信号

- 渲染器内存再次异常上行 → 重抓 heap snapshot，查 `Detached *` 引用链（重点：iframe 容器组件 McpAppSurface/HtmlPreviewView/FrameView）。
- 会话出现上下文溢出/压缩异常 → 查 218K+ input turn 的 compaction 路径与 stop 语义。
- TASK-0063 启动 → 把 WebContentsView 迁移评估纳入实施，复用本研究的官方依据。
- 打包版本内存投诉 → 用同一采样脚本区分生产开销与 dev 开销再立项。

## 后续进展补记（2026-09-24）

- **重依赖懒加载已落地（three）**：`AchievementPromotionBadge3D` 实现改为 `React.lazy` + `import()` 边界（`AchievementPromotionBadge3DLazy.tsx`），settings barrel 只转发懒壳与类型；theme-ui `verify-purity.mjs` 新增 `lazyHeavyDeps` 机械规则禁止 barrel/其它文件静态引入 impl 或 `three`。实测确认 pdfjs 仅在独立 OCR 窗口入口与 office-viewer 插件内、pptx-renderer 经 Module Federation 按需加载，均不在主渲染器首屏静态图，不另动。回归测试：`achievement-badge-lazy-boundary.test.ts`（barrel 静态图不求值 three）+ `AchievementPromotionDialog.lazy-badge.test.tsx`（对话框打开后 impl 才求值并挂载）。顺带修复 `verify-purity` 既有失效条目 `ProjectsPanelSplitHandle`（47bf6f84b 删除组件后清单未更新）。
- **WebContentsView 评估已落盘**：TASK-0063 增补「架构评估」段——本任务维持 `<webview>`（ADR-0129 刻意选型 + 迁移是独立回归面），约束 host function 只依赖 `InAppBrowserWebContents` 抽象；迁移另立 TASK-0072（backlog, depends_on TASK-0063）。
- **上下文预算监控已落地**：`coding-agent.context/context-budget-exceeded` warning 观测（`context-observability.ts`），在组装 prompt 超 `contextWindow` 而压缩不介入时发出（`compaction_disabled`/`context_unavailable`/`non_overflow_error`），payload 含 trigger/suppression/contextTokens/contextWindow/overByTokens；不改控制流、不动 runtime-core 事件 union。`context-runtime.test.ts` 新增 4 例（禁用压缩超窗发声、窗内静默、非溢出错误标注、启用压缩不重复发声）。
- **dev renderer 预热已落地**：`vite.config.ts` 新增 `server.warmup.clientFiles=["./index.html"]`（root=`src/renderer`），主窗口入口依赖图与 Electron 主进程初始化并行完成冷转换；基线 `renderer boot frame visible` ~7.8s（2026-09-24 dev 日志），后续 dev 启动可直接对比该指标。dev 专属配置，打包路径无影响。Electron checklist 其余项核查结论：`show:false`+`ready-to-show`+`backgroundColor`、`backgroundThrottling`、单例锁、worker 拆分、打包 files=production 依赖均已在位；i18n `sendSync` 为首帧防闪的刻意单点保留；V8 compile-cache 因 Electron 34=Node 20 被否决（见「被否决的方案」）。
