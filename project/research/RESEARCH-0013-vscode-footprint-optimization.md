---
id: RESEARCH-0013
type: research
status: done
priority: P2
owner: apps/desktop
source: user-request；microsoft/vscode 源码（commit ab52f2c82c4677a5983435d7f706380eaac43c09，2026-09-24，许可证 MIT）
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: [TASK-0103, TASK-0104, TASK-0105, TASK-0106, TASK-0107, TASK-0108, TASK-0109]
related_issues: [ISSUE-0021]
related_bugs: []
depends_on: [RESEARCH-0003, RESEARCH-0011]
---
<!-- Copyright The Open Forge contributors. -->

# VS Code 内存足迹与发布体积优化机制源码取证

## 问题与范围

问题：`microsoft/vscode` 在**运行时内存足迹**与**安装/发布包体积**两个维度上有哪些已被源码证实的工程机制，其中哪些值得借鉴到 Open Forge（`apps/desktop` + `packages/*`）。

范围与约束：

- 事实源限定为 VS Code 仓库**当前 commit 的一手源码、构建脚本与仓库内注释/文档**，固定 `ab52f2c82c4677a5983435d7f706380eaac43c09`（`git clone --depth 1` 至 `C:\Users\xquan\AppData\Local\Temp\of-research\vscode`，`LICENSE.txt` 已核对为 MIT）。不使用二手博客做证据。
- 只读取证：不构建、不安装 VS Code；动态行为以代码路径为准。
- Open Forge 侧只做**存在性/入口级抽查**，不宣称完整现状审计；与 RESEARCH-0003（已完成的桌面内存路线图）和 RESEARCH-0011（Tauri 对照样本）已确认结论不重复展开，只标引用。
- 「已证实」= 源码路径行号完整；「假设/低置信度」= 仅结构推断或无直接量化；候选机制不存在时明确写「已证伪/不适用」。

## 事实来源

### VS Code（commit ab52f2c）

