---
id: TASK-0097
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0009
source: PLAN-0009 决策索引（冲突策略：Phase 1 只拦截报错）
execution: serial
branch: forge/dev
worktree: unassigned（主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/artifacts, apps/desktop/src/shared, apps/desktop/src/preload, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store]
write_paths: [apps/desktop/src/main/artifacts, apps/desktop/src/shared/canvas-ipc.ts, apps/desktop/src/preload, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/shared/store]
exclusive_paths: [apps/desktop/src/shared/canvas-ipc.ts, apps/desktop/src/main/artifacts/canvas-artifact-service.ts, apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasTabPanel.tsx]
depends_on: [TASK-0096]
conflicts_with: [TASK-0096, TASK-0098, TASK-0100]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0009]
related_tasks: [TASK-0096, TASK-0098, TASK-0099, TASK-0100]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 双向编辑与选区快捷宏

## 目标

用户可在 Canvas 中直接编辑 Markdown / 代码 artifact 并保存，走与 Agent 完全相同的单调版本与乐观锁路径；同时在划选区上提供一等快捷宏操作，一键把结构化指令连同选区附件送入输入框。

## 背景事实

- `CanvasArtifactService` **没有公开的 `update()` 方法**：自增与乐观锁内联在 `invokeTool()` 的 `"update"` 分支（`apps/desktop/src/main/artifacts/canvas-artifact-service.ts:292-340`，辅助函数在 159-198 行区间）。用户写入通道必须先把这段抽成可复用方法，由 Agent 路径与 IPC 路径共同调用，**不得复制第二份写入实现**。
- `CANVAS_CHANNELS` 目前有 `LIST` / `GET` / `SAVE_TO_PROJECT` / `DELETE` 四个频道（`apps/desktop/src/shared/canvas-ipc.ts:6-11`），无 `UPDATE`。
- `stale_version` 已是 `DesktopCanvasErrorCode` 的既有成员（`canvas-ipc.ts:46`），也是 `ARTIFACT_TOOL_ERROR_CODES` 的成员——冲突反馈**不需要新增错误码**。
- `CanvasTabPanel.tsx` 全文 185 行，含局部组件 `CanvasPreview` / `CanvasPreviewBody`，编辑态 Toggle 落在此文件。
- 重渲染入口 `canvasArtifactRevisionAtom` 已存在（`apps/desktop/src/renderer/shared/store/canvas-atoms.ts`）。
- ADR-0129 §1 规定文件内容是事实源、descriptor 只经 `artifact.descriptor.recorded` 重建——用户写入必须沿用同一事件类型。

## 范围

### 并发评估

- **并发结论**：**不支持直接并发**
- **执行方式**：serial
- **可并行 Task**：无（本 Task 独占 IPC 合同、主进程服务与 Canvas 面板容器）
- **前置依赖**：TASK-0096（`canvas-preview-kind.ts` 与 `useCanvasTabModel.ts` 在其 write_paths 内，先行落地）
- **冲突文件/独占路径**：`canvas-ipc.ts`、`canvas-artifact-service.ts`、`CanvasTabPanel.tsx` 三者独占
- **Branch**：`forge/dev`
- **Worktree**：主工作区
- **集成负责人**：本 Task 执行者 / Coordinator
- **集成顺序**：TASK-0096 之后；与 TASK-0098 不可同时改 Canvas 容器

### 做

