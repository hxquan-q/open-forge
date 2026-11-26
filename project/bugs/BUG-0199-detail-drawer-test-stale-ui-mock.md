---
id: BUG-0199
type: bug
status: done
priority: P2
owner: root
requirement:
plan:
source: verification
related_requirement: []
related_plan: []
related_tasks: [TASK-0527]
related_issues: []
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# DetailDrawer 测试因手写 ui 全量 mock 过期而零用例失败

## 用户流程

- Given：开发者运行桌面渲染层测试（含全量套件）。
- When：`DetailDrawer.test.tsx` 被收集。
- Then：测试应在导入阶段通过并执行两条生命周期用例。

## 实际行为

套件在收集期整份失败（`0 test`）：`No "cn" export is defined on the "@vetta-org/ui" mock`。

## 期望行为

mock 只替换需要观测的抽屉壳本体，其余导出跟随真实实现演进，不因 ui 包新增内部依赖而断链。

## 环境与失败证据

- Windows 11，仓库 runner（`run-vitest.mjs`），vitest 4.1.11。
- 复现命令（apps/desktop 下）：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/shared/components/DetailDrawer.test.tsx` → 收集期失败，`no tests`。
- 失败链路：theme-ui 的 `overlays/CommandMenuView.tsx` → `shared/VettaKbd.tsx` 模块顶层调用 `cn(...)`（TASK-0497/08e7bbb8d 引入键帽样式后 `@vetta-org/ui` 需要 `cn` 导出），而测试用 `vi.mock("@vetta-org/ui", () => {...})` 全量手写替换只含 Drawer 系列四个组件，导入即抛错。

## 最小复现

1. 在 apps/desktop 下运行上述命令。
2. 观察收集期 mock 报错，无任何用例执行。

## 影响

渲染层全量套件必失败一个文件；DetailDrawer 生命周期（关闭退出动画语义）失去回归保护。属测试基建问题，不影响生产行为。

## 根因证据

`vi.mock` 全量替换模式下，mock 对象就是模块的全部导出；被测模块的间接依赖（VettaKbd 的 `cn`）不在手写清单里即缺失。此类手写全量 mock 对导出清单演化没有任何缓冲。

## 回归测试

原文件两条用例即回归测试（修复后恢复执行）。

## 修复与验证

- 修复：`vi.mock` 改 `async (importOriginal)` 形式，先展开真实导出再覆盖 Drawer 系列四件——只替换观测点，其余跟随真实实现。
- 测试：`run-vitest.mjs --run src/renderer/shared/components/DetailDrawer.test.tsx` 2/2 通过。
- 检查：随 TASK-0527/0528 交付的 `bun run check` 一并验证。
- 未运行及原因：无。