| 主题 | `path:line` 锚点 |
| --- | --- |
| Disposable 体系与泄漏检测 | `src/vs/base/common/lifecycle.ts:14-23`（`TRACK_DISPOSABLES` 默认关）、`:49-74`（`GCBasedDisposableTracker` 基于 `FinalizationRegistry`）、`:86-117`（`DisposableTracker` 用 `Map<IDisposable, DisposableInfo>` 记构造栈）、`:229-277`（`setDisposableTracker`/`trackDisposable`/`markAsDisposed`）、`:416`（`DisposableStore`）、`:757`（`DisposableMap`，`deleteAndDispose` 在 :821） |
| 延迟实例化原语 | `src/vs/base/common/async.ts:1531`（`runWhenGlobalIdle`）、`:1591-1643`（`AbstractIdleValue`/`GlobalIdleValue`：getter 首次访问时立即执行，否则在 idle 回调里执行）；`src/vs/base/common/lazy.ts:12`（`Lazy`）；`src/vs/base/common/map.ts:227`（`LinkedMap`）、`:681`（`LRUCache`） |
| DI 服务延迟实例化 | `src/vs/platform/instantiation/common/extensions.ts:16-29`（`InstantiationType.Eager/Delayed` 注册入口）；`instantiationService.ts:292-333`（`Delayed` 服务注入为 Proxy + `GlobalIdleValue`，真正实例在 idle 或首次方法调用时创建，`:313-328` 早期事件订阅经 `earlyListeners` 转接）；示例 `src/vs/workbench/services/textmodelResolver/common/textModelResolverService.ts:279` |
| Workbench contribution 分阶段 | `src/vs/workbench/common/contributions.ts:31-61`（`WorkbenchPhase`：BlockStartup/BlockRestore/AfterRestored/Eventually）、`:64-85`（`lazy` 与 `editorTypeId` 两种按需实例化）、`:283-294`（阶段到达后触发）、`:296-337`（前两阶段同步阻塞，后两阶段 idle 调度）、`:340-367`（`runWhenGlobalIdle` 时间片用尽续调度，`forcedTimeout` 500ms/3000ms）、`:145-146` + `:397-412`（20ms/100ms 实例化耗时告警阈值） |
| piece-tree 文本缓冲 | `src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.ts`（`PieceTreeTextBuffer` 持有 `PieceTreeBase`，构造接收 `StringBuffer[]` 分块，读路径走 piece tree 而非整串拷贝）；同目录 `pieceTreeBase.ts`、`pieceTreeTextBufferBuilder.ts` |
| 大文件硬闸 | `src/vs/editor/common/model/textModel.ts:188-191`（`_MODEL_SYNC_LIMIT=50MB`、`LARGE_FILE_SIZE_THRESHOLD=20MB`、`LARGE_FILE_LINE_COUNT_THRESHOLD=300k` 行、`LARGE_FILE_HEAP_OPERATION_THRESHOLD=256MB`）、`:338-368`（模型创建时一次性判定，之后不重开 tokenization）、`:633-642`（`isTooLargeForSyncing/Tokenization/HeapOperation`） |
| 列表/树虚拟化 | `src/vs/base/browser/ui/list/listView.ts:298-316`（`ListView` = `RangeMap` 高度索引 + `RowCache` 模板池 + 只渲染可视区）；`src/vs/base/browser/ui/list/rowCache.ts:16`；`src/vs/base/browser/ui/tree/`（`abstractTree.ts`、`asyncDataTree.ts` 构建于其上） |
| 进程拆分 | `src/vs/platform/sharedProcess/electron-main/sharedProcess.ts`（shared process 经 `UtilityProcess` 起 `vs/code/electron-utility/sharedProcess/sharedProcessMain`，带 crash 监听）；`src/vs/platform/files/node/watcher/watcherClient.ts:25-46`（文件 watcher 独立子进程 `--type=fileWatcher`，入口 `watcherMain`，崩溃经 `onDidProcessExit` 回报而非拖垮主进程）；`src/vs/platform/terminal/node/nodePtyHostStarter.ts:22-55`（ptyHost 独立 fork，`VSCODE_RECONNECT_*` env 支持 ptyHost 崩溃后终端重连） |
| Extension host | `src/vs/workbench/services/extensions/common/abstractExtensionService.ts:842-870`（`ExtensionHostStartup.LazyAutoStart` → `LazyCreateExtensionHostManager` 按需建）、`:850-860`（exit 与 responsive state 监听）、`:872-933`（崩溃处理；remote host 5 分钟内 3 次失败后停止自动重启并提示）；`src/vs/workbench/services/extensions/common/rpcProtocol.ts`（`ResponsiveState`、`RPCProtocol.UNRESPONSIVE_TIME`）；`src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts:247-285`（fork 参数；**无** `--max-old-space-size` 堆上限） |
| 窗口错误处理 | `src/vs/platform/windows/electron-main/windowImpl.ts:892-894`（`unresponsive`/`render-process-gone` 监听）、`:816-827`（`--unresponsive-sample-interval`/`--unresponsive-sample-period` 默认 1s/15s）、`:975-1094`（`onWindowError`：记日志+遥测，然后弹 Reopen/Close/Keep Waiting 对话框——**渲染进程崩溃不自动重载**）、`:1046-1052` + `:1743-1744`（unresponsive 时用 `webContents.mainFrame.collectJavaScriptCallStack()` 采样 JS 栈） |
| 窗口 webPreferences | `src/vs/platform/windows/electron-main/windows.ts:152-165`（`sandbox:true`、`spellcheck:false`、`autoplayPolicy:'user-gesture-required'`）；`windowImpl.ts:783-787`（`v8CacheOptions` 按 `useCodeCache` 取 `bypassHeatCheck`/`none`）、`:789-790`（sessions 窗口 `backgroundThrottling:false`，刻意为之，非通用省电姿势） |
| Code cache | `src/main.ts:221-247`（启动并行建 cache dir + 解析 NLS，设 `VSCODE_CODE_CACHE_PATH`）、`:648-667`（`--no-cached-data` 或 dev 或缺 product commit 时禁用；路径 `userDataPath/CachedData/<commit>`，按 commit 隔离失效）；`src/vs/code/electron-main/app.ts:519-524`（`session.setCodeCachePath(join(codeCachePath,'chrome'))`）；`environmentMainService.ts:70-73`（`codeCachePath`/`useCodeCache` getter） |
| Watcher 排除 | `src/vs/workbench/contrib/files/browser/files.contribution.ts:294-310`（`files.watcherExclude` 默认排除 `.git/objects/**`、`.git/subtree-cache/**`、`.hg/store/**` 及嵌套仓库对应路径；注释警告别用 `**`，大 workspace 下复杂正则显著变慢）、`:312-319`（`files.watcherInclude` 默认空）；`src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts:159`（后端按平台选 `windows`/`inotify`/`fs-events`）、`:397-410`（`addPredefinedExcludes` 合并平台预定义排除）、`:364-384`（`parcelWatcher.subscribe`） |
| 性能与内存诊断 | `src/vs/base/common/performance.ts:17-149`（`perf.mark`/`getMarks`/`clearMarks`）；`src/main.ts:176-213`（`--trace`、`--trace-memory-infra` 接 Chromium memory-infra 分类与周期 dump）；`src/vs/platform/environment/common/argv.ts:61-66` + `node/argv.ts:142-148`（`--prof-startup`、`--prof-append-timers`、`--prof-duration-markers(-file)`、`--prof-v8-extensions`）；`src/vs/base/node/profiling.ts`（启动 CPU profile）；`src/vs/platform/profiling/`（`electron-main/windowProfiling.ts`、`electron-browser/profileAnalysisWorkerMain` 等，profiling 分析跑在独立 worker）；`src/vs/platform/diagnostics/node/diagnosticsService.ts`（进程树 + 每进程内存采样）；`src/vs/workbench/services/timer/electron-browser/timerService.ts:90-91`（`--prof-append-timers` 触发 perf marks 上报）；`src/vs/workbench/contrib/extensions/electron-browser/extensionProfileService.ts` + `runtimeExtensionsEditor.ts`（扩展级 CPU 画像 UI） |
| 生产构建管线 | `build/next/index.ts:41-62`（CLI：`bundle --minify --nls --mangle-privates --target desktop|server|server-web|web`）、`:74-118`（每目标 entry point 清单：desktop 含 workbench/sessions/ptyHostMain/watcherMain/extensionHostProcess/agentHost 等）、`:480-518`（esbuild `platform:'neutral'` 打包各 entry）、`:521-541`（bootstrap entry 用 `platform:'node'`）、`:543-553`（`finalizeNLS`）、`:583-591`（私有字段改写，**跳过 extension host bundle**）、`:594-601`（NLS 后处理）、`:603-604`（sourcemap URL 改写 CDN）、`:639-660`（后处理产物语法校验）、`:675-679`（按目标精选 resources + standalone 文件） |
| Bundle 选项与私有名改写 | `build/next/bundle.ts:10-34`（`getBundleOptions`：`bundle:true, format:'esm', target:['es2024'], minify, treeShaking:true, packages:'external'`）；`build/next/private-to-property.ts:10-14`（注释明言目的双重的：原生 `#field` 在 V8 更慢 + 短名 `$a/$b` 缩体积；AST 单遍改写无需 typechecker） |
| NLS 外置 | `build/next/nls-plugin.ts:115-148`（产物 `nls.messages.json`/`nls.keys.json`/`nls.metadata.json`/`nls.messages.js`——后者把 `globalThis._VSCODE_NLS_MESSAGES` 写入全局）、`:174-199`（构建期把 `localize()`/`localize2()` 调用替换为索引占位）；`src/main.ts:153,236,733`（`resolveNLSConfiguration` + `VSCODE_NLS_CONFIG` env + 兜底 `nls.messages.json`） |
| 打包任务 | `build/gulpfile.vscode.ts:61-64`（`sourceMappingURLBase` CDN，CI 构建剥 `*.map`）、`:66-82`（`core-ci` 并行产出 `out-vscode-min`/`out-vscode-reh-min`/`out-vscode-reh-web-min`）、`:142-153`（preload/workbench/extensionHostProcess 等文件 sha256 写入 product.json `checksums`）、`:159-166`（`product.builtInExtensions[].platforms` 按目标平台排除）、`:170-174`（CI 剥 sourcemap）、`:199-224`（product.json 盖 `commit`/`nlsMetadataHash`/`checksums`/agentSdks/dictationRuntime）、`:240-251`（`getProductionDependencies` + 剥 `{test,tests}`/`*.mk`/lock 文件 + `.moduleignore` 与 `.moduleignore.<platform>` 两级清洗）、`:252-262`（copilot/osProxyResolver/ripgrep/mxc/foundry-local 按 platform/arch 过滤）、`:266-300`（`createAsar` 产出 `node_modules.asar`；unpack 清单含 `*.node`、ripgrep bin、node-pty worker、`*.wasm`；`@vscode/sandbox-runtime` 等因独立 spawn 保留在 asar 外）、`:361-372`（按 platform/arch 下载 Electron，`ffmpegChromium:false`）、`:373-379`（剥 Electron `LICENSE`/`version`/`electron_proxy.exe`） |
| 生产依赖闭包与 moduleignore | `build/lib/dependencies.ts:12-40`（`npm ls --all --omit=dev --parseable` 求生产闭包）；`build/.moduleignore`（gitignore 风格：剥 `binding.gyp`/`src/`/`test/`/`deps/`/`*.yml`，保留 `build/Release/*.node`）；`build/.moduleignore.{darwin,linux,win32}`（例：linux 变体剥 `@vscode/windows-*` 包） |
| 原生二进制按 arch 裁剪 | `build/lib/copilot.ts:68-73,160-168`（`@vscode/ripgrep-universal` 只保留目标 platform-arch 的 bin 目录）；`gulpfile.vscode.ts:126-132`（foundry-local 原生负载整个不打包，运行时按需下载到 per-user cache） |
| 内置扩展 | `build/gulpfile.extensions.ts:267-301`（marketplace 下载 + 本地 extensions 打包到 `.build/extensions`）；`build/lib/extensions.ts:33-48`（`minifyExtensionResources`：JSON/`.code-snippets` 去空白与注释）、`:100-110`（已 bundle 扩展的 package.json 删 `scripts`/`dependencies`/`devDependencies`，`main` 指到 `/dist/`）、`:128-148`（非 bundle 扩展用 `vsce.listFiles` 尊重 `.vscodeignore`）、`:313-326`（`nativeExtensions`/`excludedExtensions` 清单：测试与 copilot 源不随包）、`:328-334`（`marketplaceWebExtensionsExclude`）、`:352-374`（`isWebExtension` 判定）；`product.json:40+`（`builtInExtensions` 带 `version`+`sha256` 固定）、`:244`（`builtInExtensionsEnabledWithAutoUpdates`） |
| 安装器/压缩 | `build/win32/code.iss:19-20`（Inno `Compression=lzma`、`SolidCompression=yes`）；`build/gulpfile.vscode.linux.ts:131`（`dpkg-deb -Zxz`）、`:229`（`rpmbuild -bb`） |
| macOS universal 合并 | `build/darwin/create-universal-app.ts:9`（`vscode-universal-bundler` `makeUniversalApp`）、`:53-90`（先把各 arch 独有的 `copilot-*`/`os-proxy-resolver-*`/`ripgrep-universal/bin/*`/`mxc-sdk` 目录在两个单 arch 包间互相补齐再合并——因为单 arch 包已按目标裁剪） |
| Server/web 独立产物 | `build/gulpfile.reh.ts:129-135`（reh server 的 Node.js 按 platform 从 feed/nodejs.org 下载）、`:287,338`（`reh-web`/`reh` 两类目标）、`:534-535`（target 映射 server/server-web）；`remote/` 独立 package；`cli/` 为 Rust CLI（独立 `Cargo.toml` 工程），均不进桌面安装包 |

