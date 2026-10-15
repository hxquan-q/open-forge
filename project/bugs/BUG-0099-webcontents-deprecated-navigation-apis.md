---
id: BUG-0099
type: bug
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（Electron deprecation 噪音中的自有调用面）
related_requirement: []
related_plan: []
related_tasks: [TASK-0229]
related_issues: []
related_bugs: [BUG-0094]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器仍调用 Electron 已废弃的 `canGoBack`/`canGoForward`，应迁移 `navigationHistory`

## 用户流程

- Given：Electron 打包版运行内置浏览器视图。
- When：`BrowserViewContents`/`stateOf`/前进后退指令调用 `contents.canGoBack()`/`canGoForward()`。
- Then：Electron 39 中该直挂 API 已废弃并打 deprecation 噪音（与 `fs.Stats`、`Buffer()` 同一批），未来版本移除后前进/后退状态与手势失效；期望走 `contents.navigationHistory.canGoBack()` 等新接口。

## 实际行为

`browser-view-host.ts` 接口与全部消费点仍用旧 API：37-38 行 `BrowserViewContents.canGoBack/canGoForward` 声明，164-167 行手势前进/后退，317-318 行 `stateOf` 给 renderer 的 canBack/canForward 状态。主日志 deprecation 段可见 `canGoBack`/`canGoForward` 条目（与 Electron 内部 `fs.Stats`/`Buffer()` 并列，后者不可控）。

## 期望行为

接口契约改为 `navigationHistory` 等价方法（`contents.navigationHistory.canGoBack()`/`canGoForward()`/`goBack()`/`goForward()`），fake 实现对齐；deprecation 噪音中不再出现自有调用面。

## 环境与失败证据

- 主日志 Electron deprecation 输出含 `canGoBack`/`canGoForward`（自有调用面贡献）。
- 行为本身尚未破坏——属移除前迁移，非当前功能故障。

## 最小复现

打包/开发版开内置浏览器产生导航历史后触发一次 `stateOf` 或手势，`canGoBack` deprecation 计数 +1。

## 影响

低—— deprecation 噪音 + Electron 未来大版本移除后的功能失效风险；迁移窗口充裕但应随浏览器主线顺手清。

## 根因证据

- [`browser-view-host.ts`](../../apps/desktop/src/main/browser-automation/browser-view-host.ts) 37-38、164-167、317-318 行：唯一自有调用面，面小可一次切完；fake `BrowserViewContents` 实现需同步。
- 置信度：高（API 废弃状态与调用面均确定）。

## 回归测试

现有 host 套件应继续通过；fake 实现改 navigationHistory 形态后 `canBack/canForward` 断言不变（绿基线即可，无需红测）。

## 修复与验证

- 修复：见 [TASK-0234](../tasks/TASK-0234-webcontents-navigation-history.md)。`BrowserViewContents` 接口的 4 个直属导航方法收敛为 `navigationHistory` 子对象（对齐 Electron 39 真实形态，真实 `WebContentsView` cast 结构契合）；`control` 的 back/forward 与 `stateOf` 的 `canBack/canForward` 共 4 个调用点全部改走 `contents.navigationHistory.*`。
- 测试：`browser-view-host.test.ts` fake 改 navigationHistory 形态；control 用例扩展覆盖 forward 与「不可前进/回退时不调用」两侧；`ipc/browser-view.test.ts` fake 同步。host 套件 18 例绿。
- 全量：impact（desktop 相关套件）264 例过；`ipc/browser-view.test.ts` 等 4 套件在收集期命中 `window-manager.ts:25` `process.resourcesPath` 既有 import 失败（与本改动无关，fake 改动已随其余套件一并 lint/类型验证）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 验证边界：deprecation 噪音消除依赖运行时实际不再调用直属方法——`webview-session-host.ts` 持有的是真实 `WebContents`，其事件绑定未用废弃 API；`navigationHistory` 其余能力（getAllEntries/restore 等）未引入。
