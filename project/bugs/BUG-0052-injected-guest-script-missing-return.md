---
id: BUG-0052
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

# 注入 guest 的脚本缺少 return，执行成功也拿不到结果

## 用户流程

- Given：内置浏览器打开了页面，注入脚本已经可以正常执行（即 BUG-0051 已修）。
- When：用户点选页面元素，或 Agent 通过浏览器工具取页面快照。
- Then：对话框/工具结果里应出现被选中元素的描述、快照节点列表；实际脚本完成值恒为 `undefined`，用户表现为「点了元素但对话框里什么都没有」。

## 实际行为

组装出的脚本形如 `void 0;(function(...){...})(...)`——外层 IIFE 体内没有 `return`。`executeJavaScript` 以脚本的完成值作为结果，少了这个 `return`，无论命令执行得多成功，主进程拿到的永远是 `undefined`。

## 期望行为

注入脚本返回被内联表达式的求值结果，主进程据此拿到点选/快照数据。

## 环境与失败证据

- 该缺陷与形态无关（打包与 dev 同样发生），因为它取决于脚本拼接文本，而非构建期改写。
- 与 BUG-0051 叠加时不可单独观测：脚本先抛 `ReferenceError`，根本走不到取返回值这一步；修掉垫片缺失后才显形。
- 证据为源码层面：修复前 `buildBrowserTabGuestScript` 直接拼 `void 0;(${runtime.toString()})(...)`，无返回。

## 最小复现

1. 打开内置浏览器并加载任意页面。
2. 点「选择元素」并点选一个元素。
3. 面板不填任何内容（脚本无异常，但完成值为 `undefined`）。

## 影响

即便脚本能跑通，点选与快照的返回值也永远为空——元素点选、Agent 浏览器工具的数据回传整体失效，且与 BUG-0051 的报错形态不同，失败时没有任何异常可供排查。

## 根因证据

[`guest-script-shim.ts`](../../apps/desktop/src/main/browser-automation/guest-script-shim.ts) 的 `assembleGuestScript` 以 `return ${expression}` 收尾，其注释记录了缺失时的用户可见表现；修复前两条注入脚本各自拼串，均无 `return`。

## 回归测试

[`guest-script-shim.test.ts`](../../apps/desktop/src/main/browser-automation/guest-script-shim.test.ts) 对组装结果**整段求值并断言返回值**（`42`、`2`）；[`webview-agent-guest.test.ts`](../../apps/desktop/src/main/browser-automation/webview-agent-guest.test.ts) 断言整段求值返回的快照节点名与 XPath 可反查回原元素。

旧实现下：这些用例拿到的是 `undefined`，断言失败。

## 修复与验证

- 修复：commit `12ed8a772`（与 BUG-0051 同一笔）。`assembleGuestScript` 统一产出 `void 0;(function(...){<垫片>return <表达式>})(...)`，两条注入脚本都改走该入口。
- 测试：`bun run --cwd apps/desktop test src/main/browser-automation/guest-script-shim.test.ts src/main/browser-automation/webview-agent-guest.test.ts src/main/browser-automation/webview-picker-guest.test.ts`（与同日另两项合计 6 文件 42 例全绿）。
- 检查：`bun run check`（lint / types / guards / mobile-lint 四段均 exit 0）。
- 未运行及原因：打包版人工点选冒烟（需 `build:desktop` 授权）；故状态保持 `verifying`。
