---
id: TASK-0096
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0009
source: PLAN-0009 阶段实施划分（P0 原生 Data Grid）
execution: serial
branch: forge/dev
worktree: unassigned（主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, packages/coding-agent/src/features/artifacts, packages/runtime-core/src/task]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/shared/i18n/locales, packages/toolkit/src]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/services/canvas-preview-kind.ts, apps/desktop/src/renderer/domains/activity-panel/hooks/useCanvasTabModel.ts]
depends_on: []
conflicts_with: [TASK-0097, TASK-0098]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0009]
related_tasks: [TASK-0097, TASK-0098, TASK-0099, TASK-0100]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 原生 Data Grid 预览

## 目标

CSV / TSV / 行列 JSON 表格类 artifact 在 Canvas Tab 中以原生 React 表格渲染，具备表头固定、列头排序、全局过滤与轻量分页；用户可框选表格区域并走既有 Select-to-Ask 链路把选区作为附件送入草稿框。表格不再降级为 Markdown 表格或手写 HTML `<table>`。

## 背景事实

- `CanvasPreviewKind` 目前只有 `"markdown" | "html" | "code"`（`apps/desktop/src/renderer/domains/activity-panel/services/canvas-preview-kind.ts:3`），`resolveCanvasPreviewKind()` 在 12-28 行按 contentType / 文件名后缀判定，其余一律落到 `"code"`。
- 该判定函数有两个消费方：`useCanvasTabModel.ts`（180、439 行）与 `canvas-save-filename.ts`（扩展名推导）。扩展 preview kind 会同时影响「保存到项目」的默认文件名，需一并覆盖。
- `artifact` 工具契约已原生支持 `kind: "dataset"` / `"analysis"`，`contentType` 是开放字符串（`packages/coding-agent/src/features/artifacts/artifact-tool-contract.ts:31-39`）——**本 Task 不改工具 Schema**。
- 仓库内没有任何 CSV 解析实现（全仓 grep `csv` 仅命中文档说明、文件图标、剪贴板转义），需新增。
- Select-to-Ask capsule 合同已存在：`CANVAS_ARTIFACT_SELECTION_SCHEMA = "vetta.canvas.artifact-selection"`（`activity-panel/services/canvas-selection-attachment.ts:5`）。
- 预览容器是 `CanvasTabPanel.tsx` 内的局部组件 `CanvasPreview` / `CanvasPreviewBody`（全文 185 行），不是独立文件。

## 范围

### 并发评估

- **并发结论**：**条件支持**
- **执行方式**：serial，本 Task 先行
- **可并行 Task**：TASK-0099、TASK-0100（不触碰 Canvas 预览分支）
- **前置依赖**：无（PLAN-0006 已完成）
- **冲突文件/独占路径**：`canvas-preview-kind.ts`、`useCanvasTabModel.ts` 为本 Task 独占；TASK-0097 与 TASK-0098 都依赖本 Task 的 kind 扩展先行落地，故 `conflicts_with` 双向声明
- **Branch**：`forge/dev`
- **Worktree**：主工作区（先行任务，无并行冲突）
- **集成负责人**：本 Task 执行者 / Coordinator
- **集成顺序**：第一位；本 Task 合并后 TASK-0097 / TASK-0098 才可开工

### 做

- 扩展 `CanvasPreviewKind` 增加 `"data-grid"`，并在 `resolveCanvasPreviewKind()` 中按 `contentType`（`text/csv`、`text/tab-separated-values`、`application/vnd.vetta.data-grid+json`）与 `.csv` / `.tsv` 后缀映射。
- 新增 `canvas-preview-kind.test.ts` 用例覆盖新分支，并确认 `canvasPreviewExtension()` 对 `data-grid` 返回合理扩展名（`.csv` / `.json`），避免影响「保存到项目」默认文件名。
- 新增轻量 RFC 4180 CSV / TSV 解析器，放在可被单测直接覆盖的纯函数模块（候选位置 `packages/toolkit/src`，需先确认该包是否已有表格类工具；无则落在 `activity-panel/services/`，保持与 `canvas-preview-kind.ts` 同层）。解析器需处理引号包裹、字段内换行、`""` 转义、CRLF。
- 新增 `CanvasDataGridPreview.tsx`（与 `CanvasTabPanel.tsx` 同目录），实现表头固定、列头三态排序（升序 / 降序 / 默认）、全局过滤输入框、20/50/100 行分页。
- 在 `CanvasTabPanel.tsx` 的 `CanvasPreviewBody` 中接线 `"data-grid"` 分支，data-grid 之外的 kind 行为不变。
- 表格选区接入 Select-to-Ask：生成 `vetta.canvas.artifact-selection` 附件写入草稿框，附带行列范围摘要文本。
- 全部新增用户可见文案走 i18n（表头按钮、分页、过滤 placeholder、aria 属性）。

