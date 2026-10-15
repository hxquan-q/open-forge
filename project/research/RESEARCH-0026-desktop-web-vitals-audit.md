---
id: RESEARCH-0026
type: research
status: done
priority: P1
owner: coordinator
source: user-request; 用户报告 Desktop 使用性能差（CLS 0.58 / INP 736ms，自称 Chrome/Lighthouse 对 dev 服务器首页）
created: 2026-10-15
updated: 2026-10-15
related_requirement: []
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 首页与会话链路 Web Vitals 调研（CLS/INP/LCP）

## 问题与范围

用户报告 Desktop 存在"使用性能问题"，引用一组 Core Web Vitals 数字：CLS 0.58（很差）、INP 736ms（很差），
自述来自 Chrome/Lighthouse 打开 Vite dev 服务器（`http://127.0.0.1:3020/`）首页。

本轮范围（仅调研，未改产品代码）：

1. 确认该组数字的测量面与可信度；
2. 在真实 Electron dev 实例（附着 `verify:ui` dev profile，不启动/停止用户实例、不调真实 Provider）
   上建立可复现基线，覆盖首页启动、会话切换、逐字输入、大会话启动恢复；
3. 把已确认的真实瓶颈映射到具体代码接缝，给出修复优先级与最低验证方式。

## 事实来源

### 实测环境与方法（2026-10-15，单机单次样本）

- 附着用户已运行的 dev 实例：`verify:ui:status:dev`（主窗口 `127.0.0.1:3020`，CDP `127.0.0.1:9223`，
  home `~/.openforge-dev`）。
- 探针：`verify:ui:pw:dev -- run-code --filename=...` 注入 `PerformanceObserver`（layout-shift 带
  source 节点几何、event timing 带 interactionId、longtask、LCP，全部 `buffered:true`），执行
  `reload` 与代表性交互后读回 JSON。全部临时脚本位于系统临时目录，用后已删除。
- 未运行测试套件、未修改任何仓库文件以外的状态；测量中把开发实例视口临时仿真为移动尺寸后已恢复为
  窗口默认 1280x800（若用户此前自定义过窗口大小需自查）。

### 场景结果

| # | 场景 | CLS | INP | 长任务（>50ms） | LCP |
|---|---|---:|---|---|---|
| 1 | 首页 reload，12s 窗口 | 0.069 | 无交互 | 8 个：56–297ms | 5584ms（P） |
| 2 | 会话切换（点击侧边栏「服务器检查」） | 该轮累计 0.101 | **400ms**（pointerdown/up/click 同 interactionId） | 438/236/219/170ms 等 | — |
| 3 | 会话页逐字输入（约 20 字符） | — | 按键中位 **16ms**、最差 32ms、聚焦点击 96ms | — | — |
| 4 | 大会话（4.37MB 历史）启动恢复，22s 窗口 | **0.003** | 无交互 | 15 个：587/544/304/251/235/179…ms | **21.9s** |
| 5 | 首页 reload，移动视口 412x823，15s 窗口 | **0.001** | 无交互 | 512/246/143/136ms 等 | 8628ms |
| 6 | 纯 Chrome 直开 dev URL（无 preload） | 无有效样本（空白页） | 无有效样本 | — | — |

场景 1/2 的主要位移源节点（探针记录）：

- 一个 1026x64 的主区头部 DIV 出现后消失（`value 0.064`，@5.4–8.8s），会话切换后同一类头部条再下移 242px
  （`0.024`）——对应路由骨架内容条被真实页面/页头替换及 PageHeader 槽位挂载后一帧才注入；
- 侧边栏「自动化/更多」按钮被上方异步内容顶下移 33px（`0.003`）——项目/会话列表多波回填；
- 输入卡内部行（占位文案、权限徽标、发送图标）后到把卡顶动（单项 ≤0.004）。

### 场景 6 的代码证据（纯 Chrome 为什么必然无效）

- `apps/desktop/src/renderer/main.tsx:36`：`window.vetta.appLifecycle.whenReady()` 在
  `root.render`（:38）之前同步执行；纯 Chrome 无 preload，`window.vetta` 为 undefined，模块求值即抛错。
- `apps/desktop/src/renderer/shared/host-api.ts:3-4`：模块顶层 `window.vetta` 解构，`renderApp`
  动态导入链必然失败（`main.tsx:46-54` 只记录 console error）。
- 结论：纯 Chrome 打开该 URL 得到的是**空白页**（连启动骨架都不渲染），不可能产生 CLS 0.58 / INP 736ms。
  该组数字若真实存在，只能来自 preload 在场的环境（Electron 窗口内 DevTools/Lighthouse 经 CDP 附着），
  或来自其他页面/工具。**本轮未能复现该组数字**：真实应用全部已测场景 CLS 为 0.001–0.101。

## 当前结论

### 一、CLS 0.58 不成立于真实应用，不作为修复目标

