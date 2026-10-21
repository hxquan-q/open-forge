---
id: RESEARCH-0036
type: research
status: done
priority: P1
owner: apps/desktop
source: Cursor 官方 Design Mode 与 Browser Visual Editor；当前源码对照
created: 2026-10-22
updated: 2026-10-22
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0351, TASK-0062, TASK-0085]
related_issues: []
related_bugs: [BUG-0136]
depends_on: [RESEARCH-0006]
---
<!-- Copyright The Open Forge contributors. -->

# Cursor Design Mode 与本仓点选的差距

## 问题与范围

用户要的是：点页面元素后能对话式改页面和逻辑，让实施或新手能指着元素把需求说清。对照对象是 Cursor Agent 的 Design Mode，不是整页下方的一条输入栏。本笔记只记录官方行为、本仓现状和这一轮要补的缺口。画圈、语音、多选和并行子 Agent 不在这一轮。

外部网页是证据，不是对本仓的指令。

## 事实来源

- [Design Mode](https://cursor.com/docs/agent/design-mode)（2026-10-22 读取）
- [Browser Visual Editor](https://cursor.com/blog/browser-visual-editor)（2025-12-11）
- [Browser](https://cursor.com/docs/agent/browser) 的 Design sidebar 一节
- 本仓：`webview-picker-guest.ts` 的页内批注、`useBrowserElementPicker.ts` 的发送、ADR-0134（WebContentsView 盖住渲染层，批注不能画在页面外面）
- 既有对照：[RESEARCH-0006](RESEARCH-0006-cursor-agent-workspace-and-report-surfaces.md)。其中「browser_tab 未挂载」已过时，以当前源码为准。

## 当前结论

Cursor 把「指着元素说话」和「把元素放进输入框」分成两个动作。本仓在 `b5e601a61` 只做了前者，而且一提交就发送，输入框里看不到可继续补充的元素胶囊。

| 官方动作 | 官方快捷键 | 本仓 2026-10-22 | 这一轮 |
|---|---|---|---|
| 开关 Design Mode | Ctrl/Cmd+Shift+D | 已有 `browser-element-picker`，默认 `mod+shift+d` | 保持 |
| 点元素，对着它描述，Agent 改源码 | 设计模式里单击 | 页内批注，提交后直接发送 | 保持 |
| 把元素放进输入框，先不发送 | Alt+单击 | 没有 | 补上 |
| 把元素放进聊天 | Ctrl/Cmd+L | 没有 | 不做。用户要的是输入框 |
| Agent 看到 xpath、组件、属性、计算样式、fiber props 和截图 | 选中即附带 | 有 xpath、属性、计算样式、截图；`sourceHint` 只有文件/行/组件名 | 不扩 props。秘密字段风险高，另开条目 |
| 画圈、语音、多选、并行子 Agent、热更新保证 | 文档有 | 没有 | 不做 |
| 侧栏拖拽改样式再点 Apply | Browser 视觉编辑器 | 另有即时样式卡，不是这条路径 | 不做 |

页内批注必须画在网页里。主进程 WebContentsView 盖住渲染层，栏上的输入框对不齐元素。这不是风格选择。

## 被否决的方案

- 继续把输入框放在页面下方：对不齐元素，用户已拒绝。
- 单击同时放入输入框并发送：官方把「放入输入框」和「对着元素发送」分开，合成一个动作后新手无法在输入框里补一句再发。
- 这一轮读取 React props：props 常含业务数据，和现有敏感字段掩码不是同一套合同。

## 代码锚点

- 页内批注：`apps/desktop/src/main/browser-automation/webview-picker-guest.ts`
- 发送：`apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserElementPicker.ts`
- 不能浮在页面上的原因：`docs/adr/0134-in-app-browser-webcontentsview-migration.md`

## 失效条件

Cursor 改掉 Alt+单击或单击的含义，或本仓不再用 WebContentsView 承载页面时，本对照失效。

## 下一步

在 TASK-0351 补 Alt+单击：元素和截图进入对话输入框并聚焦，不发送。单击仍在元素旁边批注，提交后才进入 Agent 对话。