### Open Forge 现场抽查

- 构建/打包：`apps/desktop/vite.config.ts:93-113`（构建期注入 `VETTA_CLOUD_ENABLED` 等 feature flag，注释明言 cloud 分支常量折叠、动态 import chunk 可整体裁掉）、`:138-150`（renderer 五入口：main/pet/quickpanel/onboarding/remote-desktop-host）、`:141`（生产 sourcemap 默认关，Sentry 用 hidden）、`:157-161`（dev-only warmup）；`apps/desktop/vite.main.config.ts:36-40`（development workspace 包仅 dev 引入）、`:43-64`（同一 cloud 开关作用于 main）、`:92-124`（main 多 entry：index/uiohook-worker/session-search-worker/可选 speech-input-host；native+runtime deps external；**`minify:false`**）。
- staging/依赖：`apps/desktop/scripts/prepare-pack.js:171-195`（externalized deps 按**目标产物平台**而非构建主机选）、`:204-214`（`stageDepTree` 递归复制 production 闭包——**整目录 `cpSync`，无 test/docs/maps 清洗**）、`:237-250`（`assertTerminalPtyBinaryStaged`：目标 arch 的 pty 二进制缺失即构建失败）、`:252-271`（`assertPackagedMainHasNoWorkspaceImports`：禁止 `@vetta/` workspace import 漏进产物）、`:290-301`（staging `package.json` 只声明 external runtime deps）、`:844-862`（`asar:true` + `asarUnpack` 只放 OCR runner 与 native 包，注释解释 app.asar 内压缩、native dlopen 与 Inno LZMA2 的关系）、`:749`（`electronLanguages:["zh-CN","en-US"]` 裁剪 Electron locale pak）；`apps/desktop/scripts/build-resource-filters.mjs`（`build/` 图标按 platform family 过滤）；`apps/desktop/scripts/desktop-packaging-layout.mjs:14-20`（`DESKTOP_BUILD_OUTPUTS` staging 布局）。
- 安装器：`apps/desktop/build/installer.iss:27-28`（`Compression=lzma2/max`、`SolidCompression=no`——为 blockmap 复用刻意放弃 solid）、`:60-65`（`app.asar` 作为既有 archive 不做外层压缩，未变 chunk 可被增量更新复用）。
- 进程/窗口：`apps/desktop/src/main/window-manager.ts:55-80`（`contextIsolation:true`、`nodeIntegration:false`、`webviewTag:true`；`show:false` 起窗；macOS 注释解释不开 `transparent` 是省 GPU 合成）、`:140-145`（`unresponsive`/`responsive` 仅记日志）；`src/main/diagnostics.ts:212-221`（`render-process-gone`/`child-process-gone` 记日志）；`src/main/ipc/session.ts:1684,1718`（renderer gone 时清订阅）、`:563`（注释：gone 与 reload 间隙靠 snapshot sync 恢复——**无自动 reload**）；`src/main/main.ts:163-165`（GUI 模式 `--js-flags --max-old-space-size=4096` 护栏）、`:222-224`（CLI 模式 `disable-gpu`/`disable-gpu-shader-disk-cache`/`disk-cache-size=0`）。
- Worker/utility：`src/main/conversations/session-search-worker-client.ts:17`（`Worker` + `resourceLimits.maxOldGenerationSizeMb:512`）；`src/main/speech-input/speech-input-service.ts`（`utilityProcess.fork`）；`src/main/uiohook-worker.ts`、`src/main/quickpanel-trigger.ts`（`Worker`）；`src/main/im-host/sidecar-manager.ts`（Go sidecar）。
- Watcher：`src/main/ipc/fs.ts:328`（`watchers` Map 引用计数共享 `fs.watch`）、`:338-382`（多消费者复用、300ms debounce 广播）、`:384-407`（最后一个释放者才关）、`:636-638`（shutdown 全关）；renderer 侧 `src/renderer/domains/file-explorer/hooks/useFileTree.ts:226-257`（**只 watch 展开目录 + root**，卸载即 unwatch）——无递归 watcher，无 `.git/objects` 类默认排除（但按需 watch 使该缺口暴露面小）。
- Renderer 延迟：`src/renderer/router.tsx`（全部路由页 `React.lazy` 动态 import）；`domains/conversation/hooks/useDeferredMessageEnhancements.ts:37-50`（`requestIdleCallback` + 双 rAF 延迟派生工作）。
- i18n：`src/shared/i18n/resources.ts`（`en/*` 与 `zh/*` 全部 locale JSON **静态 import** 进 bundle，无按语言外置/懒加载）。
- 监控：`src/main/app-monitor/perf-monitor-service.ts`（`app.getAppMetrics()` 每进程 `workingSetKb`/`privateKb` + `process.memoryUsage()`，旁路采样）。
- 文本模型：无 piece-tree 等价物；会话历史以 `chatMessagesAtom`（`chat-atoms.ts:222`）全量驻留，窗口化缺口已在 RESEARCH-0003 B-1 定论。

