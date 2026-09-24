---
id: BUG-0019
type: bug
status: done
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
updated: 2026-09-25
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
- React DOM 对非布尔属性不序列化 boolean 值：`true` 被丢弃并告警，webview 实际拿不到 `allowpopups` 属性——弹窗许可此前一直处于「意外失效」状态（属性缺失即拒绝弹窗）。
- Electron 自带 JSX 声明（`electron.d.ts`）把该属性定为 `boolean`，与 React DOM 的字符串合同冲突，是原代码写成 boolean 的类型层诱因。

根因置信度：高；警告与源码赋值吻合，回归测试在 jsdom 下证实 boolean 形式属性缺失、字符串形式属性真实写入 DOM。

## 回归测试

- 已补充：`apps/desktop/src/renderer/domains/activity-panel/components/BrowserPanelView.picker.test.tsx` 新增用例，断言 `webview` 的 `allowpopups` 属性序列化为 `"true"`、`webpreferences` 保持 `contextIsolation=yes, nodeIntegration=no`，且渲染期间无该 React 警告。
- 该用例在旧实现（`allowpopups={true}`）下失败（属性为 `null`），随修复转绿。

## 修复与验证

- 修复：commit `aa053afe7`（`fix(desktop): Browser 面板以字符串形式传递 webview allowpopups`）。组件以 `allowpopups={"true" as unknown as boolean}` 单点断言弥合 Electron JSX 声明与 React DOM 字符串合同的差异，并附注释说明；未改动 plugin preset 的 `webview.d.ts`（对 desktop tsc 不生效且会引起声明合并冲突）。
- 行为变化说明：修复后 webview 真正获得弹窗许可（此前因属性被丢弃而意外禁用）；`contextIsolation` / `nodeIntegration` 安全配置不变。
- 测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/activity-panel/components/BrowserPanelView.picker.test.tsx --exclude '**/.claude/worktrees/**'` → 5/5 通过（修复前新增用例失败）。
- 检查：`bun run --cwd apps/desktop typecheck` 通过；根 `bunx tsgo --noEmit` 过滤本包零错误；`bun run check:quick` 对两个变更文件全绿；pre-commit 门禁通过。
- 未运行及原因：未运行 `verify:ui:*` 实机检查——用户未授权 UI 验证流程，属性序列化合同已由组件测试证明；真实 Electron 环境的弹窗行为建议随下次实机验证顺带确认。
