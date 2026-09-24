---
id: TASK-0072
type: task
status: ready
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: user-request（WebContentsView migration）
execution: serial
branch: unassigned（尚未开工）
worktree: unassigned（serial task；不创建独立 Worktree）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts, apps/desktop/src/renderer/domains/activity-panel, packages/theme-ui/src/activity, docs/adr/0129-canvas-artifact-dual-lifecycle-and-in-app-browser-tab.md]
write_paths: [apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts, apps/desktop/src/main/ipc, apps/desktop/src/renderer/domains/activity-panel, packages/theme-ui/src/activity, docs/adr]
exclusive_paths: []
depends_on: [TASK-0063]
conflicts_with: []
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0063]
related_issues: []
related_bugs: []
integration_status: pending
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器 `<webview>` → `WebContentsView` 迁移

## 背景

- ADR-0129 刻意选用 `<webview>` 承载不可信 guest：独立渲染进程、`contextIsolation`、共享 `persist:vetta-browser` partition。
- Electron 官方已将 `<webview>` 标记为架构变动中、不推荐新代码使用，推荐 `WebContentsView`（主进程创建持有的 `WebContents` 宿主）。
- TASK-0063 的 `browser_tab` 工具建立在 `InAppBrowserWebContents` 抽象上，对 tag/view 中性；本任务只重接嵌入层与所有权，不改工具合同。

## 目标

内置浏览器 guest 从 renderer `<webview>` 元素迁移为主进程 `WebContentsView`：保持同一 partition 会话、同一页面被用户与 Agent 共享，`browser_tab` 全部动作、`pageRevision`/`stale_reference`、元素点选、截图裁剪行为不变。

## 范围

### 做

- 主进程按 workspace 创建/持有 `WebContentsView`（`persist:vetta-browser`），挂到主窗口；`InAppBrowserSessionController` 直接绑定该 contents，移除 `did-attach-webview`/`attachUnboundWebContents` 竞态路径。
- renderer：`BrowserPanel` 改为占位视图，经 IPC 上报 bounds/可见性驱动 `setBounds`/`setVisible`；导航控件（前进/后退/刷新/地址栏/URL 加载）改走 IPC。
- 生命周期边界：tab 隐藏（ActivityPanel 常驻挂载改 view 可见性）、面板/窗口 resize、workspace 切换、页面缩放、开发者工具 detach、右键菜单、焦点交接。
- `webviewTag: true` 保留与否需盘点 Canvas HTML artifact 等其它 `<webview>` 使用方；仅 browser guest 迁移。
- 新增 ADR 记录本次架构变更（背景、候选、决策、代价、回滚），并回链 ADR-0129。

### 不做

- 不改 `browser_tab` 工具合同、审批层级、元素 ref 格式。
- 不迁移 Canvas HTML artifact 的 `<webview>`（隔离沙箱语义不同，另行评估）。
- 不改 `persist:vetta-browser` partition 共享策略（按 workspace 隔离仍是 deferred 异议）。

## 必须保持

- 用户看到的页面与 Agent 操作的页面是同一 `WebContents` 同一会话；不产生平行会话。
- `pageRevision` 递增语义、`stale_reference`、`no_browser_session` 错误形状不变。
- guest `contextIsolation`/无特权 preload 边界不变；guest 不得获得 `window.vetta`。

## Given / When / Then

- Given：用户在内置浏览器登录某站点；When：Agent `browser_tab.snapshot`；Then：返回同一登录态页面的元素树。
- Given：面板从隐藏切回可见；When：再次操作或截图；Then：view 可见且截图内容正确，无残留空白/错位。
- Given：迁移后窗口 resize/侧栏折叠；When：持续拖动；Then：guest 视图 bounds 跟随占位区，无撕裂。

## 测试与验证

- 复用 0063 的合同测试证明工具行为不变；新增 bounds/可见性同步的定向测试。
- 真实 WebContentsView 跨进程行为用定向 Electron E2E 验证（导航、截图、点选、销毁重建）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
