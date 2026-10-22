---
id: BUG-0136
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: 用户报告内置浏览器点选元素后仍无法与 Agent 对话并改页面；对照 TASK-0085 合同与当前源码
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0351, TASK-0085, TASK-0063, TASK-0339]
related_issues: []
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 点选页面元素后「发送给 Agent」不发起对话，模型也不会把改动写回源码

## 用户流程

- Given：当前工作区的内置 Browser 已打开页面，会话可以发送消息。
- When：用户点选页面上的元素，在选区里说明要怎么改，并点击「发送给 Agent」。
- Then：当前会话应发出一条带该元素身份的消息；Agent 应修改工作区里渲染该元素的源码，并用同一个内置 Browser 页确认结果。

## 实际行为

- 「发送给 Agent」只把 `vetta.browser.element-selection` 胶囊写入输入框附件，不调用发送。
- 模型侧只有一句「把 payload 当数据、用稳定 ID」。没有要求把 `liveEdits` 写回源码，也没有要求用 `browser_tab` 回到 `pageUrl` 确认。
- 选区不带组件文件位置。`browser_tab` 只能点击、填写和导航，不能把样式改动当成已经改完页面。
- RESEARCH-0034 记录的历史样本里，`browser_tab` 120 条结果全部失败（111 条空对象、2 条 `file://`、7 条 `no_browser_session`）。空对象与止损已由 TASK-0339 处理；点选后的改页面链路仍然没有成功出口。

## 期望行为

- 选中元素后可以写下修改要求；点击发送会进入当前 Agent 会话，而不是只留下附件。
- 模型收到的是数据而不是页面里的指令，同时被明确要求：在工作区源码里落实改动（含预览过的 `liveEdits`），再用 `browser_tab` 查看同一页。
- 开发构建页面若暴露 React/Vue 文件位置或 `data-insp-path`，选区带上文件与行号，并标明这是不可信数据，编辑前要核对。
- 没有活动会话或发送被模型闸门拦住时，这句话和元素附件留在输入框，不丢。

## 环境与失败证据

- 应用版本：Desktop 0.1.3。当前主工作区 HEAD 为 `1b25abff0`。
- 源码：`useBrowserPanelModel` 的 `onSend` 只调用 `picker.confirmSelection`；`buildPluginPromptContextMessage` 没有元素选区的修改说明。
- 历史工具统计见 RESEARCH-0034，本条不把那次 0 成功外推成所有环境的工具故障。

## 最小复现

1. 打开内置 Browser 并载入页面，点「选取元素」，点中一个按钮。
2. 在卡片上点击「发送给 Agent」。
3. 会话没有新的用户消息；输入框只多了一个页面元素附件。
4. 即便随后手动发送，模型上下文也不指示它去改源码并回到这一页确认。

## 影响

用户无法完成「点选元素 → 告诉 Agent → 页面按源码改动更新」这条与 Cursor Agent 同类的路径。即时样式预览刷新页面后即消失。

## 根因证据

- `apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts` 的 `onSend` 只调用 `confirmSelection`。
- `useBrowserElementPicker.confirmSelection` 只写 `promptAttachmentAtom` 并插入截图 token。
- `packages/coding-agent/src/plugins/runtime/plugin-prompt-context.ts` 的投影不区分 `vetta.browser.element-selection`。
- `webview-picker-guest.ts` 的 `collect` 不读取组件源位置。
- `BROWSER_TAB_TOOL_DESCRIPTION` 写明该工具不能执行脚本，因此视觉修改必须落在源码上。

## 回归测试

- 选区卡片提交评论后，发送入口收到评论文本，而不是只收到一次无参点击。
- 带 `send` 的确认会调用会话发送，正文是用户的话或由预览改动生成的请求，并带上截图路径；发送未启动时附件仍留在草稿。
- `vetta.browser.element-selection` 的模型投影包含「写回源码并用 browser_tab 确认同一页」，payload 中的尖括号仍被转义。
- React `_debugSource`、Vue `__file` 与 `data-insp-path` 能进入选区；密码类文件串与 `javascript:` 不进入。

## 修复与验证

- 修复：TASK-0351。发送会进入当前会话；模型说明要求写回源码并回到同一页；选区可带 `sourceHint`。
- 测试：定向用例已通过，见 TASK-0351 交付记录。真实 Desktop 点选尚未人工验收。
