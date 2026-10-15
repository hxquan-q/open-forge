<!-- Copyright The Open Forge contributors. -->
# ADR-0134：内置浏览器 guest 迁移为主进程 WebContentsView

## 状态

已接受（TASK-0072 / PLAN-0006 落地；回链并补充 ADR-0129 §3）

## 背景

ADR-0129 §3 选用 renderer `<webview>` 承载内置浏览器 guest：独立进程、`contextIsolation`、共享 `persist:vetta-browser` partition，`browser_tab` 工具经 `InAppBrowserWebContents` 抽象操作同一页面。两条结构性问题随时间暴露：

1. Electron 已将 `<webview>` 标记为架构变动中、不推荐新代码使用，推荐 `WebContentsView`。
2. guest 发现路径存在固有竞态：`did-attach-webview` 事件 → `partition` 匹配 → `attachUnboundWebContents` 暂存，webview 标签挂载与「Agent 首次问会话」之间没有顺序保证，`getSession` 需要 pending 回落兜底（`webview-session-host.ts` / `webview-session-controller.ts` 的 unbound 分支）。

`<webview>` 的优势是参与页面内 compositing 层级；`WebContentsView` 是主进程持有的原生视图，恒绘制在 DOM **之上**，普通 DOM 覆盖层挡不住它——这是本次迁移的主要代价面。

## 决策

### 1. view 按 workspace 在主进程创建/持有，renderer 只上报占位矩形

`browser-automation/browser-view-host.ts`（`InAppBrowserViewHost`）维护 `workspaceId → WebContentsView` 表：`attach` 挂窗摆位、`update` 跟随 bounds/可见性、`detach` 摘窗保活（view 常驻，Agent 在 tab 不可见时仍可操作同一页面）。窗口 `closed` 时 `disposeAll` 清表。

renderer 侧 `BrowserPanel` 渲染占位 `<div>`，`useBrowserPanelModel` 经 `browserView.*` IPC 上报 `attach`（bounds + 初始 URL + 初始可见性）/`update`（bounds、visible）/`navigate`/`control`/`setInputPassthrough`，并用 `ResizeObserver` 跟随面板/窗口 resize。主进程把 `url/title/canBack/canForward/loading/failed` 聚合为 `DesktopBrowserViewState` 经事件 channel 回推。

### 2. guest 归属创建时已知，移除 unbound 竞态

view 由主进程按 workspace 创建，`bindInAppBrowserViewContents` 直接以 `workspaceId` 绑定会话控制器；`did-attach-webview`、`isInAppBrowserWebContents`、`attachUnboundWebContents`、`pendingContents` 全部删除。同一个 `WebContents` 仍是用户与 Agent 的共享页面——partition、pageRevision/stale_reference、picker/liveEdit、截图裁剪合同不变。

### 3. 原生图层的遮挡处置

`WebContentsView` 不参与 DOM 层级，凡要盖在页面上的 UI 都要改道：

- 空态/失败覆盖层保留在 DOM，model 在它们激活时同步 `setVisible(false)` 隐去 view；tab 失活经 activation context 同理。
- 加载徽标移入工具栏（不再悬浮页面上）；`BrowserLiveEditCard` 从绝对定位改为页面上方的停靠条。
- 分栏/浮窗拖拽的全屏兜底 overlay 拿不到掠过 view 的指针事件：`theme-ui/layout/overlay-drag.ts` 用 `CustomEvent` 广播拖拽态（theme-ui 不依赖 desktop atoms），model 把「面板分栏拖拽 + tab dock↔float 拖拽 + overlay 广播」合成 `setIgnoreMouseEvents` 指针穿透。

### 4. `webviewTag: true` 仅保留给 Canvas HTML artifact

`window-manager.ts` 中 `webviewTag` 继续开启，唯一消费方是 Canvas HTML artifact 沙箱（ADR-0129 §3 的隔离语义不变，本任务显式不迁移）。其余 `did-attach-webview` 处理已移除。

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| 维持 `<webview>` | Electron 已不推荐；`did-attach-webview` + partition 匹配竞态是反复出 bug 的根源 |
| DOM overlay 照旧 + z-index 压制 | 无效：原生 view 不属 compositing 层，任何 z-index 都压不住 |
| 遮挡态用 view 截图贴图代替隐藏 | 加载态/resize 期间截图滞后失真；隐藏简单且与旧「webview 隐藏」行为等价 |
| 遮挡时拆离窗口（removeChildView） | 频繁摘挂成本高于 setVisible，且重新挂回时序难保证 |
| 拖拽期缩 bounds 到 0 而非指针穿透 | view 视觉跳变；穿透只切输入不动画面，拖拽覆盖层本就需要接管指针 |
| browser_tab 改走新 IPC 面 | 违反本任务非目标：工具合同不变，`InAppBrowserWebContents` 抽象本就对载体中性 |

## 后果

- 新增 `vetta:browser-view:*` IPC 面（attach/update/detach/navigate/control/passthrough/event），preload `browserView` 为对外合同；IPC 层只做校验转发。
- view 生命周期由主进程独占：renderer 卸载不销毁页面，与旧 `<webview>` 「卸载即销毁 guest」不同——这是有意为之（Agent 会话续存），但也意味着 view 数量随 workspace 数增长，由 `persist:vetta-browser` 会话共享兜底。
- `BrowserPanelView` props 面变化（`webviewRef/partition` → `hostRef`）；liveEdit 卡位置由浮层变停靠条，加载提示位移到工具栏——用户可感知的两处轻微视觉变化。
- 页面缩放、devtools detach、右键菜单未经 IPC 暴露（与旧 webview 面一致，非回退）；如需开放再补合同。

## 回滚

恢复 renderer `<webview>` + `did-attach-webview` 绑定需要同时还原三段：main 宿主（`browser-view-host.ts`/`webview-session-host.ts` 的 view 直连）、IPC/preload `browserView` 面、`BrowserPanel`/`useBrowserPanelModel` 占位实现。改动集中在 TASK-0072 的提交链（1364d1376、ebb8fc942 与文档提交），单点回退这些提交即可回到 `<webview>`；partition 与工具合同两边一致，回滚不产生数据迁移。
