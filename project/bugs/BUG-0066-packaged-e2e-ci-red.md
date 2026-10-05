---
id: BUG-0066
type: bug
status: investigating
priority: P1
owner: desktop packaging
source: CI desktop-packaged workflow E2E jobs (36901450713 / 37056667683 / 37059120967)
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0183]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# desktop-packaged 的 packaged E2E job 连续红

## 事实

合同 job 与 scope job 修复后（BUG-0064），Linux/macOS 的 packaged E2E 仍失败（37059120967），Windows E2E 前一次推送（36901450713）也失败过。E2E 阶段为「构建 unpacked 制品 → Electron 启动 smoke / updater E2E」，单次约 35 分钟；此前被 billing 拒启与合同 job 秒败掩盖，长期没有绿基线可对照。

## 待诊

失败断言细节待从完整 job 日志获取（本日 log API 只返回空）；需要区分构建失败、smoke 失败与 updater E2E 失败三类。不排除与 9/28 以来多次批次累积的 Desktop 改动相关。归入 [TASK-0183](../tasks/TASK-0183-packaged-e2e-ci-repair.md)：先取一次完整失败日志分型，再决定修复拆分。
