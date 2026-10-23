---
id: BUG-0145
type: bug
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source: 用户现场（2026-10-22）：点选提示已出现，单击、Shift 多选、Alt 放入输入框都没有效果
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0365]
related_issues: []
created: 2026-10-22
updated: 2026-10-23
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器点选提示已打开，但单击不会在元素旁出现输入框

## 用户流程

- Given：内置浏览器已打开页面，点选模式已打开（工具栏下方有「点击元素后，输入框出现在元素旁边」）。
- When：单击页面上的元素；或按住 Shift 再点；或按住 Alt 再点。
- Then：单击应在元素旁边出现批注输入框，Shift 把多个元素留在同一次批注里，Alt 把这一个元素放进对话输入框。这些点击不应再触发页面自己的按钮。

## 实际行为

提示在，点下去没有批注框，多选和 Alt 放入输入框也没有发生。页面按钮仍可能按原来的方式响应。

## 期望行为

点选落在指针按下的那一下：批注框出现在元素旁，修饰键行为与提示一致，页面按钮不被触发。

## 环境与失败证据

- Desktop 0.1.3，Windows，用户在 dev 里打开 `http://localhost:8080/` 后打开点选。
- 客页脚本把 `pointerdown` 和 `click` 绑在同一个处理函数上，并在区分事件类型之前就 `preventDefault`。Chromium 取消 `pointerdown` 后不再派发 `click`。批注只写在 `click` 分支里，所以真实点击永远打不开输入框。现有测试只派发 `click`，所以是绿的。

## 最小复现

1. 打开内置浏览器并进入点选模式。
2. 单击页面上的按钮或文字。
3. 元素旁边没有输入框。

## 影响

点选、Shift 多选、Alt 放入对话输入框整条入口不可用。

## 根因证据

- `webview-picker-guest.ts` 的 `onClick` 先 `preventDefault`，再 `if (event.type !== "click") return`。
- 该函数同时监听 `pointerdown` 与 `click`。

## 回归测试

- `webview-picker-guest.test.ts`：只派发 `pointerdown`、不派发 `click` 时，批注框出现，页面按钮的 click 不触发。

## 修复与验证

- 修复：见 TASK-0365。点选罩层改为接收指针（十字光标），命中时先把罩层拿开再取下面的元素；点选落在 `pointerdown`。
- 测试：`webview-picker-guest.test.ts` 13 例通过。
- 检查：`check:quick` 全绿。
- 未运行及原因：完整 `bun run check` 未跑；本提交只动主进程注入脚本与台账。
- 2026-10-22 真实 Desktop 复验（Fresh 隔离实例）：pointerdown 症状已消除——单击即在元素旁出现批注框，页面按钮不被触发，随后 click 不再二次打开。但用户报告的完整链路仍不通：批注提交与停止点选死于注入层 `ReferenceError: o`（新登记 BUG-0146），BUG-0136 的「真实 Desktop 点选未人工验收」由此得到解释。本 bug 的 pointerdown 部分可判修复，整体点选可用性以 BUG-0146 修复为准。
