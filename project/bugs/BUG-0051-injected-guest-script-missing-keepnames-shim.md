---
id: BUG-0051
type: bug
status: verifying
priority: P1
owner: apps/desktop main (browser-automation)
requirement:
plan:
source: 内置浏览器元素点选链路故障排查
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-29
updated: 2026-09-29
---
<!-- Copyright The Open Forge contributors. -->

# 注入 guest 的脚本引用了网页里不存在的打包器辅助函数，命令全部异常终止

## 用户流程

- Given：内置浏览器已打开一个页面，用户点「选择元素」，或在页面上做即时编辑，或让 Agent 调用浏览器工具。
- When：主进程把相应命令组装成脚本注入 guest 页面执行。
- Then：应高亮可点选元素、返回选中结果、按要求改写样式；实际脚本一求值就异常终止，用户看到的是「点了元素没有任何反应」。

## 实际行为

注入脚本靠 `fn.toString()` 把主进程里的函数源码内联进 guest。构建期开启了 `keepNames`，esbuild 为保住 `.name` 会在**函数体内**插入 `__name(fn, "name")`；`.toString()` 只带走函数体，那个辅助函数是模块顶层绑定，不在被内联的源码里。打包形态下辅助函数与调用点一起被 minify 收缩成单字母（实测为 `o`），于是 guest 里每条命令都以 `ReferenceError: o is not defined` 结束。

同一机制还波及依赖字面量：`webview-live-edit.ts` 里被内联的函数若调用同模块的兄弟导出，guest 里同样是未定义绑定。

## 期望行为

注入脚本在 guest 全局作用域内自洽：内联源码引用的辅助函数随脚本一并补齐，不依赖模块顶层绑定。

## 环境与失败证据

- 打包形态：`apps/desktop/vite.main.config.ts` 生产构建 `minify: true` 且 `esbuild: { keepNames: true }`（该选项为保留栈帧函数名付出 0.74MB，见 TASK-0104）；dev 不 minify，插入的辅助函数保持 `__name` 原名，形状不同但同样不在 guest 里。
- 真产物形状已固化为测试夹具：`guest-script-shim.test.ts` 的 `KEEP_NAMES_MINIFIED_SOURCE` 摘自 `dist/main` 的 minify 输出（辅助函数与调用点均为单字母）。
- 失败此前被静默吞掉：`webview-session-controller.ts` 里 `executeJavaScript` 的异常没有留痕，面板上只表现为「没反应」；本项修复一并补了错误日志。

## 最小复现

1. 打开内置浏览器并加载任意页面。
2. 点「选择元素」在页面上点选，或对某个元素做即时编辑。
3. 面板无任何反馈；修复前主进程无日志可查。

## 影响

打包形态下元素点选、即时编辑与 Agent 浏览器工具在 guest 内的全部命令失效——它们共用同一套注入组装；用户侧表现为「内置浏览器的交互功能整体失灵」，且没有任何错误提示。

## 根因证据

- [`guest-script-shim.ts`](../../apps/desktop/src/main/browser-automation/guest-script-shim.ts) 顶部记录了机制与实测：`.toString()` 只带走函数体，guest 里不存在 `o` 这个模块顶层绑定。
- 修复前 [`webview-picker-guest.ts`](../../apps/desktop/src/main/browser-automation/webview-picker-guest.ts) 与 [`webview-agent-guest.ts`](../../apps/desktop/src/main/browser-automation/webview-agent-guest.ts) 直接内联 `fn.toString()`，没有任何补齐动作。
- [`webview-live-edit.ts`](../../apps/desktop/src/main/browser-automation/webview-live-edit.ts) 的被内联函数原先调用同模块兄弟导出，属同一根因的另一面。

## 回归测试

- [`guest-script-shim.test.ts`](../../apps/desktop/src/main/browser-automation/guest-script-shim.test.ts)：真产物形状（单字母辅助函数）与 dev 形状（`__name`）都能被认出并补垫片；普通调用、属性访问、构造调用、字符串字面量开头的调用不被误认；无辅助函数时不注入任何垫片（保证脚本与源码逐字一致）；被测函数不调用同模块兄弟导出；两条注入脚本都不调用 guest 模块的导出绑定。
- [`webview-agent-guest.test.ts`](../../apps/desktop/src/main/browser-automation/webview-agent-guest.test.ts) 与 [`webview-picker-guest.test.ts`](../../apps/desktop/src/main/browser-automation/webview-picker-guest.test.ts)：把注入脚本**整段求值**（与 `executeJavaScript` 同一入口）并断言快照/点选结果。

旧实现下：整段求值前者必抛 `ReferenceError`（测试用 `KEEP_NAMES_MINIFIED_SOURCE` 直接断言了这一点）。

## 修复与验证

- 修复：commit `12ed8a772`。新增 `guest-script-shim.ts`：按调用形状（`name(fnOrIdentOrThis, "字面量")`，且名字不是保留字或已知全局）识别辅助函数，在注入 IIFE 内补等价实现；两条注入脚本改走 `assembleGuestScript`。`webview-live-edit.ts` 的被内联函数改为不调用兄弟导出，`webview-session-controller.ts` 为注入失败补日志。
- 测试：`bun run --cwd apps/desktop test src/main/browser-automation/guest-script-shim.test.ts src/main/browser-automation/webview-agent-guest.test.ts src/main/browser-automation/webview-picker-guest.test.ts`（与同日另两项合计 6 文件 42 例全绿）。测试求值入口为 [`src/test/injected-guest-script.ts`](../../apps/desktop/src/test/injected-guest-script.ts)，用间接 eval 复现 guest 全局作用域的标识符解析。
- 检查：`bun run check`（lint / types / guards / mobile-lint 四段均 exit 0）。
- 未运行及原因：打包版人工点选冒烟（需 `build:desktop` 授权）；故状态保持 `verifying`。
