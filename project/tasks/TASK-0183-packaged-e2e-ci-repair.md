---
id: TASK-0183
type: task
status: verifying
priority: P1
owner: desktop packaging
source: BUG-0066
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0180]
related_issues: [ISSUE-0029]
related_bugs: [BUG-0066]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: cf4c1147a
read_paths: [.github/workflows/desktop-packaged.yml, apps/desktop/e2e, apps/desktop/scripts]
write_paths: [.github/workflows/desktop-packaged.yml, apps/desktop/e2e, apps/desktop/scripts, project/tasks/TASK-0183-packaged-e2e-ci-repair.md, project/bugs/BUG-0066-packaged-e2e-ci-red.md]
exclusive_paths: []
depends_on: [TASK-0180]
conflicts_with: []
integration_status: integrated
created: 2026-10-03
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 修复 packaged E2E 的 CI 连续红

## 范围与验收

从完整 job 日志取失败分型（构建失败 / Electron smoke / updater E2E 三类），再按分型拆修复；每类修复须有本地可复现证据或 CI 复跑绿。不做：不跳过 E2E、不放宽超时掩盖、不降低断言。

## 分型完成（2026-10-05）

分型已取得，见 [BUG-0066](../bugs/BUG-0066-packaged-e2e-ci-red.md) 的「分型结果」与「根因」。摘要：

- 三个平台 job 都在 `.github/workflows/desktop-packaged.yml:119` 的 `bun run verify:staged-deps --staging` 失败；smoke / updater E2E 未执行。
- 根因是 `--staging` 未带 `--platform`，回落三平台并集，把本平台 prebuild 判为「应裁剪却仍在」。
- 原先的三类分型假设不成立：既非构建失败，也非 smoke/updater 失败，而是单一 cleanlist 断言类。

## 交付记录（2026-10-05）

- 实际修改：
  - `apps/desktop/scripts/verify-staged-deps.mjs`：`--staging`/`--resources` 要求显式且唯一的 `--platform <darwin|win32|linux>`，否则抛错；无树扫描的干跑仍默认三族。模块头补记该约束与理由。
  - `.github/workflows/desktop-packaged.yml`：E2E 矩阵新增 `family`（win32/darwin/linux），`verify:staged-deps` 步骤改为 `--staging --platform ${{ matrix.family }}`。
  - `apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs`：新增 3 例回归（缺平台或多平台抛错、干跑仍默认三族、单平台扫描不把本平台 prebuild 判为应裁剪）。
- 验证命令与结果：
  - `bun run --cwd apps/desktop test:packaging`：125/125 通过。
  - `node --test apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs`：21/21 通过（含新增 3 例）。
  - `node --check apps/desktop/scripts/verify-staged-deps.mjs`：通过。
  - 完整 `bun run check`：exit 0。
- 未运行及原因：CI 复跑（`ISSUE-0029`，fork 的 Actions 预算未恢复）。因此 packaged E2E 与 smoke/updater 自 `22efdca00` 起仍未在 CI 上真正执行过，本 Task 保持 `verifying`，不宣称 CI 已通过。
- 剩余风险：修复只在单元/干跑层验证；真实 staging 树的 CI 复跑绿仍是唯一能证明 E2E 恢复的证据，待 Actions 预算恢复后补跑。

## 集成

- 实现提交：`156aa4927`（本地 `main` 串行），集成状态 `integrated`。
- 未推送 origin/dev、未发布；推送与稳定晋升仍需单独授权。
