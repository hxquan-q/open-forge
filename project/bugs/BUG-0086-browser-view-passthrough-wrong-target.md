---
id: BUG-0086
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main/render 2026-10-09）
related_requirement: []
related_plan: []
related_tasks: [TASK-0072]
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器指针穿透调用落在 `WebContents` 上，`setIgnoreMouseEvents` 每次必抛 TypeError

## 用户流程

- Given：用户打开内置浏览器页签（InAppBrowser WebContentsView 已 attach 到窗口）。
- When：分栏/浮窗拖拽经 overlay 广播触发 `vetta:browser-view:passthrough`，主进程应切换指针穿透让事件掠过 view 落回 DOM。
- Then：拖拽全程穿透正常；实际主进程 handler 每次都抛 `TypeError: r.setIgnoreMouseEvents is not a function`，穿透不生效，renderer 收到 uncaught promise 错误。

## 实际行为

`vetta:browser-view:passthrough` IPC 在真实 Electron 对象上确定性失败：view 存在且未销毁时，`webContents` 上没有 `setIgnoreMouseEvents`，handler 抛 TypeError，renderer 侧为 `Uncaught (in promise) Error: Error invoking remote method 'vetta:browser-view:passthrough'`。指针穿透功能静默失效，拖拽经过 view 时事件被原生图层吃掉。

## 期望行为

`setIgnoreMouseEvents` 作用于承载内容的 `WebContentsView`（或宿主 `BrowserWindow`），分栏/浮窗拖拽掠过内置浏览器区时指针事件正常穿透，无异常落盘。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\OpenForge\OpenForge\versions\0.1.3`），Windows，Electron 39.8.10。
- `temp/log/main/2026-10-09.log`：`Error occurred in handler for 'vetta:browser-view:passthrough': TypeError: r.setIgnoreMouseEvents is not a function` 70 次；`temp/log/render/2026-10-09.log` 同因 uncaught error 约 70 次，普通页与 agent-team 会话页均出现。
- `project/verification/VERIFY-0017-behavior-acceptance-checklist.md:157` 已在实机记录同一错误 4 条并怀疑「WebContentsView 无 BrowserView.setIgnoreMouseEvents」，未立案；VERIFY-0018 另记录 2 条。

## 最小复现

1. 打包版或 dev 打开任一内置浏览器页签。
2. 拖动面板分栏边界或把浮动页签拖过浏览器区（触发 overlay 拖拽广播）。
3. 观察 main 日志 `passthrough` handler TypeError 与 render 日志 uncaught error 成对出现。

## 影响

所有依赖指针穿透的拖拽交互在内置浏览器上方断开或卡顿；每次触发向日志写一对错误，长会话累积上百条。覆盖面是所有 0.1.x 打包用户。

## 根因证据

- [`browser-view-host.ts`](../../apps/desktop/src/main/browser-automation/browser-view-host.ts) `setInputPassthrough`（约 167 行）对 `record.view.webContents` 调 `setIgnoreMouseEvents`；该 API 属于 `WebContentsView`/`BrowserWindow`，不在 `WebContents` 上。
- [`ipc/browser-view.ts`](../../apps/desktop/src/main/ipc/browser-view.ts) `createInAppBrowserView` 生产装配返回真实 `new WebContentsView(...)`，故生产必现。
- 接口 `BrowserViewContents`（host 约 39 行）把 `setIgnoreMouseEvents` 建模在 contents 上，测试 fake（`ipc/browser-view.test.ts`、`browser-view-host.test.ts`）照此实现，断言绿而 API 面是错的——测试面本身即缺陷的一部分。
- 置信度：高（Electron API 归属确定；与日志签名完全一致）。

## 回归测试

`apps/desktop/src/main/browser-automation/browser-view-host.test.ts`：fake 移除伪 `setIgnoreMouseEvents`（对齐真实 API 面），断言穿透期 view `setVisible(false)`、请求可见性独立保留、结束后按请求态恢复、`webContents` 不销毁。旧实现下三例同报 `TypeError: contents.setIgnoreMouseEvents is not a function`（与生产日志同签名）红基线，修复后转绿。

## 修复与验证

- 修复：见 [TASK-0225](../tasks/TASK-0225-browser-view-passthrough-target.md)。Electron 39 的 `setIgnoreMouseEvents` 只存在于 `BaseWindow`/`BrowserWindow`（electron#23863 未实现 per-view），改为穿透期 `setVisible(false)` 让位 DOM 兜底 overlay；`BrowserViewContents` 删除伪方法。
- 测试：host + ipc 定向套件 20 例过；impact desktop 侧 182 例过（4 个套件因 `window-manager.ts` `process.resourcesPath` 既有问题红，与本改动无关）。
- 检查：`check:types`/`check:lint` 全绿；`check:quick` 被 `.ua/` 既有 guard 残留阻断（非本改动）。
- 验证边界：真实机器拖拽分栏/tab 的 overlay 跟踪属人工验收。