## 当前结论

### 内存机制（M 系列）

**M1. 统一 Disposable 所有权 + 可选泄漏检测：已证实。** 全部资源走 `IDisposable`/`DisposableStore`/`DisposableMap`/`MutableDisposable` 层级（`lifecycle.ts`）；`TRACK_DISPOSABLES` 默认关（`:14-23`），调试时可 `setDisposableTracker` 切到 `DisposableTracker`（记构造栈）或 `GCBasedDisposableTracker`（`FinalizationRegistry` 观察未 dispose 即 GC 的对象）。这是**防长期驻留泄漏**的机制，不直接降启动 RSS。Open Forge 现状：各模块有零散 cleanup（watchers 引用计数、worker terminate、原子 store），但没有统一的 dispose 所有权模型与泄漏诊断开关。借鉴价值：P2——适合在 `apps/desktop` 主进程侧引入轻量 `Disposable` 约定与 dev-only 泄漏 tracker，作为既有清理逻辑的兜底而不是重写。

**M2. DI 服务按 `Delayed` 注入、idle/首触实例化：已证实。** `registerSingleton(..., InstantiationType.Delayed)` 让服务以 Proxy 注入，真实实例由 `GlobalIdleValue` 在 idle 回调或首次方法调用时创建（`instantiationService.ts:308-333`），事件订阅经 `earlyListeners` 转接不漏事件。Open Forge 主进程无等价 DI 容器，服务在 `main.ts` 启动序列里直接构建（managed runtime/sandbox 已延迟到首帧后 500ms，见 RESEARCH-0003 A 表尾注）。借鉴价值：P1 候选——把「启动阻塞项」改成「idle/首触代理」是主进程启动内存与首帧延迟的结构性收益，但需先确认哪些服务值得延迟（量产后才值得抽象）。

