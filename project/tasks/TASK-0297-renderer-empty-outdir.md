---
id: TASK-0297
type: task
status: done
priority: P3
owner: apps/desktop
requirement:
plan:
source: ISSUE-0021
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: [ISSUE-0021]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: d5f893329
read_paths:
  - apps/desktop/vite.config.ts
  - apps/desktop/scripts/desktop-packaging-layout.mjs
write_paths:
  - apps/desktop/vite.config.ts
exclusive_paths:
  - apps/desktop/vite.config.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# renderer 构建清理 outDir，消除安装包旧产物（ISSUE-0021 审计附带卫生项）

## 目标

ISSUE-0021 两轮产物审计期间实测：`dist/renderer/assets` 残留多代构建的旧哈希文件（双份 renderApp-*.js / brand-assets-*.js 等，总量约 2×）。`desktop-packaging-layout.mjs:22` 把 `dist/renderer` 整目录拷入安装包——**每代死产物都随安装器分发**。

根因是 `vite.config.ts` 的 `emptyOutDir: false`（git 考古：上游 `bd4848863` 时代随 outDir 迁移一起引入，无注释动机；Sentry 只读该目录上传 sourcemap，不注入存活文件）。同仓其余全部 vite 配置（main/preload/ocr-preload/ocr-runner）都清理自己的 outDir，preload 还有多入口保活逻辑；renderer 单次构建产出全部 5 个 HTML 入口，单次清理安全。

## 范围

### 并发评估

- 结论：不支持并行；serial；单行配置切片。

### 做

- `emptyOutDir: false` → `true`；验证：预置标记文件 → build:renderer → 标记与旧哈希文件被清除、当前构建产物完整。

### 不做

- 不动其余 vite 配置（已正确）；不做 dist 全局清理（各构建器各管各的子目录）。

## Given / When / Then

- Given：dist/renderer 存在旧哈希与任意标记文件，When：build:renderer，Then：构建前清空目录，仅留本次产物。

## 必须保持

- 五个 HTML 入口产物完整；hidden sourcemap（Sentry 路径）随每次构建重建。

## 测试与验证

- 产物验证（标记文件法）+ 完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（同仓配置对照 + git 考古）；集成：pending；人工验收：不适用；发布：未授权。

## 功能验收包

- 安装包不再携带旧构建死产物；无用户可见变化。

## 交付记录

- 实际修改：`vite.config.ts` 的 `emptyOutDir: false` → `true`（附两行注释记录动机与依据）。
- 实际运行：产物验证——预置 STALE-MARKER 后 build:renderer，标记被清除、renderApp/brand-assets 各只剩 1 份（原 2 份）、dist/renderer 文件总数 691 → 566（清除 125 个旧产物）；完整 `bun run check` exit 0。
- 未运行及原因：真实打包体积差待下一次正式打包（清理语义已由标记法证明）。
- Worktree：未拆出（单行配置切片）。
- 剩余风险：构建期间存在目录清空窗口（dev 流程本就重启后生效，打包链顺序执行无观察者）。
