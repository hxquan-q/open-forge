---
id: TASK-0360
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: 用户要求调研后加上元素多选；RESEARCH-0036；Cursor Design Mode
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0351]
related_issues: []
related_bugs: [BUG-0136]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: bde703413
read_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - packages/coding-agent/src/features/browser-tab/element-selection-capsule.ts
  - project/research/RESEARCH-0036-cursor-design-mode-annotation.md
write_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - apps/desktop/src/main/browser-automation/webview-picker-guest.test.ts
  - apps/desktop/src/main/browser-automation/webview-session-controller.ts
  - apps/desktop/src/main/browser-automation/webview-element-extract.ts
  - packages/coding-agent/src/features/browser-tab/element-selection-capsule.ts
  - packages/coding-agent/test/features/browser-tab/element-selection-capsule.test.ts
  - apps/desktop/src/shared/browser-tab-ipc.ts
  - apps/desktop/src/shared/i18n/locales/zh/chat.json
  - apps/desktop/src/shared/i18n/locales/en/chat.json
  - apps/desktop/src/shared/i18n/locales/zh/main.json
  - apps/desktop/src/shared/i18n/locales/en/main.json
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserElementPicker.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserElementPicker.test.tsx
  - project/research/RESEARCH-0036-cursor-design-mode-annotation.md
  - project/tasks/TASK-0360-browser-element-multi-select.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 浏览器元素 Shift+点击多选

## 目标

选取模式下可以按住 Shift 再点，把多个元素留在同一次批注里。提交后 Agent 同时看到这些元素，用来描述它们之间的关系。

## 范围

### 并发评估

- 结论：必须串行。只改点选与选区胶囊，不建 worktree。
- 执行方式：serial。主工作区。不改别人的未提交文件。

### 做

- Shift+点击加入或移出当前选择，最多 4 个。普通单击仍只保留刚点中的那一个。
- 多个高亮同时留在页面上。批注框贴着最后点中的元素，已写的文字在继续 Shift+点击时保留。
- 提交时第一个元素仍是胶囊主体，其余放进可选的 `companions`。旧的单元素胶囊继续有效。
- Alt+点击仍只把被点中的那一个放进输入框。
- 页内批注跟着当前主题：浮层底、1px 边框、`shadow-md`、主按钮和输入框。颜色由宿主读出 CSS 变量后传入；网页本身没有应用样式表。没读到主题时用出厂 mono 暗色，不另造色板。
- 批注写出「已选 N 个」。第 5 次 Shift+点击不增加选择，并说明一次最多 4 个。悬停时高亮框跟着元素。

### 不做

- 不画圈，不语音，不按住 Shift 拖出矩形。
- 不读取 React props。
- 不把多选拆成多次并行 Agent。

## Given / When / Then

- Given：选取模式开着，页面上有两个按钮。
- When：单击第一个，再 Shift+点击第二个，在旁边输入「让第二个和第一个一样」并发送。
- Then：一次选区里同时有这两个元素，批注文字是这一句。
- Given：已经选中两个元素。
- When：再 Shift+点击其中已选中的一个。
- Then：它从选择里消失，另一个还在。
- Given：已经选中两个元素。
- When：不按 Shift 单击第三个。
- Then：选择只剩第三个。
- Given：宿主把当前浮层背景色传进选取。
- When：单击一个按钮。
- Then：旁边批注使用这个背景和主色按钮，并显示「已选 1 个」。
- Given：已经选中 4 个元素。
- When：再 Shift+点击第 5 个。
- Then：选择仍是 4 个，批注里出现一次最多 4 个的说明。
- Given：选取开着，还没有点中元素。
- When：指针移到一个按钮上。
- Then：高亮框与按钮同大。

使用者点中页面上的一块，在它旁边用自己的话说想改成什么。批注应当像工作台自己的浮层，而不是嵌在网页里的另一套白卡片。

## 必须保持

- 点选仍不触发页面自己的 click。
- 单元素提交的胶囊形状不变。
- Alt+点击不发送、不带上之前的多选。

## 测试与验证

- 定向：picker guest 的主题色、已选数量、第 5 个上限、悬停高亮，以及 Shift+点击；picker hook 把主题色传给选取；session controller 仍能启动选取。
- 不跑真实 Desktop，不跑完整 check。工作区里还有其他任务的未提交文件。

## 验收分层

- 工程验证：定向测试通过。真实 Desktop 未跑。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口：内置浏览器打开页面，打开选取元素。
- 操作：单击一个按钮，Shift+点击另一个，写下两者的关系并发送。
- 预期：两个元素一起进入同一次 Agent 对话。
- 人工功能验收：待验收。

## 交付记录

- 调研：Cursor 官方只说明多选用于元素之间的关系；Shift+点击来自 Cursor 工程师 2026-06-05 的快捷键说明和 3.7 的二次报道。官方快捷键表没有把 Shift+点击写成一行，Shift+拖动仍是画区域，本轮不做。
- 定向测试通过：picker guest 7 例（含 Shift+点击两个按钮）、胶囊 6 例、session controller 10 例、prompt 投影 4 例。未跑真实 Desktop，未跑完整 check。
- 2026-10-22 主题适配：页内批注改用当前主题浮层色、14px 正文、32px 主按钮、`shadow-md`，并显示「已选 N 个」。第 5 次 Shift+点击不增加选择，并写出上限。悬停高亮恢复。没读到主题时用出厂 mono 暗色。定向：picker guest 11 例、picker hook 6 例、session controller 10 例。未跑真实 Desktop，未跑完整 `bun run check`。不推送。
