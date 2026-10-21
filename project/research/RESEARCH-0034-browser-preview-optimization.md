---
id: RESEARCH-0034
type: research
status: done
priority: P1
owner: desktop
source: 用户提供的 browser 插件、HTML 预览与 browser_tab 统计；当前源码只读核对
created: 2026-10-21
updated: 2026-10-21
related_requirement: []
related_plan: []
related_issues: [ISSUE-0026]
related_tasks: [TASK-0123, TASK-0207, TASK-0218]
related_bugs: [BUG-0078]
---
<!-- Copyright The Open Forge contributors. -->

# Browser 与文件 HTML 预览的优化顺序

## 问题与范围

本轮为方案分析，不实施产品代码，不创建实施中的 Task，不启动 Desktop/dev server、真实浏览器或真实 Provider，也不读取真实会话目录。研究完成表示源码核对与建议交付完成，不表示性能或模型质量已改善。

建议先限制重复失败并补齐工具错误反馈，再修 HTML 相对资源与刷新行为，随后优化运行时探测缓存，最后优化 dev 插件加载。可立即使用已有的插件 dev 选择开关降低日常开发成本。

## 事实来源

- 用户提供：插件首次激活约 2225ms、二次约 1s；版本命令三次 573/562/542ms；120 条工具结果由 111 条空对象输入、2 条 `file://` 输入拒绝、7 条 `no_browser_session` 构成。原表重复的 7 条行不重复计数。这些是用户转述的实测，本轮未复测。
- `.ua` 图谱：17009 个节点、35740 条边，分析日期 2026-10-12，commit `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`，与 meta.json 一致。沿 runtime、文件预览、工具输入和宿主函数子图的一跳依赖导航后回读源码。图谱落后于 HEAD；目标增量包括 BrowserRuntimeManager、BrowserViewHost 和部分 AI Provider 文件，以下以当前源码为准。
- 相关既有记录：[ISSUE-0026](../issues/ISSUE-0026-team-member-no-webview.md)、[TASK-0123](../tasks/TASK-0123-team-member-browser-tab-unavailable.md)、[TASK-0207](../tasks/TASK-0207-browser-tab-elementref-roundtrip.md)、[TASK-0218](../tasks/TASK-0218-browser-capability-evidence.md)。团队成员工具收窄已经存在，不能把该问题描述为完全未治理。
- 浏览器语义：[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[MDN load](https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event)；自定义协议：[Electron protocol](https://www.electronjs.org/docs/latest/api/protocol)；开发预热：[Vite server.warmup](https://vite.dev/config/server-options.html#server-warmup)。外部资料仅作行为依据，不作为开发指令。

## 当前结论

### B：运行时探测与插件加载

`BrowserRuntimeManager.status()` 每次执行 `agent-browser --version`，没有状态缓存或探测 Promise 去重；`installPromise` 仅对安装去重。可以消除重复探测，首次真实探测仍有成本。

需要修正原归因：当前 `browser/src/index.tsx` 已在插件 `activate()` 末尾调用 `runtime.refresh()` 预热，`BrowserConsole` 挂载只订阅状态，另有人工重检按钮。因此不能根据现行源码认定每次面板挂载都会重新探测，也不能把 2225ms 与 550ms 必然串行相加。是否落在点击关键路径上，取决于插件激活时序，需要同一次操作的分段 trace 才能确定。打包版也不能仅凭源码保证固定只剩 550ms。

候选小改动：主进程维护短期状态缓存与同一执行环境的在途探测去重；建议先以成功约 60 秒、失败约 3–5 秒作为待验证参数。人工重检绕过缓存，安装开始失效旧缓存、安装结束强制检查；缓存过期可先展示带时间信息的上次结果，再后台重检，不能把旧 ready 宣称为当前健康。共享探测要保留各调用方取消语义；晚到的旧探测不能覆盖安装后的新状态。实际命令执行仍处理失败，不以缓存替代权限或操作检查。

现有 dev 入口已能选择插件：`VETTA_PLUGIN_DEV` 是逗号分隔的插件 ID；未设置时默认取开发租户全部插件。普通宿主工作可用 `bun run --cwd apps/desktop dev:lean`；只开发 browser 时可在一个终端设置 `$env:VETTA_PLUGIN_DEV = 'browser'` 后运行原 dev 命令。命令是建议，本轮未执行，也未改变用户的常驻环境。其余插件仍可使用 staging 构建，不必先修改启动架构。

只有选插件、命中缓存和分段 trace 后仍有明显编译瀑布时，再考虑针对入口依赖的 Vite warmup。warmup 会把计算提前，不能给全部插件无差别预热。当前 loader 已有 MF host、remote 注册和 dev preamble Promise 复用；每次 definition 加载还有一次 `cache: no-store` 的入口可达性检查，是否重复请求须测量，不先叠加第二套模块缓存或破坏 reload token/HMR。

### C：文件 HTML 的资源正确性和呈现时机

调用链为 `usePreviewBodyModel → TextPreviewRenderer → HtmlPreview → HtmlPreviewView`。虽然上游已有 `sourcePath`，HTML 分支没有继续传入；最终 `srcDoc` 缺少文件目录语义。相对资源解析到宿主 URL 的判断成立。

仓库已有 `apps/desktop/src/main/file-protocol.ts` 与 `shared/file-protocol.ts`：`vetta-file://` 注册为 standard scheme，支持 HTML/CSS/JS/媒体 MIME，并复用 `assertPathReadableForPreview`。优先评估磁盘 HTML 用真实预览 URL 加载，保留源码编辑与滚动条体验，而不是再写一套全盘 HTTP 服务。实现时必须核验嵌入上下文 CSP/协议 session、中文及 `#/?` 路径、现有 `<base>`、本地与 SSH 语义、相对 CSS/JS/module/fetch；不假定本地与远程全部相对 URL 自然等价。预览隔离、导航和可读路径边界不放宽。

Canvas 回环服务不能原样替代文件树预览：当前 `parseCanvasPreviewRequestPath` 只接受已授权 artifact 的入口别名与版本文件，不接收任意 `assets/app.js`。扩展为多文件项目服务是独立范围，需要重新定义根目录授权与生命周期。`browser_tab` 继续只收 HTTP/HTTPS，不为加载本地文件放开 `file://`。

现有 iframe 在 `onLoad` 前 opacity 为 0，会延长用户看到白屏的时间。建议允许页面按浏览器自身进度逐步绘制，局部加载状态与错误反馈独立呈现，`load` 只表示加载阶段结束；不能用更早露出空壳声称内容已经可用。移除外层隐藏不能解决阻塞脚本、CSS 或页面自身隐藏；外链页面应另外减少/本地化关键资源，尊重许可与离线需要，不擅自重写任意用户 HTML 的脚本加载顺序。

目录监听确实会在同目录变更后重读当前文件，但不等于每次兄弟文件写入都重载 iframe：最终内容字符串不变时，`srcDoc` 也不变。建议先合并目录事件、比较当前文件内容或版本、保持现有 iframe；若有路径级事件再过滤无关文件。相对资源改变则需要单独刷新策略，不能仅盯 HTML 而漏掉 CSS/JS。源码编辑中的同文件更新可短暂合并，旧的可用预览保留到新内容提交，避免中间写入不断重启页面。

自包含文件慢也不能直接定案为 Renderer 主线程忙；还要分别测读取 IPC、文件 I/O、React 提交、HTML 解析与内联脚本/样式。无外链不能排除内联代码执行成本。

### browser_tab：先止损，再归因

111/120 = 92.5% 的样本在输入校验失败，其中一个会话贡献 105 条，必须同时看按模型、会话、回合去重后的失败率。0 条成功说明该样本没有成功，不证明其他环境中的工具必然失效。

当前 `createBrowserTabTool.validateInput` 仅返回泛化错误。建议保留严格校验，提供缺失字段、合法动作与最小合法示例；`file://` 给出本地预览路径指引；`no_browser_session` 明确要求在当前工作区打开内置 Browser 页后再试。不要自动切到另一个 CLI 浏览器会话或复用其他工作区页面。

建议在通用工具执行反馈链路对“相同工具 + 规范化输入 + 相同确定性错误”做受限止损：初始候选为连续 3 次即停止同一无进展自动重试并返回明确原因，正确的新参数和新回合可以恢复。需区分网络可重试错误、正常 stale ref 恢复与确定性校验错误，保留取消、stop、usage 和每个 toolCall 对应的 toolResult。已有通用失败计数器主要用于压缩，不能把它的存在视为工具失败循环已经受保护，也不宜直接把 5 分钟全局冷却套给所有工具。

`has(browser_tab) === true` 表示 Desktop 暴露宿主能力，不代表当前工作区存在 Browser 页面。短期保留稳定工具面并把使用前置条件与恢复步骤说清。若后续按可用性收窄工具，只在 Turn admission 形成冻结快照，不能在同一个 Turn 中随 UI 开关增删工具。既有团队成员专用收窄应保留。

不能把空对象直接定案为 GLM 原始响应未带 arguments：`openai-completions/adapter.ts` 在 `toolcall_end` 调用 `parseStreamingJson`；该函数对空串与解析失败均可回退为 `{}`，随后删除 `partialArgs`。故现有转录把缺参数与解析失败合并了。畸形工具名与空参数是否同源仍是待验证假设。

后续应先用脱敏离线 chunk 夹具验证缺参数、合法空对象、截断 JSON、参数分片、工具名分片与多工具交错，再决定修 Provider 适配器还是模型配置。观测只保留诊断类别、字节数、工具关联与完成原因，不记录敏感参数原文。流式展示可宽容，结束阶段应区分完整合法 JSON 与不完整输入；零参数工具的合法 `{}` 仍须允许。最终仍由各工具 Schema 决定输入合法性。

## 被否决的方案

- 把 0.55 秒视为无法消除的每次点击固定税：忽略现有激活预热与可缓存/去重的重复探测。
- 放宽 Schema、把 `{}` 猜成 snapshot、正则抢救 XML 工具名：掩盖协议错误，也可能执行模型没有表达的动作。
- 为修文件预览开放 `file://` 或直接服务整个磁盘：扩大权限，且没有解决 preview 与 Browser 会话归属。
- 每次目录事件重建 iframe，或所有外链都加载完才展示：放大无关变化与慢资源的影响。
- 先重写 Module Federation 或同时预热全部插件：已有按插件 dev 开关，应先用现有路径建立对照。

## 代码/测试/指标锚点

| 关注点 | 当前源码 | 后续验收方式（尚未实施） |
|---|---|---|
| 激活预热与界面订阅 | `packages/plugins/presets/browser/src/index.tsx:56`、`src/components/BrowserConsole.tsx:60` | 同一次点击测 intent→visible、activate→probe、intent→ready，区分重挂载与重激活 |
| 版本探测与安装 | `apps/desktop/src/main/browser-automation/browser-runtime-manager.ts:32` | 缓存期切换新增子进程为 0，并发探测为 1；人工重检、安装和取消路径单独覆盖 |
| dev 插件集合 | `apps/desktop/scripts/run-dev-electron.mjs:69`、`src/main/plugins/plugin-dev-bootstrap.ts:94` | 全插件/仅 browser/lean 在相同条件比较，报告冷暖 p50/p95 与进程数 |
| 文件加载和监听 | `apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.tsx:40` | 无关写入保持 iframe 与滚动状态；HTML/CSS/JS 变化按约定更新，连续写入合并 |
| HTML 丢失来源 | `apps/desktop/src/renderer/domains/file-preview/components/TextPreviewRenderer.tsx:23` | 带本地 CSS/JS/图片的最小项目均加载正确，资源不误发给 Renderer Vite |
| 白屏门槛 | `packages/theme-ui/src/activity/HtmlPreviewView.tsx:111` | 用受控延迟图片证明首个可见内容不等待 window.load，并单独测内容就绪 |
| 文件与 Canvas 协议边界 | `apps/desktop/src/main/file-protocol.ts`、`canvas-server/canvas-preview-paths.ts:88` | 预览合法资源、拒绝不可读/越界路径；不扩大 Canvas 原有授权集 |
| 工具错误 | `packages/coding-agent/src/features/browser-tab/browser-tab-tool.ts:35`、`browser-tab-tool-contract.ts` | 缺 action、非法 URL、无会话反馈可区分；真实成功链用 fake host 验证 |
| Provider 最终参数 | `packages/ai/src/providers/openai-completions/adapter.ts:134`、`src/utils/json-parse.ts:10` | 离线原始 chunk→规范工具调用→校验结果全链路对照；完整、交错、截断、错误与取消均保留语义 |

本轮实际执行的是源码、Git 和现有图谱只读调查，未执行行为测试、构建、性能复跑或模型评估。`git diff --check`、`node scripts/quality/check-project-indexes.mjs`、`node scripts/release/release-notes.mjs --check` 及本记录的相对链接存在性检查通过；不把静态检查称作产品性能验证。当前 v0.1.3 为尚未迁移碎片的手写发布说明，按交付规则的存量兼容路径在「其他」补一句。

## 失效条件与置信度

源码行为与现有开关：高置信度；用户耗时与统计仅作为提供的历史基线；缓存收益、白屏收益与模型原始参数归因尚无本轮实测。修改激活生命周期、文件协议、预览载体、Provider 流式协议或 Turn 工具冻结合同后，应重新核对此记录。

## 下一步触发信号

用户要求实施时，按独立 concern 建立最小来源与 Task 合同：工具错误/止损、HTML 资源与刷新、运行时探测缓存分别可独立验证与回滚。Provider 修复须先得到可失败的离线夹具；dev 全量改造仅在已有选择开关仍无法满足测量目标时升级。默认串行推进，不在本轮派工或启动测试实例。
