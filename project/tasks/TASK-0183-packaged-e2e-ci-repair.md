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
related_issues: []
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
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 修复 packaged E2E 的 CI 连续红

## 范围与验收

先从完整 job 日志取失败分型（构建失败 / Electron smoke / updater E2E 三类），再按分型拆修复；每类修复须有本地可复现证据或 CI 复跑绿。不做：不跳过 E2E、不放宽超时掩盖、不降低断言。

## 交付记录

待实施（本会话仅建档；日志 API 当日受限，未取得断言细节）。