**M3. Workbench contribution 四阶段 + idle 时间片 + 耗时告警：已证实。** BlockStartup/BlockRestore 同步实例化；AfterRestored/Eventually 走 `runWhenGlobalIdle`，`idle.timeRemaining()<1` 即让出续跑，`forcedTimeout` 500ms/3000ms 保底（`contributions.ts:340-367`）；单 contribution 超 20ms（restore 前）/100ms（restore 后）记 warn（`:397-412`）；另有 `lazy` 与 `editorTypeId` 按需实例化形态（`:64-85`）。Open Forge 已有路由级 `React.lazy` + `requestIdleCallback` 延迟派生（两处局部机制），但没有统一的「phase + idle 预算 + 耗时遥测」治理层。借鉴价值：P1——把主进程 domain 初始化与 renderer 非首屏工作收进同一 phase/idle 框架，直接服务于启动峰值与驻留控制。

**M4. piece-tree 文本缓冲：已证实存在，对 Open Forge 暂不适用。** `PieceTreeTextBuffer` 用 `StringBuffer[]` 分块 + piece tree 支持大文本增量编辑（`pieceTreeTextBuffer.ts`）。Open Forge 的会话历史是 JSONL 记录 + 投影对象，不是可编辑文本模型；RESEARCH-0003 已判定最大热点是 transcript 全量驻留（窗口化而非缓冲结构问题）。借鉴价值：当前不移植；若未来引入长文档 artifact 编辑/大文件预览内编辑再评估（先 benchmark 再动）。

**M5. 大文件硬闸（按尺寸降级功能）：已证实。** 模型创建时按 20MB/300k 行/256MB 阈值一次性判定关闭 tokenization、禁大 heap 操作、禁跨进程同步（`textModel.ts:188-191,338-368,633-642`），且**不可逆**（之后不会因内容缩小而重开 tokenization）。Open Forge 有工具结果大小策略（50KB 内联/artifact 化，见 RESEARCH-0003 A 表）但没有「对象级尺寸 → 功能降级」开关。借鉴价值：P1——可用于长 transcript 渲染、大 artifact 预览、文本文件编辑器：超阈值时关语法高亮/搜索索引/全量 hydration，而不是只做截断。

**M6. 进程拆分 + 独立故障域：已证实。** shared process（`UtilityProcess`）、file watcher 独立子进程（`watcherClient.ts:25-46`，崩溃只回 `onError`）、ptyHost 独立 fork 且支持跨重启的终端重连（`nodePtyHostStarter.ts:30-32` `VSCODE_RECONNECT_*`）、extension host 按需启动+unresponsive 检测（`abstractExtensionService.ts:842-870` + `rpcProtocol.ts` `ResponsiveState`）；重启策略按 host 类型分流——**remote** host 走 `_remoteCrashTracker` 自动重启且 5 分钟 3 次封顶后转为手动提示（`:911-933`），**本地** host 崩溃则停止并通知而非静默重启（`:884-894`）。**关键细节：进程变多是拿内存换隔离与生命周期自治**——watcher 崩溃不拖垮 UI，ptyHost 重启不掉终端。Open Forge 已有 utilityProcess（speech-input）、worker（session-search 带 512MB 上限、uiohook、quickpanel）、Go sidecar，缺口在**统一的健康/重启/记账约定**：每个后台进程的 crash 处理、重试上限、内存归因是各自实现的。借鉴价值：P1——先统一 process role 记账（挂进既有 PerfMonitor）与 bounded restart 契约，再谈新拆进程。

**M7. watcher 排除默认值 + 原生后端：已证实。** `files.watcherExclude` 默认排除 `.git/objects/**` 等高热目录并警告别滥用 `**`（`files.contribution.ts:294-310`）；`@parcel/watcher` 按平台选 `windows`/`inotify`/`fs-events` 后端（`parcelWatcher.ts:159`）并合并平台预定义排除（`:397-410`）。Open Forge 的文件树 watcher 已是按需模式（只 watch 展开目录，引用计数共享 `fs.watch`，300ms debounce）——节流语义不同但更保守；**没有**高热目录排除默认值。借鉴价值：P2——若未来上递归 watch 或工作区级索引，先落 `.git/objects`/`node_modules`/`dist`/`target` 默认排除清单；当前按需模式下暴露面有限。

