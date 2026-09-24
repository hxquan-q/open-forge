---
id: BUG-0019
type: bug
status: investigating
priority: P3
owner: packages/theme-ui
source: user-report; React console warning
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0016]
depends_on: []
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Browser 面板向 DOM 传递布尔 allowpopups 属性产生 React 警告

## 用户流程

- Given：用户打开包含 Browser 面板的 Desktop 页面。
- When：Browser 面板挂载 webview。
- Then：Renderer 不应因向 DOM 传入无效布尔属性而输出 React 警告，同时应保持 Electron webview 所需的弹窗行为合同。

## 实际行为

控制台报告：

```text
Received `true` for a non-boolean attribute `allowpopups`.
If you want to write it to the DOM, pass a string instead: allowpopups="true" or allowpopups={value.toString()}.
```

## 期望行为

按 React/Electron `webview` 的属性合同传递 `allowpopups`，控制台无该警告，且弹窗允许策略不发生非预期变化。

## 最小复现

1. 在 Desktop 打开 Browser 面板。
2. 查看 Renderer 控制台。
3. 确认警告消失且 webview 的弹窗行为符合既有安全配置。

## 影响

产生重复控制台噪声，降低真实 Renderer 错误的可诊断性；目前未观察到该警告直接影响页面功能。

## 根因证据

- `packages/theme-ui/src/activity/BrowserPanelView.tsx:163` 渲染 Electron `<webview>`。
- 同文件 `:168` 将 `allowpopups={true}` 作为 React boolean prop 传入，与用户提供的 React 警告一致。
- 需要核对 Electron `webview` 的属性语义及 React 渲染方式，不能仅为了消除警告而改变弹窗权限。

根因置信度：高；警告与源码赋值吻合。弹窗合同影响待确认。

## 回归测试

- 尚未补充。至少验证渲染属性符合 webview 合同且不触发 React 警告；同时断言安全策略没有被放宽。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
