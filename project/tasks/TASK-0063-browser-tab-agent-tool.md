---
id: TASK-0063
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: serial
branch: task/TASK-0063-browser-tab-tool
worktree: ..\open-forge-wt\TASK-0063-browser-tab
base_commit: forge/dev
read_paths: [packages/coding-agent/src/features, packages/coding-agent/src/composition, apps/desktop/src/main/browser-automation, apps/desktop/src/main/agent-runtime]
write_paths: [packages/coding-agent/src/features, packages/coding-agent/test, apps/desktop/src/main/browser-automation, apps/desktop/src/main/agent-runtime]
exclusive_paths: []
depends_on: [TASK-0062]
conflicts_with: []
integration_status: integrated（forge/dev 主工作区；host/guest/controller/function-source 接线与测试均已落地）
created: 2026-09-23
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# `browser_tab` Agent 工具实现

## 目标

实现一等 `browser_tab` 工具，操作应用内 WebView 的同一会话：`snapshot` / `inspect` / `click` / `fill` / `press` / `scroll` / `wait` / `screenshot` / `navigate`，读类免审、写类走 Tool Approval，元素 ref 内嵌 `pageRevision`，过期返回 `stale_reference`。

## 范围

### 并发评估

- 结论：不支持与 0062 并行——两者共享 WebView 会话控制器与 `window-manager.ts` webview 接线。
- 执行方式：serial（在 0062 合入后于同一 lane 继续，或同 worktree 接续）。
- 前置依赖：TASK-0062（会话控制器、elementRef/pageRevision）、TASK-0059（工具合同、host function 接缝）。
- 冲突文件/独占路径：`window-manager.ts`、browser-automation 模块（与 0062 共享）。
- 集成负责人：coordinator；集成顺序：Canvas lane 与 Terminal 完成后最后合。

### 做

- coding-agent 侧：按 0059 合同实现 `browser_tab` session extension，仅在 host function 存在时挂载（`attach_artifact` 同款可选依赖模式）。
- Desktop 主进程：host function 桥到 0062 的 WebView 会话控制器；动作实现经受控 `executeJavaScript`/preload 桥，无任意 JS 面。
- `snapshot`：可访问性/交互元素树 + ref + `pageRevision`（结果有界，超限截断并给文件引用）。
- `inspect`：单元素详情（attributes/computedStyle 白名单），字段与 capsule 去重。
- 写类动作（click/fill/press/navigate）接入现有 Tool Approval 事实流；navigate 仅 http/https（`assertAllowedBrowserUrl` host 传 `["*"]`）。
- ref 校验：操作携带的 `elementRef` revision 与当前 `pageRevision` 不一致 → `stale_reference` + 提示重新 snapshot；绝不自动重定位执行。
- 会话生命周期：WebView 销毁/重建 → `no_browser_session`；取消与超时逐动作生效，不残留锁。
- 文档：在 Browser preset skill/文档中写明 `browser_tab`（应用内 WebView）与 `agent-browser` CLI（独立会话）的区别与适用场景。

### 不做

- console/network 采集与 `read_logs`（ADR 预留，本任务不实现）。
- 多页签、下载、文件上传对话框自动化。
- 修改 `agent-browser` CLI skill 本身行为。
- Release Notes（coordinator 统一写）。

## Given / When / Then

- Given：会话有可操作 WebView；When：Agent 调 `browser_tab.snapshot`；Then：免审批返回交互元素树 + refs + pageRevision。
- Given：snapshot 后用户手动点了页面导致 DOM 变更；When：Agent 用旧 ref 调 `click`；Then：返回 `stale_reference`，页面无副作用；重新 snapshot 后同目标可点。
- Given：Agent 调 `fill`/`click`/`navigate`；When：审批未到；Then：动作不执行，审批拒绝产生 `approval.decision` 事实且无副作用。
- Given：WebView 被关闭；When：任意动作；Then：`no_browser_session`，会话重建后工具恢复可用。
- Given：CLI 场景无 WebView；When：会话初始化；Then：不注册该工具（能力驱动）。

## 必须保持

- `browser_tab` 与用户手点的是同一 WebView 同一页面；不创建平行浏览器会话。
- 审批是 Runtime 状态；工具结果 `content`/`details` 分层不变。
- Turn 内工具面冻结语义不变。

## 测试与验证

- 定向测试：每动作参数校验/错误形状；stale_reference；审批拒绝无副作用；会话缺失/重建；snapshot 有界截断；navigate scheme 拒绝非 http/https。
- 用户流程：点选→草稿→发送→Agent snapshot→click/fill→页面实际变化→导航后旧 ref 拒绝→重新 snapshot 恢复。
- 质量检查：合同测试 + `bun run test:impact -- <files>` + `check:quick`；真实 WebView 跨进程行为用本地 fixture 定向 Electron E2E。

## 架构评估：`<webview>` vs `WebContentsView`（2026-09-28 补记）

