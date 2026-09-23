---
id: TASK-0061
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: serial
branch: task/TASK-0060-canvas-artifact-service
worktree: ..\open-forge-wt\TASK-0060-canvas-service
base_commit: task/TASK-0060-canvas-artifact-service
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/artifacts, packages/theme-ui, packages/plugins/presets/vetta-ui-design]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/shared/i18n, packages/plugins/presets/vetta-ui-design]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/builtins/index.ts]
depends_on: [TASK-0060]
conflicts_with: [TASK-0064, TASK-0027]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 内置 tab 与渲染器

## 目标

Activity Panel 新增常驻内置 `canvas` tab：workspace 级 artifact 列表（按来源会话分组）、Markdown/代码只读渲染、HTML 经 `<webview>` 沙箱交互预览、文本选区附加到草稿、缺失文件可恢复态、「保存到项目」入口；设计插件 tab 改名「设计画布」消歧。

## 范围

### 并发评估

- 结论：不支持与 TASK-0064 同时写 `builtins/index.ts`。用户要求接在 TASK-0060 当前树上串行完成。
- 执行方式：serial（当前 worktree）。
- 可并行 Task：TASK-0062、TASK-0063（不同目录）。
- 前置依赖：TASK-0060、TASK-0059。
- 冲突文件/独占路径：`builtins/index.ts`（与 0064 共享一行注册）。
- 集成负责人：coordinator。

### 做

- `canvas` builtin tab：常驻、`removable`、order 8（file 0 与 browser 15 之间）。
- 列表按来源会话分组；标题/kind/版本/时间/缺失/外部更新。
- Markdown/代码复用现有只读预览；HTML 走隔离 `<webview>`。
- 文本选区 → `promptAttachmentAtom`（`vetta.canvas.artifact-selection`）。
- 「保存到项目」选目录、冲突 toast、不覆盖。
- `vetta-ui-design` `tab.label` 改为「设计画布」/「Design canvas」。

### 不做

- Canvas 内直接编辑、HTML 内元素点选。
- Release Notes（coordinator / 首发号未定，候选文案留本文件）。

## Given / When / Then

- Given：会话中 Agent 产出了 Markdown artifact；When：用户打开 Canvas tab；Then：列表按会话分组显示该 artifact，点开渲染为只读 Markdown。
- Given：HTML artifact；When：用户打开预览；Then：在隔离 `<webview>` 中可交互运行，脚本无法访问宿主 DOM/Vetta API/Node。
- Given：artifact 文件被删除；When：列表/预览打开；Then：显示「文件缺失」可恢复态而非空白或崩溃。
- Given：项目里有 `.vetd` 设计稿；When：看标签栏；Then：「画布」与「设计画布」两个 tab 文案可区分。

## 必须保持

- 渲染只读 descriptor/文件投影，UI 不成为事实源。
- `<webview>` 沙箱：无 nodeIntegration、无特权 preload、导航一律拦截。
- 键盘可达、焦点与 aria 语义符合 DESIGN.md。

## 测试与验证

- 定向测试：tab meta/排序；列表分组与缺失态；选区 attachment；webview 沙箱属性；设计插件改名。
- 质量检查：组件测试 + check:quick。

## 交付记录

- 实际修改：
  - 内置 `canvas` tab（order 8，常驻，useMeta 不做内容门控）
  - Canvas 列表 / Markdown·代码只读预览 / HTML 隔离 webview / 选区附加草稿 / 保存到项目 / 删除确认
  - `vetta-ui-design` 活动 tab 标签改为「设计画布」
  - 补充 canvas i18n key（loading / kind / 外部打开确认 / 删除失败）
- 实际运行：
  - desktop canvas 单测/组件测 16 项通过（apps/desktop vitest）
  - `vetta-ui-design` `tab-label.test.ts` 通过
  - `bun run check:quick -- <本次文件>`：Biome 通过；guards 因既有 `@vetta/coding-agent/projects` 根 tsconfig path map 缺失失败（0061 未改该包）
- 未运行及原因：
  - 完整 `bun run check` / 类型全量：本轮以定向测试与 check:quick 为主
  - 真实 Electron webview E2E / `verify:ui:*`：用户未授权
  - 工作树里导入 `@shared/store/atoms` 会触发 Vite Denied ID（junction 指向主仓 lobehub 图标），组件测试对 atoms 做了边界 mock
- 剩余风险：
  - Canvas 已打开时 Agent 写入新版本，需离开再进入或等可见性变化才会刷新列表
  - 真实 guest 进程崩溃隔离只能由 Electron E2E 证明
  - 与 TASK-0064 集成时需串行合并 `builtins/index.ts` 一行

## 候选发布说明（首发号未定，阻断写入继承的 Vetta Release Notes）

画布页可以按会话查看助手产出的说明、网页预览和代码；网页在隔离环境里运行，选中的文字能直接挂到输入框，保存到项目时遇到同名文件不会覆盖。设计稿那个标签改叫「设计画布」，避免和通用画布混在一起。
