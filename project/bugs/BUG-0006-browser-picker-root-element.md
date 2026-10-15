---
id: BUG-0006
type: bug
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: "user-request; RESEARCH-0006; TASK-0062 guest picker"
related_tasks: [TASK-0062, TASK-0063, TASK-0075]
related_issues: [ISSUE-0011]
related_bugs: []
created: 2026-09-24
updated: 2026-09-25
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Browser 点选可命中 html/body，附件变成整页截图

## 用户流程

- Given：内置 Browser tab 打开任意页面，picker 已开（工具栏或 `mod+shift+d`）。
- When：用户点击看起来像控件的区域，但命中铺满视口的容器，或点到空白落到 `body`/`html`。
- Then：草稿应出现**该控件**的 capsule（稳定 selector / role / 裁剪图），页面按钮不触发。

## 实际行为

选区经常是 `role: "html"` / `"body"` / 巨大 `div`，裁剪图接近整页，`outerHTML`/`surroundingText` 膨胀到上限。用户描述为「选的是 BOM 元素而是图片」——guest 并未序列化 `window`，但观感就是「整页当一张图」，而不是页面元素。

## 期望行为

- 优先 `elementsFromPoint` 里最深的可见交互节点（button/link/input/textbox 或有显式 role 的控件）。
- 拒绝 `html`/`body`，以及矩形面积超过视口阈值（建议 ≥80%）且自身不是唯一目标的容器；向栈上更深处回退。
- 裁剪图是元素框，不是视口。
- 点选仍拦截页面 click。

## 最小复现

1. 打开 Desktop Browser tab，导航到有满屏 layout 的页面。
2. 打开 picker，点击空白或接近边缘的控件。
3. 查看草稿附件：role/domPath 是否为 `html`/`body`，截图是否为整页。

源码复现：`webview-picker-guest.ts` 的 `pickTarget` 对 `event.target` 不做 tag 过滤；`collect` 用 tag 名当 implicit role。

## 影响

- 发给 Agent 的上下文几乎是整页 HTML + 整页图，token 浪费且无法定位控件。
- TASK-0063 即使合入，过期 ref 也指向根节点，click 语义错误。
- 严重度：P1（点选主路径质量失败，不是安全绕过）。

## 根因证据

置信度高，源码一致：

- `pickTarget`：`event.target` 只要不是 overlay 即采用；`elementsFromPoint` 取第一个非 overlay 节点，可为 `html`/`body`（`webview-picker-guest.ts` 约 100–108 行）。
- 无最小交互元素、无视口面积阈值。
- `collect`：无 ARIA 时 `role = tag`（约 232–247 行）；`surroundingText` 来自 parent `textContent`（约 258–261 行）。
- 截图按 `getBoundingClientRect()` 裁剪，根节点 ≈ 视口。

不是 JS BOM 对象被选中。

## 回归测试

旧 guest 实现应失败的最小用例：

- Given：页面为 `<html><body style="height:100vh"><button id="go">Go</button></body></html>`，点击坐标落在 body 空白；When：运行 picker `onClick`；Then：不产生 `role: "body"` / `"html"` capsule，或明确取消选区并保持 picker。
- Given：点击 `#go`；When：picker 收集；Then：role 为 button，boundingRect 接近按钮，截图宽高不是整个视口。
- Given：满屏装饰 `div` 包裹按钮，点击按钮中心；When：收集；Then：目标为 button 而非满屏 div。

层级：guest 纯逻辑 / jsdom 单元测试即可；真实 webview 坐标留给 TASK-0063 的定向 E2E。

## 修复与验证

- 修复：`chooseInAppBrowserPickTarget` 拒绝 html/body 与满屏非交互容器；guest 选不中时保持 picker。
- 测试：见 `TASK-0075`。
- 检查：见 `TASK-0075`。
- 提交：`a7179ab2e`（实现）+ `c67fd8191`（测试/收尾）。