- 现状：Browser guest 是 renderer 内 `<webview partition="persist:vetta-browser">`，主进程经 `did-attach-webview` → `bindInAppBrowserWebview` 绑定进 `InAppBrowserSessionController`。`<webview>` 选型是 ADR-0129 的刻意决策（guest 独立进程崩溃不拖垮宿主、`contextIsolation`、共享 partition 登录态）。
- Electron 官方已把 `<webview>` 列为「架构变动中、不推荐新代码使用」，推荐 `WebContentsView`。`WebContentsView` 由主进程创建持有，同样独立 WebContents + partition，`persist:vetta-browser` 会话语义不变，同会话要求不受影响。
- 迁移代价集中在用户可见面：renderer 导航控件从 webview DOM 方法改为 IPC；面板需占位 div + bounds 同步；tab 隐藏/尺寸/焦点/缩放等生命周期边界要重新接线。这是独立的回归面，不宜与本任务合并。
- **结论：本任务维持 `<webview>`，迁移另立 TASK-0072。** 但实现约束：`browser_tab` host function 与动作实现只允许依赖 `InAppBrowserWebContents` 抽象与 session controller（两者对 tag/view 中性），不得在工具路径上引入 `<webview>` DOM 元素特有 API，保证迁移时只重接嵌入层。

## 交付记录

- 实际修改：
  - `apps/desktop/src/main/browser-automation/in-app-browser-tab-host.ts`（新）：host function 入口 `invokeDesktopBrowserTab`，工作空间解析（显式 workspaceId → 会话 cwd 回退）、`no_browser_session`/`cancelled` 早期返回、九动作分派、snapshot ref→xpath 定位表、`locateRef` revision 校验（stale_reference 无副作用）；`executeJavaScript` 包装把 WebContents 中途销毁映射为 `no_browser_session`；`createDesktopBrowserTabHostDependencies` 动态 import runtime 避免把 Electron 依赖拉进测试进程。
  - `apps/desktop/src/main/browser-automation/webview-agent-guest.ts`（新）：受控 guest runtime（snapshot/click/fill/press/scroll/wait/inspect），无任意 JS 面；无 id 元素生成可回查的全路径 xpath；press 发 keydown+keyup；fill 支持 contenteditable；wait 实现 `stable`（MutationObserver 静默窗）。
  - `webview-session-controller.ts`：`InAppBrowserWebContents` 增加 `capturePage(rect?)`/`loadURL?`；新增 `captureScreenshot`（整页先量文档滚动尺寸，视口不指定 rect，复用既有持久化）。
  - `function-extension-source.ts`：注册 `CODING_AGENT_BROWSER_TAB_FUNCTION`（Desktop 恒常可用，`has` 恒 true，无页面时 host 回 `no_browser_session`），`invokeBrowserTab` 注入点沿用 `invokeArtifact` 模式。
  - `packages/coding-agent/src/public-api/function-extensions.ts`：补导出 `browserTabToolError`（host 构造合同形状错误需要）。
  - `browser-use/SKILL.md`：写明 `browser_tab`（应用内 WebView、同页同 cookie）与 `agent-browser` CLI（独立 headless 会话）的适用边界。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run src/main/browser-automation/in-app-browser-tab-host.test.ts src/main/browser-automation/webview-agent-guest.test.ts src/main/agent-runtime/function-extension-source.test.ts` → 18/18 通过（host 9：workspace 缺失/无 WebView/snapshot+ref 定位/stale_reference 无副作用+重 snapshot 恢复/inspect 动作名回显/未知 ref/navigate scheme 拒绝与放行/screenshot 持久化/cancelled；guest 4：无 id xpath 区分与回查/id 定位/截断标记/visible 过滤；source 5 含 browser_tab has+invoke 委托）。
  - coding-agent 侧既有合同测试（`browser-tab-tool-contract`、`browser-tab-session-extension`）覆盖 schema/L3 提升/无宿主不挂载/取消映射。
  - `check:quick`：本切片文件 Biome 通过；全量门禁失败均为他人 WIP（picker-target、useCanvasTabModel、chat-service、modes-data 过期等），与本次无关。
- 未运行及原因：
  - 真实 Electron E2E（点选→发送→snapshot→click→页面变化）：`verify:ui:*` 需用户明确授权，未跑；行为层已由 host+controller+guest 三层测试覆盖。
  - `bun run check` 全量：仓库存在他人 WIP 的既有 lint/类型问题，未跑；本切片文件已单独过 Biome。
  - `test:impact`/`test:changed` 全量：桌面包存在既有环境敏感失败基线，改为定向跑本切片测试文件。
- 剩余风险：
  - 审批链路：写动作经 `raiseBrowserTabToolRisk` → L3 → 现有 Tool Approval 管线（合同测试覆盖分类与映射）；端到端「拒绝审批无副作用」依赖 Runtime 通用 L3 审批机制，未做跨进程集成测试。
  - `navigate` 返回的 `pageRevision` 依赖 `did-navigate` 事件异步 bump，返回时可能滞后一拍；对 ref 校验无影响（旧 ref 仍按旧 revision 判 stale）。
  - `locatorsByWorkspace` 为模块级 Map，仅随 snapshot 覆盖刷新；WebView 重建后旧 locator 由 revision 校验挡下，无内存泄漏风险但表会保留至下次 snapshot。
  - Release Notes 由 coordinator 统一写（任务约束），未改 `.github/release-notes/v0.5.59.md`。
