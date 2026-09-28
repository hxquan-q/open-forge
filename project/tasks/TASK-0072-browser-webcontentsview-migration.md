---
id: TASK-0072
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: user-request（WebContentsView migration）
execution: serial
branch: main（serial 任务直接在本地 main 上分阶段提交）
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
integration_status: integrated（main：1364d1376 / ebb8fc942 / 文档提交）
created: 2026-09-28
updated: 2026-09-27
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

- 阶段 1（2026-09-27，main 宿主 + IPC 合同，commit `1364d1376`）：
  - 新增 `shared/browser-view-ipc.ts` wire 合同（attach/update/detach/
    navigate/control/passthrough/event 七通道 + `DesktopBrowserViewState`）。
  - 新增 `browser-automation/browser-view-host.ts`：`InAppBrowserViewHost`
    按 workspace 持有 `WebContentsView`（`persist:vetta-browser`、
    contextIsolation、无 nodeIntegration），attach 挂窗摆位、detach
    摘窗保活、setIgnoreMouseEvents 指针穿透、http(s) `window.open`
    同 view 原地加载（沿用旧 webview 行为）、导航/加载/失败事件聚合回推。
  - `webview-session-host.ts` 新增 `bindInAppBrowserViewContents`：
    guest 归属创建时已知，直连 `InAppBrowserSessionController`（复用
    revision/picker/DOM sentinel/快捷键接线），绕开 did-attach-webview 竞态。
  - `ipc/browser-view.ts` 薄层注册 + `ipc/index.ts` 接线；preload
    `browserView` API 面落地。
  - 测试：`browser-view-host.test.ts` 10 用例（attach/bounds/可见性/
    导航控制/弹窗同 view/穿透/销毁重建/多 workspace/无窗口）。
- 阶段 2（2026-09-27，renderer 切换，commit `ebb8fc942`）：
  - `BrowserPanelView`：`<webview>` 换成 `data-browser-view-host` 占位
    div；加载徽标移入工具栏；`BrowserLiveEditCard` 从绝对定位浮层改为
    页面上方停靠条（原生 view 恒在 DOM 之上，覆盖层挡不住）。
  - `useBrowserPanelModel` 重写：attach 携带占位 bounds/初始 URL/初始
    可见性（viewVisibleRef 快照避免隐藏 tab 首帧闪现）；ResizeObserver
    上报 bounds；tab activation/空态/失败态驱动 `setVisible`；
    地址栏→workspace URL atom→navigate IPC；toolbar 四键走 control IPC；
    分栏拖拽 atom + tab 拖拽 atom + `OVERLAY_DRAG_EVENT` 广播合成
    `setInputPassthrough`。
  - `theme-ui/layout/overlay-drag.ts` 新增 CustomEvent 广播工具，
    `ResizeHandle`/`FloatingActivityTabView` 全屏兜底 overlay 展开/收起
    （含 pointercancel）时派发；layout 桶导出。
  - `window-manager.ts` 移除内置浏览器的 `did-attach-webview` 处理与
    window.open 兜底（宿主内部完成）；`closed` 时 `disposeAll` 清表；
    `webviewTag: true` 仅保留给 Canvas HTML artifact 沙箱。
  - 移除 `attachUnboundWebContents`/`pendingContents`/`getSession`
    pending 回落与 `bindInAppBrowserWebview`/`isInAppBrowserWebContents`。
  - 测试：`useBrowserPanelModel.test.tsx` 6 用例（attach 合同/事件同步
    回写 workspace atom/地址栏导航+control/隐藏与失败隐 view/拖拽穿透/
    卸载 detach）；`webview-session-controller.test.ts` unbound 用例改写
    为直连 attach 语义；`BrowserPanelView.picker.test.tsx` 改断言占位符
    契约；`browser-view-host.test.ts` 补 `visible:false` 挂载用例；
    `vetta-bridge` 测试桥补 `browserView` 底线面。
- 阶段 3（2026-09-27，文档）：新增 ADR-0134 记录背景/候选/代价/回滚并
  回链 ADR-0129；本任务台账与索引同步。
- 实际运行：desktop typecheck 绿；check:quick 绿（声明头 ratchet 新增=0）；
  定向测试 webview-session-controller/browser-view-host/model/picker/
  browser-tab/picker-hook/liveEdit-hook 全绿；test:impact 全量 desktop
  852 文件 4446 用例通过，仅 4 个既有 flaky 超时（knowledge-round、
  model-call-frame、coding-agent-spec、conversation-visibility）单独
  复跑全绿，与本改动无交集。
- 未运行及原因：真实 Desktop 冒烟（原生 view 遮挡边界、拖拽穿透手感、
  picker/liveEdit 与 view 叠加、workspace 切换、窗口 resize 撕裂）需
  实机验证，故状态挂 `verifying`。
- 剩余风险：WebContentsView 原生图层与 DOM overlay 的遮挡交互在真实
  Electron 下可能有未覆盖的边缘（对话框、右键菜单、devtools detach 未
  经 IPC 暴露——与旧 webview 面一致，非回退）；窗口多显示器/DPI 变化
  时 bounds 跟随未实机验证。
