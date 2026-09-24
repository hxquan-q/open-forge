---
id: PLAN-0009
type: plan
status: draft
priority: P1
requirement: REQ-0001
owner: apps/desktop
created: 2026-09-24
updated: 2026-09-24
depends_on: [PLAN-0006]
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 架构演进：原生 Data Grid、高带宽组件库、直接双向编辑与实时试跑

## 背景与目标

在 PLAN-0006 与 ADR-0129 确立的通用 Canvas 体系中，桌面端已在右侧 Activity Panel 建立了 `文件 / Canvas / Browser / Terminal` 四大核心工作台。当前 Canvas 实现了会话/任务双生命周期、单调版本自增、本地文件事实源、基于 `<webview>` 的 HTML 强安全沙箱，以及基于 `vetta.canvas.artifact-selection` 的划选追问（Select-to-Ask）闭环。

针对当前竞品（Cursor Canvas 3.1、OpenAI Canvas、Gemini Canvas、Tencent WorkBuddy）的深度调研，现有实现在“信息呈现带宽”与“人机协同自由度”上存在若干明确痛点：
1. **表格类产物严重降级**：CSV、Excel 等数据表格当前只能降级为排版易崩塌的 Markdown 表格，或手写 HTML `<table>` 塞入 `<webview>`，缺乏原生分页、排序、表头冻结与过滤能力；
2. **可视化组件拼装成本高**：除 Markdown/代码外，依赖内联 HTML/SVG（如 `architecture-canvas`），缺乏开箱即用的时序图表、逻辑 Diff 与任务清单等结构化原生组件；
3. **协同链路长且纯只读**：Select-to-Ask 属于间接协同（用户划选标注 → Agent 全量或差分重写），对于拼写纠正或局部参数微调成本过高，且缺乏一键微调的快捷宏操作；
4. **HTML 产物隔离过度导致无法交互试跑**：`<webview>` 强沙箱拦截所有网络与跳转，导致 Agent 生成的 Web 原型或动态数据图表无法作为实时应用进行交互；
5. **缺少跨文件变更总览**：版本控制精细到单个 artifact，但用户在将整个任务成果「保存到项目」前，缺少全局的变更差异审查视图。

**核心目标**：在**严格遵循 ADR-0129、复用现有 `artifact` 工具契约、继承 `<webview>` 安全基线、保持 Select-to-Ask 协议**的前提下，分阶段引入原生 Data Grid、高带宽组件库、直接双向编辑与实时试跑能力。

---

## 当前事实与约束

1. **渲染分支事实**：
   [`canvas-preview-kind.ts`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/renderer/domains/activity-panel/services/canvas-preview-kind.ts) 目前仅支持 `"markdown" | "html" | "code"` 三种 `CanvasPreviewKind`。
