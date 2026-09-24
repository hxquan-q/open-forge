---
id: TASK-0098
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0009
source: PLAN-0009 决策索引（可视化选型：Phase 1 采用 recharts）
execution: serial
branch: forge/dev
worktree: unassigned（主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/conversation/components/blocks/tool-views, packages/skill-presets, docs/adr/0068-vetd-design-level-npm-dependencies.md]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, packages/skill-presets, apps/desktop/package.json]
exclusive_paths: [apps/desktop/package.json, apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasTabPanel.tsx]
depends_on: [TASK-0096]
conflicts_with: [TASK-0096, TASK-0097, TASK-0100]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0009]
related_tasks: [TASK-0096, TASK-0097, TASK-0099, TASK-0100]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 声明式原生组件库（Chart / Diff / Checklist）

## 目标

除 Markdown / 代码 / HTML 外，Canvas 直接渲染三类声明式 JSON 驱动的原生组件：时序与多维图表、结构化多文件 Diff、任务与实验 Checklist。模型输出结构化 JSON 即可获得高带宽呈现，不再依赖内联 HTML/SVG 或手写 `<table>`。

## 背景事实

- `CanvasPreviewKind` 现有三态（`canvas-preview-kind.ts:3`），本 Task 依赖 TASK-0096 已扩展出的判定结构。
- 复用资产已就位：`EditDiffView.tsx`（136 行，消费 `DiffPreviewView`）与 `parse-diff.ts` 提供完整 Unified Diff 解析与染色，**本 Task 只消费不重写**。
- `apps/desktop` 当前**没有任何图表 / 可视化运行时依赖**（全仓 `package.json` grep `recharts|d3|chart.js|echarts|victory|visx|nivo` 无命中）。
- `packages/skill-presets/src/` 已有 `architecture-canvas`、`report-canvas` 两个 canvas 类技能，是新增技能的模板。
- ADR-0068 记录 `recharts` 在共享 react 单例 alias 下可与宿主共用同一预打包 chunk（该结论在 `.vetd` 引擎 vite 配置下实测；`apps/desktop` 的 vite/electron 构建链需独立验证，**不可直接引用为已证明**）。

## 范围

### 并发评估

- **并发结论**：**条件支持**
- **执行方式**：serial（因独占 `CanvasTabPanel.tsx` 与 `apps/desktop/package.json`）
- **可并行 Task**：TASK-0099、TASK-0100（不触碰 Canvas 预览分支与 desktop 依赖清单）
- **前置依赖**：TASK-0096（kind 判定结构先行）
- **冲突文件/独占路径**：`CanvasTabPanel.tsx`（与 TASK-0097、TASK-0100 互斥）、`apps/desktop/package.json`（并行的依赖类 Task 会冲突）
- **Branch**：`forge/dev`
- **Worktree**：主工作区
- **集成负责人**：本 Task 执行者 / Coordinator
- **集成顺序**：TASK-0096 之后，与 TASK-0097 串行（二者都改 Canvas 容器）

### 做

- **依赖决策落地（先行步骤）**：按 PLAN-0009 决策索引 1 引入 `recharts`。引入前先实测打包体积增量并记录真实数字；若增量不可接受或依赖评审不通过，改用基于 `<svg>` 的极简自研渲染器，**契约保持不变**（仍消费 `application/vnd.vetta.chart+json`），仅替换实现。新增依赖须遵循 ADR 依赖规则并在 Release Notes 说明体积影响。
- **Chart**：识别 `application/vnd.vetta.chart+json`，契约支持 `line` / `bar` / `pie` / `area`；颜色与字体消费桌面端 CSS Token（`hsl(var(--primary))` 等），深浅主题切换无需重建组件。
- **Structured Diff**：识别 `contentType: "text/x-diff"` 或 `kind: "code-change"`，复用 `parse-diff.ts` + `EditDiffView` / `DiffPreviewView`，支持按文件折叠；在 Canvas 宽幅面板中展示多文件差异。
- **Checklist**：识别 `application/vnd.vetta.checklist+json`，渲染任务步骤 / 评测失败模式聚类 / 实验进展，含完成态与进行态。
- **接线**：在 `CanvasTabPanel.tsx` 的 `CanvasPreviewBody` 接入三个新分支，既有分支行为不变。
- **技能**：`packages/skill-presets/src/` 新增 `chart-canvas` 与 `review-canvas`，引导模型在对应场景输出结构化 JSON，并登记到 `skills-manifest.json`。
- **容错**：JSON 解析失败或契约字段缺失时降级为代码视图 + 明确提示，不白屏。
- 文案走 i18n。

### 不做

- 不做图表交互编辑、导出图片、数据联动钻取。
- 不重写 `parse-diff.ts` 或 `EditDiffView`，不做第二套 Diff 解析。
- 不改 `artifact` 工具 Schema。
- 不把图表渲染放进 `<webview>`。

## Given / When / Then

- Given：Agent 创建 `contentType: "application/vnd.vetta.chart+json"`、`type: "line"` 的 artifact
- When：用户在 Canvas Tab 打开
- Then：渲染为折线图；切换到深色主题后线色、坐标轴与网格颜色随之适配，无需重新打开

- Given：Agent 创建含多文件 Unified Diff 的 artifact
- When：用户在 Canvas 打开
- Then：按文件分组展示，可折叠单个文件，每个文件差异与源文本一致

- Given：Agent 创建 `checklist+json` 的 artifact
- When：用户打开
- Then：渲染为清单卡片，完成态与进行态可区分

- Given：artifact 声明了 `chart+json` 但内容是非法 JSON
- When：用户打开
- Then：降级为代码视图并给出明确提示，不白屏、不抛错到控制台

- Given：既有的 `text/markdown` artifact
- When：用户打开
- Then：渲染结果与本次改动前完全一致

## 必须保持

- `CanvasPreviewKind` 既有三态（加 TASK-0096 的 `data-grid`）判定与渲染结果不变。
- `parse-diff.ts` 与 `EditDiffView` 的行为与既有测试不变。
- `artifact` 工具 Schema、`CanvasArtifactService` 版本与存储逻辑不变。
- 未知 / 非法 contentType 仍能降级到 `code`，不出现白屏。
- `<webview>` 沙箱安全基线不变。

## 测试与验证

- **依赖影响**：记录 `recharts` 引入前后的 desktop 打包体积差值（真实测量值）。
- **定向测试**：
  - `canvas-preview-kind.test.ts`：三种新 contentType 与 `kind: "code-change"` 的映射，以及既有分支回归。
  - 组件测试：chart 四种图形渲染、主题切换后取色变化、checklist 完成态、diff 分组与折叠。
  - 容错测试：非法 JSON → 降级路径。
- **技能测试**：`packages/skill-presets` 内既有技能测试模式，验证两个新技能被 manifest 正确登记。
- **用户流程**：Agent 输出 chart artifact → Canvas 渲染 → 切换主题 → 颜色适配。
- **质量检查**：`bun run check`。
- **命令**：
  ```bash
  bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/services/canvas-preview-kind.ts
  bun run test:pkg skill-presets
  bun run check
  ```

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
