---
id: TASK-0351
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: 用户请求完善 Browser 与 Agent 联动，并支持点选元素后对话改页面；BUG-0136
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0085, TASK-0063, TASK-0062, TASK-0339]
related_issues: []
related_bugs: [BUG-0136]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 1b25abff0
read_paths:
  - apps/desktop/src/renderer/domains/activity-panel
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts
  - apps/desktop/src/main/browser-automation
  - packages/coding-agent/src/features/browser-tab
  - packages/coding-agent/src/plugins/runtime/plugin-prompt-context.ts
  - packages/theme-ui/src/activity/BrowserLiveEditCard.tsx
  - project/plans/PLAN-0006-canvas-browser-activity-tabs.md
  - project/research/RESEARCH-0034-browser-preview-optimization.md
write_paths:
  - apps/desktop/src/renderer/domains/activity-panel
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts
  - apps/desktop/src/renderer/shared/store/chat-atoms.ts
  - apps/desktop/src/main/browser-automation
  - apps/desktop/src/shared/i18n/locales
  - packages/coding-agent/src/features/browser-tab/element-selection-capsule.ts
  - packages/coding-agent/src/plugins/runtime/plugin-prompt-context.ts
  - packages/coding-agent/test/plugin-prompt-context.test.ts
  - packages/coding-agent/test/features/browser-tab/element-selection-capsule.test.ts
  - packages/theme-ui/src/activity/BrowserLiveEditCard.tsx
  - project/bugs/BUG-0136-browser-element-agent-edit-does-not-send.md
  - project/bugs/README.md
  - project/requirements/REQ-0001-work-coding-mvp.md
  - project/tasks/TASK-0351-browser-element-agent-edit.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserElementPicker.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - packages/coding-agent/src/plugins/runtime/plugin-prompt-context.ts
depends_on: []
conflicts_with: [TASK-0349]
integration_status: pending
created: 2026-10-21
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 点选元素后与 Agent 对话并改页面

## 目标

内置 Browser 点选元素后，用户能在选区里告诉 Agent 要怎么改，并真正发出一轮对话。Agent 把改动写回工作区源码，再用 `browser_tab` 查看用户正在看的同一页。

## 范围

### 并发评估

- 结论：条件支持。代码路径与 TASK-0349 的会话归档不重叠；两边都会改 `project/tasks/README.md`。
- 执行方式：serial。主工作区已有 TASK-0349 的未提交改动，本任务不建 worktree，也不改会话归档文件。
- 可并行 Task：无。
- 前置依赖：无。TASK-0085 / TASK-0063 已提供点选胶囊与 `browser_tab`。
- 冲突文件/独占路径：见 frontmatter。集成时只追加本任务的索引行，保留 TASK-0349 的行。
- Branch：main
- Worktree：主工作区
- 集成负责人：当前会话
- 集成顺序：本任务自洽提交；不与 TASK-0349 混在同一次提交。

### 做

- 选区卡片增加「对 Agent 说」输入。发送时把评论、或预览改动、或默认请求发到当前会话，并附上元素胶囊与已有裁剪图。
- 模型投影对 `vetta.browser.element-selection` 增加固定说明：payload 仍是数据；把 `liveEdits` 写入源码；`sourceHint` 先核对再改；完成后用 `browser_tab` 对 `pageUrl` 做 snapshot，不要换浏览器，不要把 DOM 点击当成视觉修改完成。
- 点选采集 React `_debugSource`、Vue `__file` 与 `data-insp-path` / `data-source-path` / `data-source`，作为可选 `sourceHint`。
- 没有会话发送函数、或发送在进入 prompt 前返回时，把这句话和附件留在输入框。
- 中英文案走 i18n。当前版本发布说明补一条用户可见改进。

### 不做

