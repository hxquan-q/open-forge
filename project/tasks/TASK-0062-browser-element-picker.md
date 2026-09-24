---
id: TASK-0062
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: parallel
branch: forge/dev
worktree: unassigned（原 ..\open-forge-wt\TASK-0062-browser-picker 目录已淘汰；实现在 forge/dev 主工作区）
base_commit: b3a5743c3d03b8cd126b50a266a0a8d4af59913a
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts, packages/theme-ui/src/activity, packages/plugins/plugin-sdk/src/prompt-attachment.ts]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts, apps/desktop/src/main/ipc/browser-tab.ts, apps/desktop/src/shared/browser-tab-ipc.ts, apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts, apps/desktop/vitest.config.ts, packages/theme-ui/src/activity/BrowserPanelView.tsx]
exclusive_paths: []
depends_on: [TASK-0059]
conflicts_with: []
integration_status: integrated（forge/dev 主工作区；源文件与 15 处类型修正均已落地）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Browser 元素点选与草稿 capsule

## 目标

在内置 WebView 上实现元素点选：picker 模式悬停高亮、点击拦截不触发页面动作；选中生成 `vetta.browser.element-selection` capsule 附加到输入草稿（不自动发送），含裁剪截图；同时落地供 picker 与 `browser_tab` 共用的 WebView 会话控制器（`pageRevision`/`elementRef`）。

## 范围

### 并发评估

- 结论：条件支持——与 Canvas lane（0060→0061）并行；TASK-0063 依赖本任务的会话控制器，串行其后。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0060、TASK-0061、TASK-0064。
- 前置依赖：TASK-0059（capsule schema、IPC/preload 桩、`browser-element-picker` 快捷键注册、i18n 骨架）。
- 冲突文件/独占路径：`window-manager.ts` webview 接线与 0063 共享 → 0063 串行依赖本任务，不并行。
- 集成负责人：coordinator。

### 做

- WebView 会话控制器（主进程侧）：绑定 workspace↔WebView 身份、当前 URL/title、`pageRevision`（导航/DOM 变更递增）、`elementRef` 生成与校验；供 0063 复用。
- Browser tab 改为常驻可挂载：移除 `useMeta` 的 `browserUrl` 门控，空态显示地址栏。
- Picker 模式：工具栏按钮 + `browser-element-picker` 快捷键开关；webview 内悬停高亮 overlay；点击拦截（`preventDefault`/`stopPropagation`，不触发页面 click）；webview 聚焦时按键经 `before-input-event` 透出。
- capsule 提取：受控 `executeJavaScript` 或 preload 桥返回受限结构化数据（schema 0059 已冻结：role/accessibleName/attributes 白名单/domPath+xpath/computedStyle 白名单/outerHTML≤8KB/周边文本≤2KB）；剥离脚本与事件属性、遮蔽表单敏感值。
- 裁剪截图：按元素 bounding rect × devicePixelRatio 换算 `capturePage` 区域，长边上限 1600px PNG，存会话图片缓存并作为 image attachment。
- 草稿附件：走既有 `composer.attach`/`PluginPromptAttachment` 通道，单次只允许一个 capsule；composer 中可见可移除；发送时随 `PromptRequest` 序列化。
- 页面导航/刷新后 picker 状态与旧 ref 处理：revision 递增，picker 保持可用，旧 capsule 的 ref 标记可能失效。

### 不做

- 多选/框选/页面标注/语音（Phase 2）。
- `browser_tab` 动作实现（TASK-0063）。
- console/network 采集（non-goal）。
- 不把 fork-only 条目写入继承的 Vetta `v0.5.59` Release Notes；候选文案留在本 Task，首发 `0.1.0` 切入后再由 coordinator 写入。

## Given / When / Then

- Given：Browser tab 打开一个页面；When：用户点 picker 按钮或按 `mod+shift+d` 并点选输入框；Then：页面不发生点击副作用，草稿区出现一个 Browser 元素附件，含 url/title/role/domPath/裁剪截图。
- Given：已附加 capsule；When：用户不发送直接再选一个元素；Then：新 capsule 替换旧的（单 capsule 限制）。
- Given：选中后页面发生导航；When：Agent 之后用 capsule 里的 `elementRef` 操作；Then：因 `pageRevision` 变化返回 `stale_reference`（由 0063 消费，本任务只保证 ref/revision 正确生成）。
- Given：picker 激活中；When：用户再次按快捷键或点退出；Then：恢复正常浏览，无残留 overlay。

