---
id: ISSUE-0011
type: issue
status: verifying
priority: P1
owner: product/runtime
related_requirement: [REQ-0001]
related_plan: [PLAN-0006, PLAN-0007]
related_tasks: [TASK-0028, TASK-0060, TASK-0061, TASK-0063, TASK-0074]
related_issues: [ISSUE-0006, ISSUE-0010]
related_bugs: [BUG-0006]
source: "user-request; RESEARCH-0006; Cursor official canvas/browser docs and first-party canvas skill"
created: 2026-09-24
updated: 2026-09-24
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 报告与架构图：单一生成路径，多表面只读投影

## 背景

用户在调试中主动要求报告、架构图，期望像 Cursor 一样出现可迭代的可视化交付物。HTML 理论上能在文件预览、Browser tab、Canvas tab 三处渲染，但当前既没有强制生成路径，也没有聊天入口把产物打开到主表面。

Cursor 官方做法不是「模型随便写 HTML 再让三个面板各渲染一次」，而是：

1. Skill 判断「这是独立分析交付物」才建 Canvas。
2. 写入受管目录的单一 artifact（官方为 `.canvas.tsx` + `cursor/canvas` SDK）。
3. 聊天插入可点卡片；IDE 编译后在旁打开。
4. Browser 仍是活页面工具面（测试/点选/改正在跑的 UI），不是报告容器。

证据索引见 [`RESEARCH-0006`](../research/RESEARCH-0006-cursor-agent-workspace-and-report-surfaces.md)。

## 已知事实

- Desktop 已有 `artifact` 工具与 `canvas/` 管理目录；Canvas tab 能渲染 Markdown/代码/隔离 HTML。
- Work/Coding 模式提示词只描述聊天内 rendering card / `md_intro`，不点名 `artifact` 或 Canvas tab。
- `ARTIFACT_TOOL_DESCRIPTION` 是存储合同（create/update/version），不是「用户要报告时必须调用」。
- Work 文档切片（TASK-0028）走右栏 Task 入口，普通 Chat 不自动升级（ISSUE-0006）。
- 仓库 Markdown 预览无 Mermaid；无 DAG 布局 SDK。
- `browser_tab` 宿主未注册；即使用户把 HTML 丢进 Browser，Agent 也不能操作同一页。
- Canvas 已打开时新 artifact 不会实时进列表。

## 未决问题

报告/架构图的主表面是 Canvas、文件预览还是 Browser？v1 作者合同是自包含 HTML，还是先做 Cursor 式 React Canvas SDK？普通 Chat 说「写一份架构图报告」是否必须走 `artifact`，还是继续允许纯 Markdown 回复？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
| --- | --- | --- | --- |
| A. 三表面等价，模型自选 `write` / Browser / `artifact` | 实现最少 | 调试里已经失败：模型常只回聊天 Markdown | 无稳定验收 |
| B. **单一写入 `artifact`，Canvas 为主表面**；文件预览同源；Browser 只开活 URL。v1 用现有 HTML/Markdown webview，Skill + 提示词 + 聊天卡片补齐触发 | 复用 0060/0061；对齐 Cursor 的「一份 artifact + 旁路打开」 | 没有第一方图表组件，架构图靠 Mermaid/SVG | HTML 质量依赖模型和沙箱 |
| C. 先做 `cursor/canvas` 同类 React SDK 再谈报告 | 长期最接近 Cursor | 编译器、组件库、热重载是新平台 | 继续拖延「现在就要报告」 |
| D. 报告默认写项目 HTML，用 Browser tab 打开 | 用户能看见页面 | 报告与第三方站点、cookie、picker 混会话；列表/版本不在 Canvas | 与 PLAN-0006 的 artifact 生命周期冲突 |

## 推荐

采用 **B**，分两段验证，不先做 C：

### 产品合同

```text
用户要报告 / 架构图 / 审计看板
  → Agent 必须 artifact.create（kind: document | analysis | research-evidence）
  → 文件落 canvas/<workspaceId>/
  → 聊天插入「在画布中打开」卡片（绝对路径或 artifactId）
  → Canvas tab 成为主表面；列表刷新或未读徽标
  → 用户选区回引 → artifact.update 出新版本
```

- 文件预览：同一 `uri` 的源视图，不是第二条生成路径。
- Browser：仅当用户或 Agent `navigate` 到已在跑的 http(s) 页；禁止把「生成报告」实现成「往 WebView 灌一段匿名 HTML 且不记 descriptor」。
- 普通 Chat 要报告 **不必** 升级 Task（ISSUE-0006）；文档 Task 入口继续服务「选本地文件 → 总结/导出」。

### v1 作者合同（HTML/Markdown，不是 React SDK）

- Markdown：长文报告、表格、结论。
- HTML：需要交互或图的报告；隔离 `<webview>`；无宿主 API。
- 架构图：自包含 HTML + 内联 SVG，或受控 Mermaid（CDN 或打进 guest，需安全审查）；不依赖尚未存在的 `render_chart` 对 work 会话可见。
- Skill `report-canvas` / `architecture-canvas`：trigger、章节模板、何时用 HTML 而非纯 MD、禁止只在聊天里贴图。
- 更新 `modes/*.md`：Work 默认走 artifact；Coding 在「架构审查/审计」时同样走 artifact，不把设计画布当报告。

### 明确后置

- Cursor 式 `.canvas.tsx` + 第一方组件库（方案 C）。
- Canvas HTML 内点选（PLAN-0007）。
- 共享发布链接。

## 决策

2026-09-24 产品确认方案 B。实施见 `TASK-0074`；同页 Browser 操作仍走 `TASK-0063`。不先做 React Canvas SDK。

## 决策触发条件

产品确认 B，或改选 C/D。确认前不要平行再做一套「聊天 plugin 报告卡」作为第二事实源。

## 后续可能拆出的 Task

1. 报告/架构 Skill + 模式提示词 + `artifact` 工具描述（何时必须 create）。
2. 聊天卡片 / Canvas 未读 / 列表订阅 `artifact.descriptor.recorded`。
3. 受控 Mermaid 或 SVG 架构图基线（可并入 1 的验收）。
4. 依赖 TASK-0063：若用户把报告页 `navigate` 到本机预览，Agent 才能同页操作。

## 测试合同（open-forge-testing；确认后写入 Task）

用户常见路径（必须能在回归时失败）：

- Given：Work 或 Coding 新会话，Canvas tab 可挂载；When：用户发送「根据当前仓库写一份架构报告，要有模块图」；Then：出现至少一次成功的 `artifact.create`；Canvas 列表可见该条目；聊天有打开入口；主表面渲染标题与图，而不是仅有一段聊天 Markdown。
- Given：已有 HTML artifact 在 Canvas 打开；When：用户选中一段说明并要求改结论；Then：草稿带 `vetta.canvas.artifact-selection`，`artifact.update` 产生新版本，旧版本仍可查。
- Given：同一 artifact；When：用户从文件预览打开该 `uri`；Then：看到同一文件内容，不另生成副本 descriptor。
- Given：用户只说「打开 https://example.com 看这个按钮」；When：Agent 工作；Then：走 Browser / 未来的 `browser_tab`，不为此创建报告 artifact。

边界：

- 无数据可画时不创建空 canvas（对齐 Cursor Skill：缺数据就问，不写空壳）。
- `browser_tab` 未挂载时，写报告路径仍必须成功（报告不依赖 Browser）。
