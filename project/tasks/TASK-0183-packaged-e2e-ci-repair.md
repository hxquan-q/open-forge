---
id: TASK-0183
type: task
status: ready
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
worktree: unassigned（仅规划，待后续会话实施）
base_commit: cf4c1147a
read_paths: [.github/workflows/desktop-packaged.yml, apps/desktop/e2e, apps/desktop/scripts]
write_paths: [.github/workflows/desktop-packaged.yml, apps/desktop/e2e, apps/desktop/scripts, project/tasks/TASK-0183-packaged-e2e-ci-repair.md, project/bugs/BUG-0066-packaged-e2e-ci-red.md]
exclusive_paths: []
depends_on: [TASK-0180]
conflicts_with: []
integration_status: pending
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
- 三平台并非构建/smoke/updater 失败——原先的三类分型假设不成立，实际是单一 cleanlist 断言类。

## 待实施

1. 让 `--staging` 扫描只应用产物所属平台的裁剪规则（CI 传 `--platform ${{ matrix.platform }}`，或让 `assertStagedTreeClean` 要求声明平台、禁止无平台全族并集）。
2. 加单元用例锁住语义：单平台产物树不因本平台 prebuild 缺报；三平台各自不缺报。
3. 复验：本机可跑的 `verify:staged-deps` 干跑与新增单元用例；CI 复跑绿为最终证据。

## 阻塞

[ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)：fork 的 Actions 预算耗尽，当前 workflow 秒败，CI 复跑绿暂不可得。实现与本地/单元级验证可先行，CI 复跑记为待办验收项。