真实应用实测 CLS 0.001–0.101（Good / 临界），且视觉最大项（头部条替换、侧栏波次）均 <0.1。
纯 Chrome 测量面为空白页，亦不可能产出 0.58。既往"会话恢复 tail→canonical→deferred 三连替换
可能造成单屏 ~0.6 位移"的假设被场景 4 实测**证伪**（CLS 0.003）：`Virtuoso` + `firstItemIndex` +
atBottom 锚定吸收了历史插入。真实存在、值得顺手修复的 CLS 小源见下方优先级 P4；在用户给出 0.58 的
确切测量工具、URL、视口与操作序列之前，不按 0.58 制定验收标准。

### 二、真实瓶颈在响应性（INP/长任务）与 LCP，且遍布核心链路

1. **会话切换**：点击即被 400ms 交互占用（场景 2），与既往 `docs/desktop/preformance/session-switch-observability-2026-08-20.md`
   记录的 246–592ms 水合长任务一致。这是用户日常最高频交互之一，INP 处于 Poor 档。
2. **大会话启动恢复**：前 22 秒 15 个 50–587ms 长任务（场景 4），LCP 21.9s。期间任何点击都得到
   Poor 级 INP。历史读数与投影成本随会话体积线性恶化。
3. **启动首屏**：首页 LCP 5.58s（场景 1），8 个 50–297ms 长任务；与既往新会话首发文档记录的
   路由首帧 ~205ms、初始化期 long task 一致。
4. **输入路径健康**（场景 3），与代码调研结论一致：普通打字不触发 React 重渲染（`ValueBridgePlugin`
   走 store），INP 不必从输入框找。

### 三、INP 高危路径（代码映射，含既往未记录项）

| 交互 | 同步工作在输入任务内的位置 | 代码锚点 |
|---|---|---|
| 长会话滚动/甩动 | 进入视口的占位行同步物化 + `chatMessagesAtom` 整表换引用 + 行高 40px→真实值触发 Virtuoso 重测 | `domains/conversation/components/message-list/MessageListView.tsx:146-156` → `services/transcript-window-controller.ts:47-55` → `services/transcript-window.ts:229` |
| 滚动到顶翻页 | commitWindowedProjection 整窗重投影 + 前置插入重测 | `MessageListView.tsx:157-159` → `transcript-window-controller.ts:170` |
| 流式期间打字/点击 | 每 100ms `flushDeltas` 替换消息数组 → ChatView 整树 commit；尾块 markdown 无节流重解析 | `hooks/useSessionEventController.ts:87-89,162`；`packages/theme-ui/src/markdown/MarkdownContent.tsx:180`、`streaming.ts:178` |
| 工具调用卡片首开 | 同步挂载整棵子树；diff 全量逐行解析；整文件 `<pre>` 不截断不虚拟化 | `packages/theme-ui/src/shared/CollapsePanel.tsx`；`shared/parse-diff.ts`；`packages/theme-ui/src/chat/TextPreview.tsx:16-19,32` |
| 会话切换 | 同步 teardown + 预览历史 set + canonical 整窗转换；多层宽订阅提交 | `hooks/useSessionOpener.ts:288-315,348-365,705-760`；`root-layout/useRootLayoutModel.ts:59` |
| 编辑重发 | 整窗重投影 + 对每条 entry JSON.stringify 量 footprint + 整表替换 | `hooks/useSessionMessageSender.ts:282-334` |
| @ 面板按键 | 每键对全仓文件列表 fuzzy 评分 + 全量排序 | `hooks/useAtPanelModel.ts:209-228` |

### 四、启动/替换期 CLS 小源（真实但已 Good，属观感与稳定性）

- 路由骨架（6x h-32 卡片）与真实页高度/结构不符：`root-layout/RootLayoutView.tsx:28-34` +
  `packages/theme-ui/src/app/RouteContentLoadingView.tsx:5-18`；
- PageHeader 左/右槽位在 `useEffect` 中后注入，标题与窗口控件下一帧横移；侧栏触发器是 width 0→28
  的 layout 动画属性：`domains/conversation/components/ChatView.tsx:62-70`、
  `new-session/NewSessionPage.tsx:46-49`、`packages/theme-ui/src/app-shell/PageHeaderContent.tsx:31-67`；
- 侧栏项目/会话列表三波异步回填推动下方区域：`domains/project/hooks/useProjects.ts:202-249`、
  `packages/theme-ui/src/project/ProjectsPanelView.tsx:47-48`、`DefaultSessionListView.tsx:63`；
- 滚动条 8px 占位导致列表首次可滚动时内容宽度收窄：`styles.css:434-472`（建议 `scrollbar-gutter: stable`）；
- 启动骨架侧栏硬编码 220px 与真实 `sidebarWidthAtom`（min 180）不符：`AppBootLoadingView.tsx:6-30`。