2. **工具与元数据事实**：
   [`artifact-tool-contract.ts`](file:///c:/Users/xquan/Desktop/open-forge/packages/coding-agent/src/features/artifacts/artifact-tool-contract.ts) 的 `ArtifactCreateInputSchema` 中，`kind` 已原生支持 `"dataset"` 与 `"analysis"`，`contentType` 为开放字符串。
3. **版本控制事实**：
   [`CanvasArtifactService`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/main/artifacts/canvas-artifact-service.ts) 已具备单调自增 `version`、`baseVersion` 校验与 SHA-256 Checksum 乐观锁机制，能天然拦截外部修改冲突（`stale_version`），但当前仅通过 Agent 工具调用 `update`，缺少前端用户直接触发的 IPC 通道。
4. **安全与沙箱事实**：
   [`CanvasHtmlSandbox`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasHtmlSandbox.tsx) 基于独立进程 `<webview>`，默认 CSP deny、禁用 Node/window.vetta；内置 Browser Tab 遵循 ADR-0129 仅接收 HTTP/HTTPS 页面，禁止向 Browser 注入匿名 HTML。
5. **已有组件资产**：
   [`EditDiffView.tsx`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/renderer/domains/conversation/components/blocks/tool-views/EditDiffView.tsx) 与 [`parse-diff.ts`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/renderer/domains/conversation/components/blocks/tool-views/shared/parse-diff.ts) 已经具备完整、高性能的 Unified Diff 解析与染色渲染能力。

---

## 架构方案与模块设计

```text
               ┌────────────────────────────────────────────────────────┐
               │              Activity Panel (右侧活动面板)              │
               │   [ 文件(file) | 画布(canvas) | 浏览器(browser) | 终端(terminal) ]   │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │   Canvas 产物与总览    │                     │   Browser / Terminal   │
     │ ┌────────────────────┐ │                     │ ┌────────────────────┐ │
     │ │ [产物列表] [变更总览]│ │                     │ │  本地回环实时预览   │ │
     │ └─────────┬──────────┘ │                     │ │ (http://127.0.0.1) │ │
     └───────────┼────────────┘                     └──────────┬─────────────┘
                 │                                             ▲
     ┌───────────┴─────────────────────────────┐               │
     │            Canvas 渲染管道              │               │
     │ ┌───────────────┐     ┌───────────────┐ │ 一键试跑      │
     │ │   Markdown    │     │   Code View   │ │ (Open in Tab) │
     │ │ (可直接双向编) │     │ (可直接双向编) │ ├───────────────┘
     │ ├───────────────┤     ├───────────────┤ │
     │ │ 原生Data Grid │     │ 原生组件/Diff │ │
     │ │ (CSV/Excel/表)│     │ (图表/Check)  │ │
     │ ├───────────────┴─────┴───────────────┤ │
     │ │     兜底: <webview> HTML 强沙箱     │ │
     │ └─────────────────────────────────────┘ │
     └─────────────────────────────────────────┘
```

### 1. P0：补齐原生 Data Grid（表格预览与交互）

#### 契约与协议
* **零 Schema 破坏**：继续沿用现有 `artifact` 工具契约。Agent 生成表格产物时声明：
  * `kind`: `"dataset"` 或 `"analysis"`；
  * `contentType`: `"text/csv"`、`"text/tab-separated-values"` 或 `"application/vnd.vetta.data-grid+json"`；
  * `content`: 纯 CSV/TSV 文本，或标准行列 JSON 对象（包含 `columns` 与 `rows`）。
* **类型映射（`canvas-preview-kind.ts`）**：
  扩展 `CanvasPreviewKind = "markdown" | "html" | "code" | "data-grid"`。
  识别到 `.csv`、`.tsv` 扩展名或上述 `contentType` 时，统一映射为 `"data-grid"`。

#### 渲染与交互实现
* 新增 `CanvasDataGridPreview.tsx`，运行于 Renderer 原生 React 树中，避免 `<webview>` 沙箱的高内存与进程隔离通信损耗；
* **功能边界（V1 严守范围）**：
  * **快速数据验证**：支持表头固定（Sticky Header）、列宽自适应与内容截断 Tooltip；
  * **交互操作**：点击列头排序（升序 / 降序 / 默认）、全局快速过滤输入框（Filter Input）、轻量分页（20 / 50 / 100 行）；
  * **内置极速解析**：轻量级 RFC 4180 CSV 解析，解析耗时在常见千行数据内低于 16ms。
* **与 Select-to-Ask 机制无缝衔接**：
  * 允许用户点击行选择器或多选单元格，点击“追问选区（Select to Ask）”；
  * 生成结构化表格摘要（例如：`[表格选区：第 2~5 行数据，对应 2026-Q1 指标]`），作为 `vetta.canvas.artifact-selection` 附件插入对话草稿框。

---

### 2. P1：扩展原生高带宽组件库（时序图表、结构化 Diff、Checklist）

在 `<webview>` 兜底沙箱之上，提供一套以标准声明式 JSON 驱动的原生 UI 组件层：

#### 声明式协议定义
1. **时序与多维图表（Chart Component）**：
   * `contentType`: `application/vnd.vetta.chart+json`；
   * 采用极简可视化契约（支持 `line`、`bar`、`pie`、`area`），颜色和字体直接消费桌面端全局 CSS Token（`hsl(var(--primary))` 等），深浅主题无缝适配。
2. **结构化 Diff 审查组件（Structured Diff View）**：
   * `contentType`: `text/x-diff` 或 `kind: "code-change"`；
   * 直接复用现有 `parse-diff.ts` 与 `DiffPreviewView`，支持在 Canvas 宽幅面板中全览多文件或复杂算法重构差异，支持按文件折叠与按语法高亮。
3. **任务/实验清单卡片（Checklist View）**：
   * `contentType`: `application/vnd.vetta.checklist+json`；
   * 用于呈现长时任务执行步骤、评测任务（Eval）失败模式聚类与 Autoresearch 优化实验进展。

#### 配套内置技能（Skills）
* 拓展 `packages/skill-presets/`，新增 `chart-canvas` 与 `review-canvas` 技能，引导模型在对应场景主动输出结构化 JSON 规范，取代低带宽纯文本。

---

### 3. P1~P2：从「划选追问」走向「直接双向编辑」与「快捷宏操作」

#### 直接双向编辑模式（In-place Co-editing）
* **架构可行性证明**：
  ADR-0129 已在主进程存储层实现了基于 `artifactId + baseVersion` 和 SHA-256 校验的自增版本状态机。用户手动修改只是写入者身份由 Agent 变为用户，底层版本流转完全一致。
* **IPC 通道扩充**：
  在 [`canvas-ipc.ts`](file:///c:/Users/xquan/Desktop/open-forge/apps/desktop/src/shared/canvas-ipc.ts) 中增加 `CANVAS_CHANNELS.UPDATE`：
  ```typescript
  export interface DesktopCanvasUpdateRequest {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly baseVersion: number;
    readonly content: string;
    readonly title?: string;
  }
  ```
* **主进程实现**：
  `CanvasArtifactService.update()` 复用现有单调自增逻辑，成功后派发 `artifact.descriptor.recorded` 会话事实，写入新版本并自动重置 `externalUpdate: false`。
* **Renderer 交互**：
  * 在 `CanvasPreview` 顶部增加「编辑 / 预览」Toggle 开关；
  * Markdown / Code 类型在编辑模式下挂载受控编辑器，支持直接光标打字与快捷键保存（`mod+s`）；
  * 保存时调用 `vetta.canvas.update()`，通过 `canvasArtifactRevisionAtom` 触发静默热更新。

#### 选区快捷宏操作（Macro Shortcuts）
* 对标 OpenAI Canvas，在用户划选文本/代码时的浮动工具条中，增加一等宏操作入口：
  * **代码类**：添加注释（Add Comments）、添加日志（Add Logs）、排查修复 Bug（Fix Bugs）、生成单测（Generate Tests）；
  * **文档类**：精简长度（Make Shorter）、详细扩充（Make Longer）、文字润色（Polish）。
* **驱动机制**：
  点击宏操作直接组装结构化用户指令，连同当前选区生成的 `vetta.canvas.artifact-selection` 胶囊插入输入框并自动触发发送，减少用户的提示词书写负担与理解不确定性。

---

### 4. P2：打通「实时试跑」（Canvas -> Browser Tab 联动）

#### 业务目标
针对静态页面、Web 原型等 HTML artifact，提供一键跳转至完整浏览器中交互运行的能力，克服 `<webview>` 沙箱在 `connect-src`、外链跳转和多媒体方面的限制。

#### 协同路径与安全设计
1. **本地回环伺服**：
   * 主进程静态资源模块将 `canvas/<workspaceId>/<artifactId>/` 目录以安全只读方式挂载至本地临时回环端口：
     `http://127.0.0.1:<port>/canvas/<workspaceId>/<artifactId>/index.html`；
   * 严格遵守 ADR-0129 与 `assertAllowedBrowserUrl`（必须为合法 HTTP/HTTPS URL）。
2. **一键切入体验**：
   * 在 HTML 产物预览栏增加「在浏览器打开 (Open in Browser)」按钮；
   * 点击触发 `openUrlInActivityWorkspaceAtom`，无缝激活并切换到右栏内置 `browser` Tab，地址栏自动载入本地回环地址。
3. **闭环微调联动**：
   * 页面在 Browser Tab 运行后，用户可随时使用已有的快捷键 `mod+shift+d`（元素选取器）点选页面控件，抓取 DOM/CSS 上下文胶囊送回 Agent，驱动 Agent 修改源码并在 Canvas 产生新版本。

---

### 5. P2：跨文件/任务变更总览（Task Changes Overview）

#### 顶层 Tab 评估结论
* **坚决不新增第 5 个顶层 Tab**。维持 `file / canvas / browser / terminal` 的精简心智模型；
* 将变更总览作为 **Canvas Tab 内部的一级分段控制器（Segmented Control）**。

#### 交互与数据流
* 顶部切换栏：`[ 产物列表 (Artifacts) ] | [ 任务变更 (Changes N) ]`；
* **数据源**：
  从当前活跃 Session 的工具调用历史（`edit_file`、`write_to_file`、`artifact.update`）中提取所有包含 `uiDetails.diff` 的变更记录，按文件聚合为最新的累计变更；
* **UI 布局**：
  * 上半区展示变动文件列表（路径、文件增删改状态、`+加行 / -删行` 徽标）；
  * 下半区直接复用 `EditDiffView` 与 `DiffPreviewView`，展示选定文件的 Unified Diff；
* **批处理动作**：
  顶部提供「一键全部保存到项目」与「取消/放弃全部变更」按钮，满足用户在结束长对话任务时的完整审查与验收诉求。

---

## 阶段实施划分（Task DAG）

```text
TASK-0091: P0 原生 Data Grid 预览（serial，先行）
    ├─ TASK-0092: P1~P2 直接双向编辑与快捷宏操作（Canvas 写入通道与 UI）
    ├─ TASK-0093: P1 原生声明式组件库（Chart / Diff / Checklist）
    ├─ TASK-0094: P2 Canvas 到 Browser Tab 实时试跑（回环伺服与联动）
    └─ TASK-0095: P2 任务级跨文件变更总览（Session Diff 聚合面板）
```

* **TASK-0091**：Data Grid 合同扩展、`CanvasDataGridPreview` 组件、CSV 极速解析、单元测试；
* **TASK-0092**：`vetta:canvas:update` 主进程/Preload 接入、Monaco/文本直接编辑态、选区快捷宏气泡；
* **TASK-0093**：声明式 Chart/Checklist 渲染器接入、`chart-canvas` 预设技能；
* **TASK-0094**：本地安全回环服务、Canvas 顶部跳转接线、Browser 选取器回归验证；
* **TASK-0095**：会话 Diff 聚合器、Canvas 分段切换视图、批量保存逻辑。

---

## 不做什么（明确边界）

1. **不做重型在线电子表格编辑器**：P0 Data Grid 聚焦于“数据完整度快速核对与排序筛选”，不实现公式引擎、单元格拖拽填充、图表就地制作等 Excel 级重型能力；
2. **不降低 `<webview>` HTML 沙箱安全基线**：预览不可信 HTML 必须保持无特权、无 Node、CSP deny；真正需要网络与高级运行时的场景显式走 Browser Tab 回环；
3. **不在 Activity Panel 顶层新增第五个 Tab**：避免侧边栏碎片化与空间拥挤；
4. **不创建第二套存储与版本机制**：双向编辑产生的变更严格走 `CanvasArtifactService.update()`，单调版本递增与 SHA-256 乐观锁保持不变。

---

## 验证与验收标准

1. **P0 Data Grid 验收**：
   * 包含 1000 行的 CSV 产物在 Canvas 中秒级渲染，无白屏与掉帧；
   * 列头排序、文本快速过滤正常工作；
   * 框选单元格后点击 Select-to-Ask，Prompt 输入框准确收到选区文本胶囊。
2. **P1 组件库验收**：
   * 输出 `chart+json` 时准确渲染折线图/柱状图，跟随桌面浅色/深色主题切换颜色；
   * 结构化 Diff 视图准确对齐文件级差异。
3. **P1~P2 双向编辑验收**：
   * 在 Markdown/Code 画布中直接打字修改并保存，版本号由 `vN` 变为 `vN+1`，不覆盖旧文件；
   * 出现外部编辑时，正确拦截冲突并提示「外部更新」；
   * 点击快捷宏按钮（如“添加调试日志”），输入框自动填充预设 Prompt 并附带选区附件。
4. **P2 实时试跑验收**：
   * HTML 产物点击「在浏览器打开」，Browser Tab 立即激活并加载回环 URL；
   * 在 Browser 中使用 `mod+shift+d` 能准确拾取 DOM 元素并返回给 Agent。
5. **P2 变更总览验收**：
   * 一个修改了 3 个文件的任务完成后，切换到「任务变更」能准确展示 3 个文件的累计 Diff 与加减行统计。

---

## 需要的 ADR

* 本计划原则上在现有 **ADR-0129** 允许的语义框架内演进；
* 若在实施 P2 实时试跑时确需为本地回环伺服或协议形式确立架构规范，将新增记录为 **ADR-0130（Canvas 本地试跑回环伺服与双向编辑契约）**。
