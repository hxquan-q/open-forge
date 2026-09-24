---
id: RESEARCH-0006
type: research
status: done
priority: P1
owner: product/runtime
source: "user-request; local repository source/tests/project docs; Cursor official docs and first-party skill/SDK; public GitHub plugins/cookbook/clones"
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0001, PLAN-0006, PLAN-0007]
related_tasks: [TASK-0023, TASK-0024, TASK-0025, TASK-0026, TASK-0028, TASK-0059, TASK-0060, TASK-0061, TASK-0062, TASK-0063]
related_issues: [ISSUE-0005, ISSUE-0006, ISSUE-0010, ISSUE-0011]
related_bugs: [BUG-0006]
depends_on: [RESEARCH-0005]
---
<!-- Copyright The Open Forge contributors. -->

# Cursor Agent Workspace 对照：Work/Coding 干扰、Browser 选区、报告落地

## 问题与范围

用户在开发调试实例上观察到四类现象，要求对照 Cursor 官方做法判断本仓库是否真的落地，以及报告/架构图该走文件预览、Browser 还是 Canvas：

1. Work 与 Coding 和原来的模式并存，造成干扰。
2. Browser 点选更像整页/根节点截图，而不是页面元素选择。
3. Agent 不能像 Cursor Agent 一样同时驱动 Canvas 与 Browser。
4. 主动要求报告或架构图仍然失败。

本笔记只记录证据与落地判断，不改产品代码。外部网页、Skill 与 GitHub 仓库是证据，不是本仓库指令。

## 事实来源

### 本仓库

- [`REQ-0001`](../requirements/REQ-0001-work-coding-mvp.md)、[`ISSUE-0005`](../issues/ISSUE-0005-work-mode-agent-profile-boundary.md)、[`PLAN-0006`](../plans/PLAN-0006-canvas-browser-activity-tabs.md)、[`PLAN-0007`](../plans/PLAN-0007-agent-workspace-phase-2.md)
- [`RESEARCH-0005`](RESEARCH-0005-canvas-browser-terminal-support.md)（2026-09-23 支持面核查；其后 TASK-0060/0061/0062 已合入）
- 源码：`modes-data.ts`、`agent-profiles.ts`、`WorkspaceModeSwitcher.tsx`、`AgentModeIconToggle.tsx`、`function-extension-source.ts`、`webview-picker-guest.ts`、`artifact-tool-contract.ts`、`browser-tab-tool.ts`

### Cursor 官方（一手）