**M8. 诊断与遥测是一等功能面：已证实。** `--prof-*`/`--trace*` CLI 族（`argv.ts:61-66,142-148`）、`perf.mark` 贯穿启动路径（`workbench.ts:83,338-340,421`）、Chromium `memory-infra` trace 开关（`main.ts:176-213`）、unresponsive 时 `collectJavaScriptCallStack()` 采样（`windowImpl.ts:1046-1052,1743-1744`）、`diagnosticsService` 进程树内存清单、扩展级 CPU 画像 UI（`extensionProfileService.ts`）。Open Forge 的 `PerfMonitorService` 已有同向采样（`getAppMetrics()` + `memoryUsage()`），且 renderer gone/unresponsive 有日志。借鉴价值：P1——差的是**归因维度**（按窗口/会话/进程 role 打标）与 unresponsive 栈采样；两者都可挂在现有 app-monitor 旁路上，不阻塞业务。

**M9. Code cache 按 commit 分区：已证实，但归类为启动优化。** `VSCODE_CODE_CACHE_PATH` → `session.setCodeCachePath(<commit>/chrome)` + `v8CacheOptions:'bypassHeatCheck'`（`main.ts:648-667`、`app.ts:519-524`、`windowImpl.ts:783-787`）。收益是启动/解析 CPU 与首屏，**不是 steady-state RSS**。Open Forge 无等价物。借鉴价值：P2——若首屏 JS 解析在 profile 中显眼再上；直接收益是启动时间不是内存。

### 体积机制（S 系列）

**S1. 生产依赖闭包 + `.moduleignore` 两级清洗：已证实。** `npm ls --omit=dev` 求闭包（`dependencies.ts:12-40`），再剥 `{test,tests}`/`*.mk`/lock 文件（`gulpfile.vscode.ts:241-243`），再过 `.moduleignore`（剥 native 包的 `binding.gyp`/`src/`/`test/`/`deps/`、保留 `build/Release/*.node`）与 `.moduleignore.<platform>`（剥别平台的 `@vscode/windows-*` 等）。Open Forge 的 `stageDepTree` 是整目录 `cpSync`（`prepare-pack.js:204-214`），**无同等的清洗层**——external dep 的 README/test/source 会进包。借鉴价值：P1——加一个 gitignore 风格的 staged-node_modules 清洗清单（剥 test/docs/maps/构建残留、保留 `*.node`/`prebuilds`），改动面小收益直接。

**S2. 单 pass esbuild bundle + minify + tree-shaking + 私有名改写：已证实。** `getBundleOptions`（`bundle.ts:10-34`）一把梭：bundle+minify+treeShaking+ESM+`packages:'external'`；`private-to-property.ts` 把 `#field` 改写成 `$a` 短名（注释 `:10-14` 明说兼为 V8 性能与体积），且**跳过 extension host bundle**（`index.ts:583-591`，注释：API 面暴露给扩展，封装性优先于收益）；后处理产物过 `esbuild.transform` 语法校验（`:639-660`）。Open Forge：renderer 走 Vite 默认 minify；**main bundle 显式 `minify:false`**（`vite.main.config.ts:92-124`）。借鉴价值：P1 评估项——先量化 main/preload bundle 的 minify 收益（含 sourcemap 策略），私有名改写是更激进的选项（Open Forge TS 代码 `#field` 用得少，收益需实测）。

**S3. NLS 外置：已证实。** 构建期 `localize()` 调用被替换为索引，字符串全部进 `nls.messages.js`/`nls.messages.json`/`nls.metadata.json`（`nls-plugin.ts:115-148,174-199`），运行时经 `VSCODE_NLS_CONFIG` 注入（`main.ts:236`），语言包作为独立扩展不随安装包。Open Forge：`resources.ts` 把 en+zh 全部 locale JSON 静态打进每个 renderer bundle。借鉴价值：P2——i18next 支持 backend 懒加载（按 namespace+语言按需取），可作为体积与启动内存的双收益项；离线单语言包是产品决策需用户裁决。

**S4. 按 platform/arch 裁剪原生负载：已证实。** ripgrep 只留目标 arch（`copilot.ts:160-168`）、copilot/osProxyResolver/mxc 按目标过滤、foundry-local 干脆不打包改运行时按需下载（`gulpfile.vscode.ts:126-132,252-262`）、`.moduleignore.<platform>` 剥异平台包。Open Forge 已有同方向机制（`packaged-native-dependencies` 按目标平台选、sandbox 资源按 family、pty 目标 arch 断言）。借鉴价值：已具备——补的是「包内容断言」：发版前脚本断言产物内不存在异平台二进制（VS Code 的 `assertTerminalPtyBinaryStaged` 对应物我们已有，可推广）。

**S5. `node_modules.asar` + 选择性 unpack + 部分包留 asar 外：已证实。** 依赖进 `node_modules.asar`，unpack 清单覆盖 `*.node`/ripgrep/node-pty worker/`*.wasm`（`gulpfile.vscode.ts:266-300`）；需独立 spawn 的 `@vscode/sandbox-runtime` 等整棵留 asar 外（注释 `:292-299`）。注意：**app 代码 `out/` 本身不进 asar**，只有 node_modules 进——与 electron-builder 默认 `app.asar` 全包相反。Open Forge 已是 `asar:true`+`asarUnpack` 白名单（`prepare-pack.js:844-862`），方向一致但分层不同（我们整个 app 进 app.asar）。借鉴价值：低——现状可用；VS Code 的分层（app 代码松散 + deps asar）对增量更新粒度有利，可作长期参考而非立即改造。

