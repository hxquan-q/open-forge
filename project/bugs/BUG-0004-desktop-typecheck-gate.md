---
id: BUG-0004
type: bug
status: done
priority: P1
owner: scripts/quality
source: user-request; package.json#scripts.check:types
created: 2026-09-23
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Windows 上 Desktop 类型检查未可靠执行

## 实际行为

根目录 `bun run check` 的 Desktop 子检查直接调用裸 `bunx tsc`。当前 Windows 环境可运行 `bun`，但 PATH 中没有独立 `bunx` 命令；并行门禁输出会继续穿插其它检查，使 Desktop 类型检查没有实际启动且容易被误认为已覆盖。

## 期望行为

完整质量门禁必须通过当前执行脚本所用的 Bun 启动 Desktop `tsc`。命令无法启动或 `tsc` 返回非零时，`check:types` 必须失败，不能把 Desktop 检查当成可选步骤。

## 最小复现

1. 在 `bun` 可用、裸 `bunx` 不在 PATH 的 Windows shell 运行 `bun run check`。
2. `check:types` 的 Desktop 子命令报 `bunx is not recognized`，没有检查 `apps/desktop/tsconfig.json`。
3. 直接运行 `bun x tsc --noEmit -p apps/desktop/tsconfig.json` 可以复现仓库中真实的 Desktop 类型错误。

## 根因

`package.json#scripts.check:types` 在已经由 Bun 驱动的仓库脚本中仍依赖单独的 `bunx` 可执行文件；质量脚本测试只锁定 Mobile 子检查，没有断言 Desktop 命令的执行入口和 tsconfig。

## 修复

- Desktop 子检查改用 `bun x tsc`，保留现有 tsconfig、增量缓存和并行失败传播。
- `quality-gates.test.mjs` 锁定 Desktop 检查必须通过当前 Bun 执行，且不得退回裸 `bunx tsc`。
- 同步 Desktop 与质量门禁文档中的单独排查命令。

## 回归测试

- 修改前：`quality-gates.test.mjs -t "runs Desktop typechecking through the current Bun executable"` 失败，收到 `bunx tsc`。
- 修改后（2026-09-24）：`bun scripts/quality/run-vitest.mjs --run scripts/quality/quality-gates.test.mjs` 90/90 通过，含新增的 Desktop 入口断言。
- 未运行及原因：完整 `test:quality` 与 `bun run check` 未单独重跑；主工作区当时仍有其他任务未提交改动，全量结果无法按本 bug 归因（Desktop `tsc` 既有错误另行记录）。

## 发布说明候选

- 「其他」：修正 Windows 上完整质量门禁对独立 `bunx` 命令的依赖，确保 Desktop TypeScript 检查实际执行并能阻断错误。Desktop manifest 尚未切换到 Open Forge `0.1.0`，此前不修改继承的 Vetta `v0.5.59` 发布说明。