- **主进程重构（先行，行为保持）**：把 `invokeTool()` 的 `"update"` 分支抽成 `applyUpdate()` 一类可复用方法，Agent 工具路径改为调用它。这一步必须**先于**新增 IPC 通道完成，且以现有测试证明行为未变。
- **IPC 合同**：`canvas-ipc.ts` 增加 `CANVAS_CHANNELS.UPDATE` 与 `DesktopCanvasUpdateRequest`（`workspaceId` / `artifactId` / `baseVersion` / `content` / 可选 `title`）、`DesktopCanvasUpdateResult`（成功回 `ArtifactDescriptor`，冲突回 `stale_version`）。
- **主进程接线**：IPC handler 调用 `applyUpdate()`，成功后派发 `artifact.descriptor.recorded` 并重置 `externalUpdate: false`；`baseVersion` 落后或 checksum 不匹配一律 `stale_version`，不写入。
- **preload**：暴露对应通道，保持与既有 canvas 通道同构。
- **Renderer**：`CanvasPreview` 顶部增加「编辑 / 预览」Toggle；编辑态挂载受控编辑器（Markdown / 代码），支持光标打字与 `mod+s` 保存；保存成功后经 `canvasArtifactRevisionAtom` 热更新。
- **冲突 UX**：`stale_version` 时给出明确提示（内容已被 Agent 或外部更新）+ 刷新入口；**用户未保存的草稿不得静默丢弃**。
- **选区快捷宏**：划选文本 / 代码时浮动工具条增加宏操作——代码类（添加注释 / 添加日志 / 排查修复 / 生成单测），文档类（精简 / 扩充 / 润色）。点击后组装结构化指令 + `vetta.canvas.artifact-selection` 胶囊插入输入框。
- 文案全部走 i18n；快捷键（`mod+s`）进入既有可配置 keybinding 对象，不在业务逻辑写死。

### 不做

- **不做 3-way merge 或自动合并**（PLAN-0009 决策索引 2）。
- 不新增错误码、不新增事件类型、不建第二套版本或存储。
- 不改 `artifact` 工具的输入 / 输出 Schema（Agent 侧行为不变）。
- 不给 HTML / data-grid 预览提供就地编辑。

## Given / When / Then

- Given：Canvas 打开一个 Markdown artifact（`v3`），用户点击「编辑」
- When：用户修改文本并按下 `mod+s`
- Then：调用 `vetta.canvas:update`；版本变为 `v4`；历史 `v3` 文件仍在；Canvas 内容热更新；会话中出现对应的 `artifact.descriptor.recorded` 事实

- Given：用户正在编辑 `v3`，此时 Agent 已把该 artifact 更新到 `v4`
- When：用户保存
- Then：返回 `stale_version`，不写入文件；界面提示内容已被更新并提供刷新；用户未保存的编辑内容仍在编辑器中，不丢失

- Given：用户在代码 artifact 中划选一段函数
- When：点击浮动工具条的「添加日志」
- Then：输入框填入预设结构化指令，并附带指向该选区的 `vetta.canvas.artifact-selection` 附件

- Given：用户对只读的 HTML 或 data-grid artifact
- When：查看预览栏
- Then：不出现「编辑」开关

## 必须保持

- `invokeTool()` 的 Agent `update` 语义、错误码与事件派发顺序抽取前后完全一致（重构阶段必须有测试证明）。
- 单调版本递增与 SHA-256 乐观锁不变；任何写入路径都不得覆盖历史版本。
- `artifact.descriptor.recorded` 事件 Schema 与字段不变。
- 外部修改检测（watcher + 打开时比对 + `update` 前校验）行为不变。
- `CanvasArtifactService` 既有 IPC 通道（`LIST`/`GET`/`SAVE_TO_PROJECT`/`DELETE`）行为不变。
- ADR-0129 HTML 沙箱安全基线不变。

## 测试与验证

- **重构阶段（先行提交）**：现有 `canvas-artifact-service.test.ts` 全绿，证明抽取未改变行为；重构与新功能分两次提交。
- **定向测试**：
  - `canvas-artifact-service.test.ts` 扩展：`applyUpdate()` 的 `baseVersion` 落后、checksum 不匹配、成功自增、取消路径。
  - IPC 合同测试：`DesktopCanvasUpdateRequest` / Result 的类型与错误码。
  - 组件测试：Toggle 切换挂载 / 卸载编辑器、`mod+s` 触发保存、`stale_version` 提示出现且草稿保留、宏按钮生成附件。
- **用户流程**：打开 Markdown artifact → 编辑 → 保存 → 版本递增且历史可读；并发冲突拦截；宏操作填充输入框。
- **质量检查**：`bun run check`。
- **命令**：
  ```bash
  bun run test:impact -- apps/desktop/src/main/artifacts/canvas-artifact-service.ts
  bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasTabPanel.tsx
  bun run check
  ```

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