- 不实现框选、多选、语音、并行子 Agent。
- 不让 `browser_tab` 执行任意脚本或放开 `file://`。
- 不改团队成员隐藏 `browser_tab` 的合同。
- 不自动刷新任意外部网站，也不保证非本工作区页面能改到源码。
- 不读取或提交用户日志、密钥和会话正文。

## Given / When / Then

- Given：Browser 已打开页面，且当前会话可以发送。
- When：用户点中元素，写下「把按钮改成蓝色」，点击「发送给 Agent」。
- Then：会话出现这条用户消息，附件是该元素；模型上下文要求改源码并用 `browser_tab` 确认同一 URL。
- Given：用户只改了预览样式、没有写评论。
- When：点击发送。
- Then：用户消息描述这些前后值，胶囊含 `liveEdits`。
- Given：页面按钮带 `data-insp-path="src/App.tsx:12:3"`，或 React/Vue 开发信息。
- When：点选命中。
- Then：选区 payload 含对应 `sourceHint`，且不含 `javascript:` 或尖括号。
- Given：发送入口不存在。
- When：用户点击发送。
- Then：元素附件和这句话留在输入框，输入框里已有的草稿不被清空。

## 必须保持

- 点选仍拦截页面自身的 click。
- 元素胶囊 Schema 对旧 payload 仍通过；`sourceHint` 可选。
- `plugin_prompt_contexts` 继续转义 `<` `>`。
- 普通发送、override 发送和插件 `sendPrompt` 不消费这条新路径的语义：插件发送仍不吃用户附件。
- `browser_tab` 仍只操作当前工作区的内置 WebView。
- 敏感表单的 value 掩码保持不变。

## 测试与验证

- 定向测试：元素胶囊、prompt 投影、source hint、picker guest 点选、选区卡片评论、picker hook 发送、composed 发送保留原草稿。
- 用户流程：卡片输入评论 → 发送回调得到评论；hook 在 `send: true` 时调用 `sendMessageFnRef`，失败时附件仍在。
- 质量检查：上述定向测试、`test:impact`、`check:quick`，代码任务结束跑 `bun run check`。不跑 `verify:ui`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待验收。需要在真实 Desktop 里点选本地页面并看到源码改动后的页面变化。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：打开项目会话，右栏 Browser 打开由该项目提供的页面（本地 dev 或预览）。已配置模型。
- 操作步骤：选取元素，点中按钮或标题，输入「把文字改成已完成」，发送。
- 预期行为与最终产物：会话出现这条消息和元素附件；Agent 修改对应源码；同一 Browser 页能看到变化，或明确说明这一页不是当前工作区产生的。
- 不通过表现与已知限制：只出现附件、没有新消息；Agent 只在页面 DOM 上点一下就声称改完；外部网站被假装改了源码。
- 人工功能验收：待验收。

## 交付记录

- 实现：选区卡片可写修改要求并发送；`composed` 发送保留原草稿、附带裁剪图和元素胶囊；模型投影要求写回源码并用 `browser_tab` 确认 `pageUrl`；点选采集 React / Vue / `data-insp-path` 作为 `sourceHint`。
- 定向测试通过：胶囊、prompt 投影、元素抽取、picker guest、选区卡片、picker hook、composed 发送。Desktop 用例用 `apps/desktop/vitest.config.ts`。
- `bun run check:quick -- <本任务文件>` 通过。
- `bun run check` 未通过，失败在 TASK-0349 未提交的会话归档格式和 `useChatViewModel.archive.test.tsx` 类型错误。本任务文件不在该失败列表中。未跑 `test:impact` 与 `verify:ui`。
- 未在真实 Desktop 里点选页面并看到源码改动后的刷新。
- 集成：实现提交 `79b7fe4bb`，全宽栏 `1af5c0253`。2026-10-22 按用户口径改为页面内批注：点中元素后，输入框出现在该元素旁边；提交后元素和这句话进入 Agent 对话。页面由主进程绘制，批注画在页面内部，不能浮在页面外的栏上。
- 不推送。真实 Desktop 尚未点选验收。