**S6. 按目标 surface 拆产物：已证实。** 一次 `core-ci` 并行产出 desktop/server/server-web 三套 bundle（`gulpfile.vscode.ts:77-81`），entry point 清单按目标分（`index.ts:74-118`），reh server 的 Node 运行时按 platform 单独下载打包（`gulpfile.reh.ts:129-135`），Rust CLI 独立工程——桌面安装包不含 server/CLI。Open Forge 已有同构机制（renderer 五入口、main 多 worker entry、`VETTA_CLOUD_ENABLED` 常量折叠裁掉 cloud chunk、`.vettapkg` 插件独立产物）。借鉴价值：已具备——继续沿「可选能力不进默认包」的方向走（speech-input 已示范按需）。

**S7. 内置扩展按平台筛选 + 资源 minify + marketplace 下载钉死版本：已证实。** `builtInExtensions[].platforms` 排除（`gulpfile.vscode.ts:159-166`）、扩展 JSON/`.code-snippets` 去空白（`extensions.ts:33-48`）、已 bundle 扩展剥 package.json 的 scripts/deps（`:100-110`）、`vsce.listFiles` 尊重 `.vscodeignore`（`:128-148`）、marketplace 扩展 `version`+`sha256` 钉死（`product.json:40+`）。Open Forge `.vettapkg` 由 `plugin-vite` 构建成 zip、按租户/profile 选 preset 集（见 packages/plugins AGENTS）——结构已类似；差异在「逐包 JSON 资源 minify」与「下载钉死 sha256」两条。借鉴价值：P2。

**S8. 安装器层压缩与 sourcemap 外置：已证实。** Inno `lzma`+`SolidCompression=yes`（`code.iss:19-20`）、deb 走 `dpkg-deb -Zxz`（`gulpfile.vscode.linux.ts:131`）、CI 构建把 `*.map` 剥出产物并把 sourcemap URL 指到 CDN（`gulpfile.vscode.ts:61-64,170-174,264`）。Open Forge：`lzma2/max`+`SolidCompression=no`+`app.asar` 不二次压缩是**为 blockmap 增量更新刻意选择**（`installer.iss:27-28,60-65`）；sourcemap 生产默认关、Sentry 用 hidden。两者取舍不同但都有明确理由，不存在谁抄谁。借鉴价值：已具备——注意 VS Code 选 `SolidCompression=yes` 是因为其更新机制不依赖 Inno blockmap，不要反向抄成 solid。

### 优先级表

| 优先级 | 机制 | open-forge 目标模块 | 依据 |
| --- | --- | --- | --- |
| P1 | staged node_modules 清洗清单（`.moduleignore` 等价物） | `apps/desktop/scripts/prepare-pack.js`（`stageDepTree`） | S1：整目录 cpSync 现状 vs VS Code 两级清洗；改动小收益直接 |
| P1 | 「尺寸阈值 → 功能降级」硬闸 | `apps/desktop` renderer（transcript 投影、artifact 预览、文本文件编辑器） | M5：与 RESEARCH-0003 B-1 窗口化互补，先防最坏路径 |
| P1 | phase+idle 实例化治理（贡献/服务分层启动） | `apps/desktop` main 启动序列 + renderer 非首屏工作 | M2+M3：现有 `requestIdleCallback`/`React.lazy` 是局部解，缺统一相位与耗时遥测 |
| P1 | 后台进程统一健康/重启/记账契约 | `apps/desktop`（speech-input、session-search、uiohook、sidecar） | M6：进程边界已有，缺统一的 crash→restart 预算与 per-role 内存归因 |
| P1 | unresponsive 栈采样 + per-role 内存归因 | `apps/desktop/app-monitor`、`diagnostics.ts` | M8：VS Code `collectJavaScriptCallStack` 与 diagnosticsService 是直接可抄的形状 |
| P2 | Disposable 所有权约定 + dev 泄漏 tracker | `apps/desktop` 主进程长期持有资源处 | M1：防长尾泄漏；作为约定渐进落地，不搞全面重写 |
| P2 | watcher 高热目录默认排除 | `apps/desktop/src/main/ipc/fs.ts` | M7：当前按需 watch 暴露面小，上递归 watch 前必须补 |
| P2 | main bundle minify 评估（先 benchmark） | `apps/desktop/vite.main.config.ts` | S2：需先量化；若上，sourcemap 策略（hidden/CDN）参照 S8 |
| P2 | i18next namespace 懒加载 | `apps/desktop/src/shared/i18n` | S3：体积+启动内存双收益，但离线策略是产品决策 |
| P2 | 插件包 JSON 资源 minify + 内置集 sha256 钉死 | `packages/plugins/plugin-vite`、stage-system-plugins | S7：`.vettapkg` 体系已对齐，差的是压缩与完整性指纹 |
| P3 | Code cache 分区 | `apps/desktop` main | M9：启动优化非内存优化；等 profile 显示解析成本再上 |

## 被否决的方案