### 不做

- 不做公式引擎、单元格编辑、拖拽填充、冻结列、聚合统计等电子表格能力。
- 不改 `artifact` 工具 Schema，不新增 `kind` 枚举值。
- 不改 `CanvasArtifactService` 的版本与存储逻辑。
- 不接管 HTML 预览路径；未知类型仍按现有规则落 `"code"`。

## Given / When / Then

- Given：Agent 通过 `artifact` 工具创建 `kind: "dataset"`、`contentType: "text/csv"`、含 1000 行 × 10 列的 artifact
- When：用户在 Canvas Tab 中打开该 artifact
- Then：渲染为原生表格，表头在滚动时固定；点击列头可升序 / 降序 / 还原默认；过滤框输入关键词后行数即时收窄；分页可切换 20/50/100；滚动无掉帧

- Given：data-grid 已渲染
- When：用户框选若干行并触发「追问选区」
- Then：草稿框收到一条 `vetta.canvas.artifact-selection` 附件，含 artifactId、版本与行列范围摘要；发送后 Agent 可读到该范围

- Given：artifact 的 `contentType` 是既有的 `text/markdown`
- When：用户在 Canvas Tab 打开
- Then：仍走 Markdown 渲染，预览分支与既有行为完全一致

## 必须保持

- `artifact` 工具输入 / 输出 Schema 与错误码不变。
- `CanvasArtifactService` 单调版本递增与 SHA-256 乐观锁不变。
- 既有 `markdown` / `html` / `code` 三条预览路径行为与渲染结果不变。
- `canvasPreviewExtension()` 对既有 kind 的返回值不变（「保存到项目」默认文件名不能回归）。
- `<webview>` HTML 沙箱的安全基线不变，data-grid 不引入任何 webview。
- `vetta.canvas.artifact-selection` capsule 结构与既有字段兼容。

## 测试与验证

- **定向测试**：
  - `canvas-preview-kind.test.ts`：新增 contentType 与后缀映射、既有 kind 回归、`canvasPreviewExtension` 对 data-grid 的返回。
  - CSV 解析器单测：引号包裹、字段内换行、`""` 转义、CRLF、空字段、列数不齐的容错。
  - `CanvasDataGridPreview` 组件测试：渲染行数、列头排序三态、过滤后行数、分页切换、选区生成附件。
  - `CanvasTabPanel.test.tsx`：`data-grid` 分支接线，其余 kind 不回归。
- **用户流程**：Agent 创建 CSV artifact → Canvas 打开 → 排序 → 过滤 → 框选 → 草稿框出现选区胶囊。
- **性能基线**：1000 行 × 10 列解析耗时记录为可重复断言项（目标 <16ms，若实测超出则记录真实值并在交付中说明，不虚构达标）。
- **质量检查**：`bun run check`。
- **命令**：
  ```bash
  bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/services/canvas-preview-kind.ts
  bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasDataGridPreview.tsx
  bun run check
  ```

## 交付记录

- 实际修改：
  - `services/canvas-preview-kind.ts`：`CanvasPreviewKind` 增加 `"data-grid"`，`canvasPreviewExtension()` 对 data-grid 返回 `.csv` / `.tsv` / `.json`；既有 html / markdown / code 判定顺序与返回值不变。
  - `services/canvas-data-grid.ts`（新增）：格式判定、RFC 4180 CSV / TSV 状态机、行列 JSON 解析、过滤 / 三态排序 / 分页视图，全部为纯函数。
  - `services/canvas-selection-attachment.ts`：`CanvasArtifactSelectionPayload` 增加可选 `range`，既有字段不变。
  - `components/canvas-tab/CanvasDataGridPreview.tsx`（新增）：表头固定、列头三态排序、筛选框、20/50/100 分页、单元格划选回传文本与行列范围。
  - `components/canvas-tab/CanvasTabPanel.tsx`：`CanvasPreviewBody` 接线 `"data-grid"` 分支，其余 kind 不改。
  - `hooks/useCanvasTabModel.ts`：`dataGridFormat`、data-grid 文案、`onDataGridSelectionChange`、附件 `range` 组装。
  - `shared/i18n/locales/{zh,en}/chat.json`：`activityPanel.canvas.kindDataGrid` 与 `activityPanel.canvas.dataGrid.*`。
  - 测试：`canvas-data-grid.test.ts`（新增）、`CanvasDataGridPreview.test.tsx`（新增）、`canvas-preview-kind.test.ts` / `canvas-save-filename.test.ts` / `canvas-selection-attachment.test.ts` / `CanvasTabPanel.test.tsx`（扩展）。
  - `.github/release-notes/v0.1.1.md` 新增「新增」小节条目。