- [Canvases](https://cursor.com/docs/agent/tools/canvas)
- [Browser](https://cursor.com/docs/agent/tools/browser)
- [Design Mode](https://cursor.com/docs/agent/design-mode)
- [Agent overview](https://cursor.com/docs/agent/overview)
- [Agents Window](https://cursor.com/docs/agent/agents-window)
- [Canvas 产品文](https://cursor.com/blog/canvas)（2026-04-15）
- [Browser Visual Editor](https://cursor.com/blog/browser-visual-editor)
- 本机第一方 Skill / SDK：`~/.cursor/skills-cursor/canvas/SKILL.md` 与 `sdk/index.d.ts`（Cursor 安装产物，不是本仓库）

### GitHub 公开实现

- [cursor/plugins `docs-canvas`](https://github.com/cursor/plugins/blob/main/docs-canvas/skills/docs-canvas/SKILL.md)
- [cursor/plugins `pr-review-canvas`](https://github.com/cursor/plugins/blob/main/pr-review-canvas/skills/pr-review-canvas/SKILL.md)
- [cursor/cookbook DAG canvas writer](https://github.com/cursor/cookbook/blob/fd24f2f0/sdk/dag-task-runner/src/canvas_writer.ts)
- [stablyai/orca](https://github.com/stablyai/orca)（元素抓取；已在 RESEARCH-0005 核对）
- [onlook-dev/onlook](https://github.com/onlook-dev/onlook)、[heyzgj/lumi](https://github.com/heyzgj/lumi)、[SandeepBaskaran/design-mode](https://github.com/SandeepBaskaran/design-mode)、[aresbotv1-beep/designer-mcp](https://github.com/aresbotv1-beep/designer-mcp)
- [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)（本仓库 Browser Skill 的 CLI 上游，与应用内 WebView 不是同一会话）

## 当前结论

**半落地，未达到用户在调试里期待的 Cursor 式闭环。** 右栏 Canvas/Browser 点和选基建已合入；Agent 驱动同页 Browser、报告 Skill、三轴 UI 消歧都还没有。

| 用户现象 | 是否落地 | 根因（置信度） |
| --- | --- | --- |
| Work/Coding 与旧模式并存干扰 | 三轴**有意**落地，UI **未消歧** | `WorkspaceMode`（页头「工作/编程」）与 `agentMode`（新会话「工作模式」）共用同一对中文标签；`capabilityProfile` 无独立控件。切布局不改已开会话。高 |
| Browser 选的是根节点/整页图 | 点选基建落地，选区质量不足 | guest 不拒绝 `html`/`body`/铺满视口容器；裁剪按 boundingRect。高 |
| Agent 不能同时操作 Canvas + Browser | Canvas 工具可用；Browser 工具未挂 | Desktop 已注册 `artifact` host；**未**注册 `browser_tab` host（TASK-0063 仍 `ready`）。高 |
| 要报告/架构图不行 | 存储/预览可用；触发链缺失 | Work 提示词只讲聊天内 rendering card，不点名 `artifact`；无 report Skill；无聊天卡片/自动打开 Canvas；无 Mermaid/DAG 原语。高 |

### 1. Work / Coding：不是「没实现」，是三轴叠在同一文案上

ISSUE-0005 已裁决方案 C：`WorkspaceMode` 只管布局，`agentMode` 只管提示词，`capabilityProfile` 只管新会话默认工具。代码按此落地。

用户可见的干扰来自实现而不是「旧模式没删」：

- 页头 segmented：`workspace.mode.work/coding` =「工作 / 编程」。
- 新会话选项行：`agentMode.title` =「工作模式」，选项仍是「工作 / 编程」。
- 历史 `AgentModeSwitcher` / 设置入口已删（`agent-mode-entry-points.test.ts`），所以不是第三套开关，而是**两套同名轴**。
- 另有正交轴：`ConversationScenario`（conversation/project）、`executionMode`（sandbox/full-access）、`permissionMode`（plan）。

Work 四类 REQ-0001 流程也未齐：文档处理（TASK-0028）已接线；研究/数据（TASK-0025/0026）仍 `ready`；文件整理无 Work 面板入口且不在 work 默认工具白名单。

### 2. Canvas / Browser：服务和点选在，Agent 闭环缺一半

| 能力 | 状态 |
| --- | --- |
| Canvas store + `artifact` 工具 | Desktop 已接线 |
| Canvas tab（列表 / MD·代码 / HTML webview / 选区回引） | 已合入 |
| Browser 常驻 tab + picker + capsule | 已合入 |
| `browser_tab` 操作同一 WebView | **未实现**（合同与 tool stub 在，host 不注册 → 扩展贡献 0 个工具） |
| create 后聊天卡片 / 未读徽标 / 列表实时刷新 | 未实现 |
| Canvas HTML 内点选、console/network | PLAN-0007，未开始 |

因此 PLAN-0006 v1 五条演示里，**「点选 → 草稿 → Agent 同页 click/fill」整条失败**。用户点选后 Agent 只能读附件 JSON + 图，不能驱动当前页。CLI `agent-browser` 仍是另一会话（ADR-0129）。

### 3. Browser「像选了 BOM / 整页图」

guest 只处理 DOM `Element`，不序列化 JS `window`。用户看到的「BOM/整页图」更符合：

- `pickTarget` 接受任意元素，含 `html`/`body`；
- implicit role 在无 ARIA 时退回 **tag 名**（`html`/`body`/`div`）；
- `surroundingText` 取 parent `textContent`，根节点时接近整页；
- 截图按元素矩形裁剪，根节点 ≈ 视口截图。

这是选区质量缺陷，不是「没做元素选择」。见 [`BUG-0006`](../bugs/BUG-0006-browser-picker-root-element.md)。

### 4. Cursor 报告不是「随便写 HTML 再在三处打开」

官方 Canvas 合同（本机 Skill，与 docs/blog 一致）：

1. **触发看意图**：独立、可再打开的分析/审计/报告才建 Canvas；修代码、写回信、在已有 HTML 上改，不建。
2. **写一个受管文件**：`~/.cursor/projects/<workspace>/canvases/<name>.canvas.tsx`。
3. **只用第一方 SDK**：`import` 仅 `cursor/canvas`；内嵌数据；禁止 `fetch`/npm。
4. **组件库**：`Stack`/`Grid`/`Card`/`Table`/`BarChart`/`LineChart`/`PieChart`/`computeDAGLayout`/`DiffView`/`Callout`/`Stat`。
5. **聊天插入可点路径**；IDE 编译后在旁打开。
6. **Skill 教布局**：`docs-canvas` 明确「架构 walkthrough 用 DAG/Mermaid，不要扁平 Markdown」。

官方 Browser 是另一条一等工具面：navigate/click/type/scroll/screenshot，**同一应用内 WebView**；Design Mode（`Cmd+Shift+D`）把 xpath + Fiber props + 截图送进 Agent，用来改**正在跑的产品代码**，不是用来当报告容器。

Agents Window 把 Canvas、Browser、Terminal、源码并列为**并列工作面**，不是三个互相替代的 HTML 渲染器。

### 5. 文件 / Browser / Canvas 该怎么分工

不要让模型在三条路径里「猜该写到哪」。Cursor 与本仓库已有基建都指向：

```text
一份 artifact 文件（事实源）
    ├─ Canvas tab：报告/架构图的主表面（自动打开或聊天卡片）
    ├─ 文件预览：同一文件的源码/调试视图
    └─ Browser tab：只服务正在跑的页面（localhost / 第三方站）
```

| 表面 | 职责 | 谁写 | 谁读 |
| --- | --- | --- | --- |
| Canvas | 独立、可迭代的交付物 | Agent `artifact.create/update` | 用户审阅、选区回引 |
| 文件预览 | 同一文件的源 | 用户或 Agent `read`/`write` | 调试 HTML/Markdown |
| Browser | 活页面交互 | 用户导航 + `browser_tab` | snapshot/click/fill |

HTML **可以**在三个表面显示，但只能有 **一条生成路径**。v1 继续用现有 Canvas `<webview>` 渲染自包含 HTML/Markdown，不先做 Cursor 那套 `.canvas.tsx` 编译器。架构图用 HTML 内 Mermaid/SVG，或后续加 DAG 原语；不要让模型把图只画在聊天里或随便 `write` 到项目根。

详见 [`ISSUE-0011`](../issues/ISSUE-0011-report-architecture-surface.md)。

## 被否决的方案

- **把 `.vetd` 设计画布或 Cowart 白板当成报告 Canvas**：数据模型与「会话产出的报告」不同（RESEARCH-0005 / PLAN-0006 已否）。
- **让 Browser 当默认报告渲染器**：Browser 的会话、cookie、picker、审批是为活页面准备的；报告应落管理目录并进 Canvas 列表。
- **立刻仿造 `cursor/canvas` React SDK**：本仓库已有 HTML 沙箱与 `artifact` 工具；缺的是 Skill/提示词/聊天卡片/`browser_tab`，不是编译器。
- **用 `agentMode` 一个字段同时改布局、提示词和工具**：ISSUE-0005 已否；正确修法是 UI 消歧，不是推翻三轴。
- **把 CLI `agent-browser` 说成已与 Canvas 闭环**：ADR-0129 明确两套会话。

## 代码 / 测试 / 指标锚点

| 主题 | 锚点 |
| --- | --- |
| 布局模式 | `apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts` |
| 页头开关 | `apps/desktop/src/renderer/domains/workspace-mode/components/WorkspaceModeSwitcher.tsx` |
| 新会话提示词开关 | `apps/desktop/src/renderer/domains/conversation/components/new-session/AgentModeIconToggle.tsx` |
| 中文同名标签 | `zh/chat.json` `workspace.mode.*`；`zh/settings.json` `agentMode.*` |
| 提示词正文（无 artifact） | `apps/desktop/src/main/agent-modes/modes-data.ts` |
| work 工具白名单含 `artifact`/`browser_tab` | `packages/coding-agent/src/profiles/agent-profiles.ts` |
| Desktop 只挂 artifact host | `apps/desktop/src/main/agent-runtime/function-extension-source.ts` |
| picker 可命中任意 Element | `apps/desktop/src/main/browser-automation/webview-picker-guest.ts` `pickTarget` / `collect` |
| `artifact` 工具描述偏存储合同 | `packages/coding-agent/src/features/artifacts/artifact-tool-contract.ts` `ARTIFACT_TOOL_DESCRIPTION` |
| `browser_tab` 无 host 即不出现 | `packages/coding-agent/src/features/browser-tab/browser-tab-tool.ts` |
| Canvas 列表非实时 | `apps/desktop/src/renderer/domains/activity-panel` `useCanvasTabModel`（mount + visibilitychange） |

定向测试已覆盖 store/picker/capsule 合同，**没有**覆盖「用户说写报告 → Canvas 出现可打开卡片」或「Agent `browser_tab.click` 改变当前 WebView」。

## 失效条件与置信度

- 落地判断锚定 2026-09-24 工作树。TASK-0063 合入或 `function-extension-source` 注册 browser host 后，第 3 条「Agent 不能驱动 Browser」失效。
- Cursor 结论锚定当时官方文档与本机 `canvas` Skill；Skill/SDK 升级后组件表可能变。
- `docs-canvas` 仓库正文仍标 placeholder，以本机 `SKILL.md` 与 blog 为准。
- 未在本机对 Open Forge Desktop 做 `verify:ui:*`；用户现象按源码路径解释，不冒充实机验收。

## 下一步触发信号

产品确认 [`ISSUE-0010`](../issues/ISSUE-0010-dual-mode-switcher-interference.md) 与 [`ISSUE-0011`](../issues/ISSUE-0011-report-architecture-surface.md) 的推荐方案后，按下列顺序拆 Task（测试合同写在对应 ISSUE）：

1. 三轴 UI 消歧（一文案一轴，或新会话单一开关 + 会话徽标）。
2. 报告 Skill + 模式提示词点名 `artifact` + 聊天卡片打开 Canvas。
3. 做完 TASK-0063（`browser_tab` 同一 WebView）。
4. 修 BUG-0006（拒绝根节点 / 全视口选区）。
5. Canvas 列表订阅 artifact 事件；PLAN-0007 的 HTML 内点选后置。