## 必须保持

- 点选不触发页面业务动作；overlay 不读取/不回传表单敏感值、Cookie、token。
- 不暴露任意 JS 执行面给渲染层或 Agent。
- 选区附件只进草稿，绝不自动发送。

## 测试与验证

- 定向测试：capsule 提取字段/上限/脱敏；domPath+xpath 稳定性；裁剪坐标换算（含 devicePixelRatio>1 与滚动偏移）；单 capsule 替换；picker 进出与点击拦截。
- 用户流程：开 Browser→导航→picker→点选→草稿出现附件（含截图）→发送后 Agent 收到结构化上下文。
- 质量检查：组件/合同测试 + `bun run test:impact -- <files>` + `check:quick`；webview 真实交互用本地 fixture 定向 Electron E2E。

## 交付记录

- 实际修改：
  - 主进程：`InAppBrowserSessionController` 绑定 workspace↔`persist:vetta-browser` WebView、`pageRevision`/`elementRef`、picker 循环、capsule 提取与按 CSS rect×dpr 裁剪截图；`did-attach-webview` / `before-input-event` 接到 window-manager。
  - Renderer：Browser tab 去掉 `browserUrl` 门控；工具栏 picker + `mod+shift+d`；选中结果写入 `promptAttachmentAtom`（单 capsule 替换）并插入裁剪图，不自动发送。
  - 冻结 IPC：`crop-screenshot` 成功带 `path`，失败码 `no_browser_session | crop_failed`；guest 脚本不暴露任意 JS 执行面。
- 实际运行：
  - `apps/desktop` 定向 Vitest：12 文件 / 34 通过（提取/脱敏、ref 过期、裁剪换算、guest 点击拦截、会话绑定与再选、IPC 桥、草稿替换、工具栏空态、快捷键合同）。
  - `bun run check:quick -- <本任务 29 个源/测文件>`：Biome 干净；`check:guards` 仅因仓库既有 `@vetta/coding-agent/projects` 缺根 tsconfig path map 失败（与 TASK-0059 相同，非本任务引入）。
- 未运行及原因：
  - 完整 `bun run check` / `test:impact` 全量 related：独立树无 workspace `dist`，`vitest related` 会落到图标 SVG 与其它包构建面；Windows 上也不把全量 `tsc` 当放行条件。
  - 未跑 `verify:ui:*` 与真实 `<webview>` Electron E2E（现有 e2e 仅 smoke；用户未授权 UI 实机验收）。
- 剩余风险：
  - 冻结 IPC 无 `webContentsId`：多个 pending WebView 时按「先到先绑定」；0063 若要精确寻址需后续扩合同。
  - guest Escape 会关 picker；宿主 `before-input-event` 同时处理快捷键与 Escape，真实页内焦点路径未做 Electron 实机对拍。
  - Desktop manifest 仍为 `0.5.59`；不得把 fork-only 条目写入继承的 Vetta Release Notes。
- 集成收口：本任务源文件并入 `forge/dev` 后，桌面类型检查（`bun x tsc -p apps/desktop/tsconfig.json`）暴露 15 处错误，均在本任务范围内并已修正——`waitForPick` 的三态结果与 `pickerWaiter` 字段声明不一致（改为共享 `PickerOutcome`）、截图持久化入参按 `PersistImageFileInput` 合同由 `Buffer` 改为 `ArrayBuffer` 并在 `toPNG()` 处拷贝出 Node 共享 Buffer 池、两处隐式 `any` 的 `parentElement`、`boundingRect` 的 `unknown` 收窄，以及 `<webview allowpopups>` 的 JSX 布尔属性。修正后相关 4 个测试文件 15/15 通过。
- 候选发布说明（切入 Open Forge 首发版本后再写入对应 `v*.md`，当前阻断）：
  - 「改进」：内置 Browser 可直接输入地址并点选页面元素；选中结果作为一条可替换的草稿附件（含裁剪截图）进入输入框，不会自动发送，也不会触发页面上的按钮。
  - 「其他」：仅内部类型修正（浏览器元素点选的类型合同对齐），无用户可感知变化。