- 关键决策与依据：
  - **解析器落点**：`packages/toolkit` 现无表格类工具，且其 `AGENTS.md` 声明 toolkit 是 Node 工具集、不得引入 renderer 运行时；renderer 也从未依赖过该包。因此解析与视图逻辑落在 `activity-panel/services/canvas-data-grid.ts`，与 `canvas-preview-kind.ts` 同层，未改动 workspace 导出与构建分层。
  - **`.json` 不升级为表格**：普通 `application/json` / `.json` 必须继续走代码预览（既有行为），只有显式 `application/vnd.vetta.data-grid+json` 才是行列 JSON 表格；`text/csv; charset=utf-8` 这类带参数 contentType 按规范化后的 MIME 判定。
  - **行列 JSON 合同**：接受 `{ columns, rows }`（cells 允许非字符串，按文本投影）与「数组的数组」（首行表头）；结构不符或解析失败返回空表，由组件渲染空状态。
  - **范围摘要**：新增可选 `range` 字段而不是把范围塞进 `excerpt`；`PluginPromptContext` 的 JSON 守卫会拒绝 `undefined` 值，因此无范围时整体省略该字段。
  - `write_paths` 增补 `apps/desktop/src/shared/i18n/locales`：本 Task 明确要求新增文案走 i18n，原声明遗漏；TASK-0083 / TASK-0102 曾以独占方式声明同一 chat.json，但二者均为主工作区串行任务且各自改动已落地，本次只在 canvas 段新增 key。
- 实际运行：
  - 定向测试（cwd `apps/desktop`，`bun ../../scripts/quality/run-vitest.mjs --run …`）：`canvas-data-grid.test.ts`(17)、`CanvasDataGridPreview.test.tsx`(8)、`canvas-preview-kind.test.ts`(4)、`canvas-save-filename.test.ts`(3)、`canvas-selection-attachment.test.ts`(3)、`CanvasTabPanel.test.tsx`(5)，共 6 个文件 40 个用例全部通过。
  - 关联测试 `run-vitest.mjs related <4 个源文件> --run`：29 个文件 137 个用例全部通过，确认使用这些模块的既有测试（plugin runtime、activity panel、conversation 等）无回归。
  - 性能基线：1000 行 × 10 列 CSV 解析三次实测 1.59ms / 1.61ms / 2.07ms（末次在并发负载下），产品目标 <16ms 达标；断言阈值取 50ms 只守数量级回归。
  - `node node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json`（删除 tsbuildinfo 后全量重跑）：EXIT=0，无诊断输出。
  - `bun run check:guards`：全部 guard 通过（含 `task-worktrees` 合同 102 个 task / 0 warning）。
  - `biome check --write`（本次改动文件）：通过，无残留告警。
- 未运行及原因：
  - 未运行 `verify:ui:*`：本任务未获得 UI 实机验证授权；表头固定、滚动与划选属于真实渲染行为，组件测试覆盖了事件接线与可见结果，但滚动帧率未做真机测量。
  - 未运行完整 `bun run check`：`check:types` 的 root `tsgo`、cli、docs、mobile 与 `check:lint` 全仓扫描与本次改动无交集，已单独执行 biome、guards 与 desktop 全量 tsc 覆盖受影响面。
- 剩余风险：
  - 表格列很宽或单元格极长时，`max-w-[320px]` + `truncate` 只保证不撑破布局，未做列宽拖拽（属「不做」项）。
  - 行列 JSON 只覆盖 `{ columns, rows }` 与数组的数组；对象数组（`[{a:1},{a:2}]`）会落到空状态，如需支持须由产生方改 contentType 合同。
  - 划选仍建立在浏览器原生选区之上，跨分页选择不会自动拼接（与既有文本预览一致）。
- 并发与分支说明：任务声明的 `branch: forge/dev` 已是当前 `main` 的祖先，本次交付在主工作区当前分支完成；`conflicts_with` 的 TASK-0097 / TASK-0098 尚未开工，`exclusive_paths` 两个文件只被本 Task 修改，无并行写入。

