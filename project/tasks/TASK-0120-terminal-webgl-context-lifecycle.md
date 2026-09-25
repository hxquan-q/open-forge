---
id: TASK-0120
type: task
status: ready
priority: P3
owner: apps/desktop
requirement:
plan:
source: BUG-0034 现场测试观察
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs:
  - BUG-0034
execution: serial
branch:
worktree:
base_commit:
read_paths:
  - apps/desktop/src/renderer/domains/bottom-panel/**
  - apps/desktop/src/renderer/shared/store/bottom-panel-layout.ts
write_paths:
  - apps/desktop/src/renderer/domains/bottom-panel/**
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 终端 leaf 的 WebGL context 生命周期对齐，消除分屏/重开时的 context 积累

## 目标

底部面板终端 leaf 的 xterm `WebglAddon`（或等价渲染后端）创建与释放
严格跟随 leaf 生命周期：活跃 leaf 数 = 活跃 WebGL context 数，
关闭/隐藏/会话切换不残留、不重复创建。

## 范围

### 并发评估

- 结论：支持
- 执行方式：serial（单 Task 内串行即可，无并行拆分必要）
- 可并行 Task：与 UI 无关模块的 Task 均可并行
- 前置依赖：无
- 冲突文件/独占路径：`domains/bottom-panel/**`
- Branch：task/TASK-0120-terminal-webgl-context
- Worktree：不需要（范围小）
- 集成负责人：Coordinator
- 集成顺序：独立合入

### 做

- 定位终端 leaf 的 xterm 实例/WebglAddon 创建与 dispose 路径
  （分屏复制、面板收起重开、会话切换三个入口）；
- 修复使得 leaf 销毁时释放 GPU context，重建时仅创建一个；
- 为「leaf 反复挂载/卸载后活跃 context 数恒定」补定向测试。

### 不做

- 不改终端功能行为（滚动、字体、PTY 生命周期）；
- 不改分屏上限与布局模型；
- 不处理其它面板的 WebGL 使用（画布等另行评估）。

## Given / When / Then

- Given：会话页底部面板已含终端；
- When：分屏至 N 个 leaf，或反复收起/重开底部面板；
- Then：控制台不出现 `Too many active WebGL contexts`，
  活跃 context 数 ≤ 活跃 leaf 数；任一 leaf 画布不因 context 回收而空白。

## 必须保持

- 终端会话跨收起/重开持久保留（既有行为）；
- `BOTTOM_PANEL_MAX_LEAVES = 8` 不变；
- 分屏后各 leaf 的独立渲染互不干扰。

## 验收

1. 分屏至 3+ 终端并反复收起重开 5 次，DevTools 控制台无 WebGL 告警；
2. 定向测试断言 leaf 卸载后其 context 被 dispose；
3. `bun run check:quick` 与受影响域测试全绿。

## 测试与验证

- 测试层级：组件/模型层（挂载-卸载 context 计数）+ 实机 DevTools 控制台复核；
- 验证命令：`bun scripts/quality/run-vitest.mjs --run <相关测试>`、
  `bun run check:quick`。

## 交付记录

- 待实施。
