---
id: BUG-0041
type: bug
status: verifying
priority: P2
owner: apps/desktop renderer (bottom-panel terminal)
requirement:
plan:
source: 实机验收团队会话/新会话页时路由崩溃两次，console 捕获完整栈
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 路由切换时 xterm dispose 竞态抛 TypeError，整页落到路由错误边界

## 用户流程

- Given：用户停留在含终端实例的页面（如团队会话页/底部面板已挂过终端）
- When：路由切换到新会话页或团队会话页（TerminalSurface 随之卸载）
- Then：页面正常卸载，终端静默销毁

## 实际行为

路由错误边界被触发，整页显示「当前页面遇到问题 / Cannot read properties of undefined (reading 'onShowLinkUnderline')」，需手动点「重试当前页面」恢复。两次触发相隔约 16 分钟，均在路由跳转瞬间。

## 期望行为

`Terminal.dispose()` 在卸载路径上不因 addon/renderer 清理顺序抛错；即使抛错也不应升级为整页路由错误。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：`main` @ `d9dee933e`（Desktop dev 构建，profile `openforge-dev-04987e4e`）；Windows 11；`@xterm/xterm` + `@xterm/addon-canvas`（vite deps）
- renderer console 两次同栈（70ms 与 976272ms）：

```text
TypeError: Cannot read properties of undefined (reading 'onShowLinkUnderline')
    at new Yt (@xterm_xterm.js:4198)                ← renderer 构造读 option
    at ln.createInstance (@xterm_xterm.js:5249)
    at yn._createRenderer (@xterm_xterm.js:8546)
    at Object.dispose (@xterm_addon-canvas.js:1947) ← CanvasAddon.dispose 内部又走 createRenderer
    at a.dispose (@xterm_addon-canvas.js:1381)
    at xn._wrappedAddonDispose (@xterm_xterm.js:8778)
    at e.dispose (@xterm_xterm.js:8768)
    at xn.dispose (@xterm_xterm.js:8764)
    at Ne (@xterm_xterm.js:941)
    at dr2.clear (@xterm_xterm.js:974)
    @ useRouteErrorPageModel.ts:7
```

- 现象判读：`Terminal.dispose()` → addon dispose → canvas addon 内部 `_createRenderer` 时 `terminal.options` 已为空——options 清场先于 addon 收尾的销毁顺序竞态。

## 最小复现

1. 打开一个会挂载 `TerminalSurface` 的页面（如底部面板含终端，或刚结束会话的团队会话页）
2. 路由跳转到 `#/new-session?cwd=...`
3. 概率性触发：整页落到「当前页面遇到问题」

## 影响

导航主流程中断整页渲染，用户需手动重试；对终端会话无数据损坏，但体验上是硬崩溃。两次自发触发说明不是单次巧合。

## 根因证据

- `apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.tsx` cleanup 中直接 `terminal.dispose()`（L231-234 附近），未包裹异常；canvas addon 的 dispose 链在 xterm 内部重建 renderer 时读到空 options。
- 与 BUG-0034（WebGL context 累积）同域但不同因：那是 webgl addon 上下文泄漏，此是 canvas addon dispose 内部竞态。

## 回归测试

- 组件层：多次 mount/unmount `TerminalSurface`（jsdom 下 canvas addon 可走 stub），断言 unmount 不产生未捕获异常；更真实的方向是在宿主测试里对 `terminal.dispose` 包一层防御后再验证路由级表现。
- 若修复为「dispose 前先摘 addon」或「try/catch + 降级日志」，断言 dispose 路径不向上抛。

## 修复与验证

- 修复：方案（a）+（b）组合——cleanup 中先显式 `rendererAddon.dispose()`（此刻 linkifier 尚存活，CanvasAddon 收尾重建 DOM renderer 不会再读崩），被摘除的 addon 由 xterm AddonManager 移除、不会二次 dispose；`terminal.dispose()` 另包 try/catch + warn，销毁期异常不再击穿路由错误边界。根因定位：xterm 6.0.0 销毁顺序先清 `MutableDisposable` 包装的 linkifier（构造期注册，FIFO 先轮到），再让 AddonManager 逐个 dispose addon。
- 测试：`TerminalSurface.host.test.tsx` 新增三条——canvas/webgl 两条路径断言「渲染 addon dispose 先于 terminal.dispose」、dispose 抛错时 unmount 不向外抛；旧实现下三条全红（红绿已验）。
- 检查：bottom-panel 域 6 文件 41 用例全绿；`check:quick` 通过。
- 未运行及原因：真实路由切换的实机复验未跑（需 `verify:ui:*`，待用户授权）。