### 五、已排除项（证据互证）

- 字体：全系统字体栈、零 webfont、零 `@font-face`（`styles.css:74-77`；`@fontsource-variable/geist`
  为死依赖 `apps/desktop/package.json:139`）——无字体 swap 型 CLS；
- i18n（同步初始化 `shared/i18n/index.ts:28-47`）、主题（挂载前同步应用 `main.tsx:18-21`）、
  侧栏宽度/窄屏判定（localStorage 同步初始化）——无挂载后翻转；
- Shiki（异步 + 预算 + 门控 + 缓存）、滚动模型（ref-only）、Slash 面板——非同步长任务源；
- 会话恢复整屏位移（场景 4 实测证伪）。

## 被否决的方案

| 方案 | 否决原因 |
|---|---|
| 直接按 CLS 0.58 立项修复 | 真实应用全部场景 0.001–0.101，0.58 来源未定（纯 Chrome 为空白页）；按不存在的回归定验收标准会误导实现 |
| 用纯 Chrome/Lighthouse 直开 dev URL 作为桌面测量基线 | 无 preload 必为空白页，测不到产品行为；桌面测量必须经 CDP 附着 Electron 窗口 |
| 在启动骨架/主题/i18n 投入优化 | 三者均已被代码与实测排除，收益≈0 |
| 以"会话恢复整屏位移"为 P1 CLS 修复 | 场景 4 证伪（0.003）；修复应转向长任务拆分 |

## 代码/测试/指标锚点

- 测量入口（可复用）：`bun run verify:ui:status:dev` → `verify:ui:pw:dev -- run-code --filename=<probe.js>`；
  探针要点：`PerformanceObserver` 四项均 `buffered:true` + `addInitScript` 保证 reload 前安装；
  event timing 用 `interactionId` 聚合单次交互的最差值。
- 仓库现成性能插桩（本轮未全用，建议后续修复复测时启用）：
  `shared/lib/perf-send.tsx`（`localStorage["vetta-perf-send"]`）、
  `shared/lib/perf-session-switch.ts`（`vetta-perf-session-switch`）、
  `shared/lib/perf-message-scroll.ts`（`vetta-perf-message-scroll`，含 reactCommit/longTask/itemSizeCorrections）。
- 既往基线：`docs/desktop/preformance/new-session-first-send-2026-08-19.md`（首发乐观上屏 842→1.2ms，
  路由首帧 ~205ms）；`session-switch-observability-2026-08-20.md`（冷切换 4337.7→2297.7ms，
  遗留 553/469ms 长任务）。本轮场景 2/4 与之同族且确认仍存在。
- 修复优先级（实施阶段各自建 TASK，每项用同一探针做前后对比）：
  - **P1 会话切换/恢复水合长任务拆分**：transcript 物化分帧或空闲调度、避免整表换引用、收窄
    Root/ChatView 宽订阅（对齐既往文档"后续方向"第 1、2 条）；
  - **P2 启动 LCP 与首屏链路**：路由骨架保真、启动期长任务拆分（含 useAppInit 回填波次合并）；
  - **P3 流式期交互**：`flushDeltas` 提交节流与尾块 markdown 增量解析；
  - **P4 CLS 小修**：骨架高度保真、PageHeader 槽位预留（触发器改 transform）、`scrollbar-gutter: stable`、
    侧栏波次合并；
  - **P5 大内容卡片**：TextPreview/WriteContentView 截断或虚拟化、parseDiff 分帧。

## 失效条件与置信度

- **高置信**：纯 Chrome 空白页（静态代码链 + 复现）；输入路径健康；CLS 真实量级 0.001–0.101；
  会话切换/恢复长任务存在性与量级；已排除项。
- **中置信（dev 构建局限）**：LCP/长任务绝对值——dev bundle 未压缩、含 HMR 开销，生产显著更低；
  结构性结论（哪条链路、哪类同步工作）保留，绝对值只用于前后对比与归因，不作对外承诺。
- **低置信/未决**：0.58/736 的确切来源。需要用户提供测量工具（Lighthouse 版本/Lighthouse 面板/
  Performance 面板）、确切 URL、视口与操作序列才能定向复现。
- 样本为单机、单日、单实例；大会话测试用的 4.37MB 历史在用户数据目录内（仅读，未改）。

## 下一步触发信号

1. 用户给出 0.58/736 的确切测量条件 → 按相同条件复现后再判断是否立项；
2. 用户授权实施 → 按 P1–P5 建 Task（关联本 Research），每项以"同一探针前后对比 + 定向测试"为最低验证；
3. 若仅授权小步：建议先做 P1 中"避免整表换引用 + 去宽订阅"（改动局部、可测）、P4 的
   `scrollbar-gutter` 与骨架保真（低风险）；
4. 任何实施前按测试政策补 Given/When/Then 与回归测试（会话切换长任务、流式期交互两条优先）。
