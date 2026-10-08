---
id: TASK-0120
type: task
status: done
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
updated: 2026-10-06
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

- 2026-09-26：定位结论——`TerminalSurface` 建终端 effect 是唯一持有 xterm
  实例的位置；context 积累根因与 BUG-0041 同源：卸载时 WebglAddon 只在
  `terminal.dispose()` 内部被连带销毁，而 xterm 6 先清 linkifier 再轮 addon，
  canvas/webgl 收尾回调必抛 TypeError，异常路径上 context 残留。
  BUG-0041 修复（卸载时先单独摘除渲染 addon 再销毁终端，并包防御性
  try/catch）已覆盖本任务核心修复点。
- 本次补充定向测试：
  - `select-terminal-renderer.test.ts`：钉死「仅活动 leaf 用 WebGL、其余
    canvas」的存量缓解合同；
  - `TerminalSurface.host.test.tsx` 新增「反复挂载/卸载后每个 WebGL addon
    都被释放，context 不累积」（已对旧实现验证为红：0/3 次释放）。
  - 顺带修正 host 测试的 i18n mock：`t` 身份稳定化，避免 effect 依赖抖动。
- 验证状态：`run-vitest.mjs` 定向测试与 `check:quick` 待本轮跑绿后记绿；
  验收项 1（实机 DevTools 控制台复核 WebGL 告警消失）需要 verify:ui，
  未获授权前保持 verifying。

- 2026-10-06 人工 UI 实测（隔离 Debug Profile）：分屏 3 个终端后共 25 次收起/重开（含连续快切），按 context 对象身份去重计数，唯一 WebGL context 增量为 0，3 个活跃 GL canvas 与 3 个 leaf 对齐，DevTools 无 WebGL 告警（162 条控制台消息 / 0 error，仅 1 条 Electron 开发态 CSP 提示）；定向测试 2 文件 9 例与 `check:quick` 绿。验收项 1 已实证，记为 done。