- **「renderer OOM 自动重启」假设：已证伪。** VS Code 对 `render-process-gone`/`unresponsive` 的处理是日志+遥测+**弹对话框让用户选** Reopen/Close/Keep Waiting（`windowImpl.ts:975-1094`），不是静默 reload。自动重启只存在于 extension host（有界：remote 5 分钟 3 次封顶，`abstractExtensionService.ts:911-933`）。Open Forge 的「记录+清订阅+等用户/snapshot 恢复」与 VS Code 同向，不需要改成自动重载。
- **`backgroundThrottling:false` 作为通用省资源姿势：证伪。** VS Code 只对 sessions 窗口关节流（`windowImpl.ts:789-790`）为的是让后台 agent 会话继续跑——是**费资源换响应**的取舍，不是内存优化，别抄反了。
- **给 extension host/utility process 统一堆上限：证伪为 VS Code 实践。** `localProcessExtensionHost.ts:247-285` 的 execArgv 里没有 `--max-old-space-size`；VS Code 靠进程隔离+重启预算而不是堆上限挡 OOM。Open Forge 的 `session-search-worker` 512MB 上限是自身选择（可用），但「全进程统一 4GB」（`main.ts:164` 现状）的校准属于 RESEARCH-0003 P1-6，与本研究结论一致。
- **把 app 代码打进 asar：不抄。** VS Code 刻意只把 `node_modules` 进 asar、`out/` 保持松散文件（`gulpfile.vscode.ts:266-300` vs `:155-157`），Open Forge 的 `app.asar` 全包+`asarUnpack` 白名单是 electron-builder 习惯路径，两者都自洽；没有证据表明需要翻转现有布局。
- **`SolidCompression=yes`：不抄。** VS Code 用 solid 是因为其更新不走 Inno blockmap；Open Forge `SolidCompression=no`+`app.asar` 不再压缩是为 blockmap 复用专门选的（`installer.iss:60-65` 注释），方向相反且各自正确。
- **`build/lib/mangle.ts` / `build/lib/optimize.ts` / `build/lib/bundle.ts` 候选路径：已迁移，原路径不存在。** 当前 commit 的生产管线在 `build/next/`（`index.ts`+`bundle.ts`+`private-to-property.ts`+`nls-plugin.ts`），由 `gulpfile.vscode.ts:78` 的 `runEsbuildBundle` 驱动；研究引用以 `build/next/*` 为准。
- **piece-tree 文本模型移植：暂缓（非否决机制本身）。** M4 已说明：Open Forge 的热点是 transcript 对象驻留而非文本缓冲结构，先窗口化。
- **server/web 独立产物、universal merge、deb/rpm：对当前 Open Forge 不适用或已具备。** 无 server/web 分发面（S6 后半）；无 macOS universal 诉求的现状证据；Linux 打包已由 electron-builder 覆盖。

## 代码/测试/指标锚点

- VS Code 侧全部锚点见「事实来源」表（固定 commit `ab52f2c82c4677a5983435d7f706380eaac43c09`）。
- Open Forge 抽查锚点见「Open Forge 现场抽查」清单。
- 可量化验证点（立项后先跑）：`prepare-pack.js` staged `node_modules` 的字节数与文件清单 diff（S1）；main bundle `minify:true/false` 产物大小与 `app.asar` 差（S2）；renderer 各 entry chunk 中 locale JSON 占比（S3）；长 transcript/大 artifact 在阈值降级前后的 `privateKb` 曲线（M5）；unresponsive 复现路径下 JS 栈采样的可用性（M8）。
- VS Code 官方 wiki（第一方）可作为补充背景：Electron sandboxing blog（`code.visualstudio.com/blogs/2022/11/28/vscode-sandbox`）与 text buffer reimplementation blog（`code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation`）——本研究的机制结论均以源码为准，这两篇只解释设计动机。

## 失效条件与置信度

- 行号锚定 `microsoft/vscode@ab52f2c8`（2026-09-24）。该仓迭代很快，`build/next/` 管线本身正处于从旧 `build/lib/optimize.ts`/`mangle.ts` 迁移后的形态，后续 commit 上行号漂移、甚至工具链再换（`build/vite`、`build/rspack` 目录已存在，属实验性 dev 工具）都可能，引用时以**函数/常量名**为准。
- 「已证实」= 机制与代码路径存在；**不等于**对 Open Forge 可省多少 MB——本研究无任何运行时实测数据，收益数字必须等 P0 基线（RESEARCH-0003 P0-1）。
- Open Forge 侧结论均为入口级抽查：证明机制存在或不存在，未做全量审计；「缺口」立项前需正式现状核查。
- 两处低置信度标注：① Electron `setCodeCachePath`/`v8CacheOptions` 在 Open Forge 当前 Electron 39 上的实际收益（M9，需 profile）；② VS Code 未随包发符号分离产物——CI 侧符号上传（`build/azure-pipelines`）超出本研究取证范围，「symbols 分离」按不适用处理而非已证实。
- 用户侧产品约束变化（离线单语言包、无外部 marketplace）会让 S3/S7 的适用性重估。

## 下一步触发信号

- 安装包瘦身或发布体积回归 → 先做 S1（staged node_modules 清洗）+ S2 评估（main minify benchmark），成本最低。
- 启动慢/首帧重、或主进程启动期 RSS 尖峰 → M2+M3（phase/idle 治理）立项，先给 main 启动序列与 renderer 非首屏工作打 phase 标记。
- 大会话/大 artifact 导致 renderer `privateKb` 飙升或卡顿 → M5（尺寸阈值降级）先行，与 RESEARCH-0003 的窗口化设计共用同一批阈值语义。
- 后台进程（speech-input/sidecar/worker）崩溃或内存失控工单 → M6+M8（统一重启预算 + per-role 归因 + unresponsive 栈采样）。
- 计划引入递归/工作区级文件 watch 或索引 → M7 的默认排除清单必须先行。
- 需要多语言包分发或体积压到更紧 → S3（i18n 外置）重估；届时一并决定 `.vettapkg` 资源 minify（S7）。
