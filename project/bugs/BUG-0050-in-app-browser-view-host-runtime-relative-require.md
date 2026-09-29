---
id: BUG-0050
type: bug
status: verifying
priority: P1
owner: apps/desktop main (browser-automation)
requirement:
plan:
source: 打包形态内置浏览器故障排查
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-29
updated: 2026-09-29
---
<!-- Copyright The Open Forge contributors. -->

# 打包版内置浏览器视图建不起来：宿主在运行时按相对路径解析主进程依赖

## 用户流程

- Given：用户装的是打包版 Desktop（`minify` + `keepNames` 的单文件 main 产物），打开内置浏览器标签页或侧栏浏览器面板。
- When：面板上报占位矩形，主进程按 workspaceId 建立 `WebContentsView` 并加载页面。
- Then：面板内应出现网页内容；实际面板始终空白，`attach` 在 IPC 处理器里整条抛错。

## 实际行为

`getInAppBrowserViewHost()` 内部的取窗口闭包执行 `createRequire(import.meta.url)("../window-manager.js")`。main 被 esbuild 打成单文件后 `import.meta.url` 指向 `dist/main`，该相对路径解析到并不存在的 `dist/window-manager.js`，抛 `Cannot find module`；建 view 的链路从取窗口这一步就断掉，`WebContentsView` 的延迟加载走的是同一套机制。

## 期望行为

宿主需要的主进程依赖（窗口读取、`WebContentsView` 构造）随 main bundle 一起打包，在装配期一次注入，不在运行时按相对路径解析。

## 环境与失败证据

- 打包形态：`apps/desktop/vite.main.config.ts` 生产构建 `minify: true` 且 `esbuild: { keepNames: true }`，产出单文件 main。
- 开发形态不复现：dev 不做打包，模块按源码目录结构解析，相对路径成立——这是该缺陷只在正式包出现的原因。
- 证据形态属结构性证据（相对路径在单文件 bundle 下必然解析失败），未留存失败日志原文。
- 基线对照：`apps/desktop/src/main` 下已无运行时相对路径 `require`（`grep -rn 'require("\.' apps/desktop/src/main/` 无命中）；同目录其余 `createRequire` 用法均用于包名（`koffi`、`sherpa-onnx-win-x64`、`node-pty`），不受此路径规则影响。

## 最小复现

1. `bun run build:desktop` 产出打包版。
2. 启动打包版，打开内置浏览器面板。
3. 面板空白，main 日志出现 `Cannot find module`。

## 影响

打包形态下内置浏览器完全不可用；依赖同一 view 的元素点选、即时编辑与 Agent 浏览器工具一并失效。开发模式不受影响，因此该缺陷不会在日常开发中暴露。

## 根因证据

修复前的 [`browser-view-host.ts`](../../apps/desktop/src/main/browser-automation/browser-view-host.ts) 用 `createRequire(import.meta.url)` + `lazyRequire("../window-manager.js")` 取主窗口，`WebContentsView` 亦同法延迟加载；宿主自身拿不到这两项，于是退化为运行时相对路径解析。缺陷面在建 view 的装配缝上，不在业务逻辑。

## 回归测试

- [`browser-view-host.test.ts`](../../apps/desktop/src/main/browser-automation/browser-view-host.test.ts)「装配前的 `getInAppBrowserViewHost` 报明确错误，不自解析运行时相对路径依赖」：未装配即 `attach` 必须抛 `not configured`，而不是退回自解析。
- [`browser-view.test.ts`](../../apps/desktop/src/main/ipc/browser-view.test.ts) 覆盖 `registerBrowserViewIpc` 这一唯一装配点：静态注入的窗口读取与 view 构造必须被真正接到宿主上。

旧实现下：宿主自解析依赖，前者的「未装配即报错」与后者的注入合同都不成立。

## 修复与验证

- 修复：commit `190055dfb`。新增 `InAppBrowserViewHostRuntime` 与 `configureInAppBrowserViewHostDeps`，由 [`ipc/browser-view.ts`](../../apps/desktop/src/main/ipc/browser-view.ts) 在注册 IPC 时用静态 import 的 `getMainWindow` 与 `WebContentsView` 注入；宿主未装配时显式抛错，不再静默退化。
- 测试：`bun run --cwd apps/desktop test src/main/browser-automation/browser-view-host.test.ts src/main/ipc/browser-view.test.ts`（与同日注入脚本两项合计 6 文件 42 例全绿）。
- 检查：`bun run check`（lint / types / guards / mobile-lint 四段均 exit 0）。
- 未运行及原因：打包版端到端人工冒烟（需 `build:desktop` 授权）；故状态保持 `verifying`。
