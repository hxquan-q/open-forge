---
id: BUG-0083
type: bug
status: verifying
priority: P3
owner: apps/desktop renderer
source: 用户提供的 dev render 日志（2026-10-10T09:26:52.760+08:00 一条；同日 `render/2026-10-10.log` 共 45 条）
requirement:
plan:
related_requirement: []
related_plan: []
related_tasks: [TASK-0221]
related_issues: []
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# React DEV 告警「flushSync was called from inside a lifecycle method」在 render 日志里成批落盘

## 用户流程

- Given：dev 模式 Desktop（Windows 11，React 19.2.8 dev），一个 agent-team 会话正在首轮运行。
- When：该时段内与应用交互（render 日志只记录 console，无法还原具体操作）。
- Then：React 仅 DEV 构建才有的这条调用时机诊断不应成批写进持久化 render 日志、稀释真实错误。

## 实际行为

`~/.openforge-dev/desktop-app/logs/render/2026-10-10.log` 第 26–70 行：09:26:30.648–09:27:57.387 共 45 条同一条 `[error] [renderer]`，成组出现（每组 3–6 条，组内间隔 13–133ms，组间隔 2–60s）；窗口内没有任何其他 renderer 消息。`[sourceId:line]` 恒为 `chunk-PZDE4DOM.js?v=505010f1:92`。

同日晚 09:28:16、09:32:08 两次发送及随后的流式提交（PERF-send 记录 `Root x306`/15s）期间该告警不再出现——不是「只要流式就必然出现」的稳态噪音，而是特定交互触发。

## 期望行为

- 第一方代码不再调用 React 的 `flushSync`（本仓唯一调用点在侧栏选择意图）。
- 依赖侧无法从本仓定位/修复的同性质 DEV 诊断不进入持久化 render 日志；DevTools 控制台照旧可见，不被静默吞掉。
- 生产构建不受影响：该检查与文案只存在于 react-dom 的 DEV 构建。

## 环境与失败证据

- Open Forge dev（`main @ a7f0584bc`）/ Windows 11 / Electron dev / React 19.2.8 / Vite dev server `127.0.0.1:3020`。
- `sourceId:line` 指向 react-dom DEV 构建里 `flushSync` 的 `console.error` 调用点（`apps/desktop/node_modules/.vite/deps/chunk-PZDE4DOM.js:92`，即 `react-dom.development.js` 的转译产物），不是调用方位置。
- 基线对照：同日 45 条全部落在 09:26:30–09:27:57；该窗口前后同样的 agent-team 发送/流式时段均无此告警。

## 最小复现

当前无法确定性复现，如实记录为待补：

1. dev 实例启动 Desktop，进入 agent-team 会话并运行一轮；在此期间复现交互路径未知。
2. vitest/jsdom 不可用：`act()` 以不同的 executionContext 冲刷 effect，仓库内既有测试（真实 Lexical 编辑器 + 受控桥 + token 节点、侧栏选择）都不产生该告警，因此无法用测试重放。
3. 定位调用方需要真实 dev 实例上带 stack 的抓取（见「根因证据」最后一条）。

## 影响

- 仅 DEV：生产构建里没有这条检查与文案；无功能影响、无用户可见行为变化。
- 信噪比：90 秒窗口 45 条 error 落盘，真实 renderer 错误被稀释（同类先例 BUG-0048）。
- 次生风险：`flushSync` 被拒时**不会执行同步冲刷**。若第一方依赖它保证的「先提交高亮再启动重活」发生在 render/commit 期，该屏障会静默失效——本仓唯一调用点当前只有点击入口，但 API 形态允许以后被误用。

## 根因证据

React 19.2.8 实现（`react-dom.development.js` → vite chunk-PZDE4DOM.js:86-95）：`flushSync` 在 finally 里调用 `ReactDOMSharedInternals.d.f()`，其客户端实现为 `(executionContext & (RenderContext | CommitContext)) === NoContext ? (flushSyncWork…, false) : true`；只有「调用发生在 render/commit 期（含 layout/passive effect、ref 回调）」才返回 true 并打印该 error。即任何在 React 生命周期内同步执行的 `flushSync` 都会命中，与调用方是不是业务代码无关。

dev 依赖图内全部 `flushSync` 调用点（`apps/desktop/node_modules/.vite/deps` 全量扫描）：

| 调用方 | 位置 | 可达性判定 |
|---|---|---|
| react-dom 自身 | `chunk-PZDE4DOM.js:92` | 告警打印点（不是调用方） |
| react-virtuoso 4.18.15 | `react-virtuoso.js:2446` 滚动处理器；effect 内自调用带 `suppressFlushSync: true` 豁免 | 滚动事件异步派发，正常不落在 commit |
| radix-ui 1.6.7（内含 floating-ui / primitive 等） | `radix-ui.js:3595` `useFloating` 的 `computePosition().then`（microtask）；`chunk-7Q5NMAUG.js:251` `dispatchDiscreteCustomEvent`（MenuItem 选中、NavigationMenuLink 点击、Toast 滑动） | 均不在生命周期内 |
| @lexical/react 0.48.0 | `@lexical_react_LexicalPlainTextPlugin.js:3041` 装饰器监听器 `flushSync(setDecorators)`，只在一次 `editor.update` 增删装饰器节点时触发 | **唯一可落在 effect/commit 的路径**：编辑器桥（`ValueBridgePlugin` / `ControlledValueBridgePlugin`）在 `useEffect` 与 `store.sub` 里调用 `editor.update`；token 节点（file/image/member/skill/connector）都是装饰器节点 |
| 本仓第一方 | `useSidebarSelectionIntent.ts:49`（点击路径） | 全部调用点来自行按钮 onClick；当前无 lifecycle 入口，但这是唯一的本仓调用点 |

候选排序（置信度）：① Lexical 装饰器监听器 + 第一方桥在 effect 内 `editor.update`（中）；② 第一方 `flushSync`（低，除已排除的点击路径外未发现 lifecycle 入口）；③ react-virtuoso / radix（低，正常不可达）。无法用单行日志定案：React 只打印 react-dom 自身位置，Electron 的 `sourceId` 也因此只能指向 react-dom。下一步若再出现，用带 stack 的抓取（dev 下给 `console.error` 打补丁或临时包一层）定位真实调用方。

## 回归测试

- `renderer-console-policy.test.ts`：新判定 `isReactFlushSyncLifecycleDiagnostic` 精确命中该文案，并拒绝近似文案与真实错误（旧实现下该判定不存在，过滤器无从生效）。
- 侧栏选择：`useProjectsPanelModel.selectSession.test.tsx` 既有用例覆盖「点击即时高亮 / 只打开最后一次 / 路由确认后清除」行为，保证替换 `flushSync` 不回归。

## 修复与验证

- 修复：见 [TASK-0221](../tasks/TASK-0221-renderer-flushsync-dev-noise.md)（第一方 `flushSync` 移除 + DEV 噪音精确过滤）；代码与发布说明提交 `e8377d854`。
- 测试：`renderer-console-policy.test.ts`、`useProjectsPanelModel.selectSession.test.tsx`、`DefaultSessionRowView.test.tsx`（见 TASK-0219 交付记录）。
- 检查：`bun run check`（见 TASK-0219 交付记录）。
- 未运行及原因：真实 dev 实例带 stack 的调用方定位（需要可复现的用户操作路径）；本仓已消除第一方调用点，依赖侧调用方若再出现仍按本记录的候选表继续处理。
