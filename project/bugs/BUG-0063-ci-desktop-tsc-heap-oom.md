---
id: BUG-0063
type: bug
status: verifying
priority: P1
owner: quality
source: CI quality workflow failures (37001967265 / 37053825133 / 37054315547)
related_requirement: [REQ-0004]
related_plan: [PLAN-0014]
related_tasks: [TASK-0179]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# quality CI 的 desktop tsc 冷启动堆内存耗尽

## 用户流程与实际行为

Given：push 到 dev 触发 quality workflow；When：check job 并行执行 `check:types`（root tsgo / cli tsgo / desktop `bun x tsc` / docs / mobile）；Then：desktop 段在 CI 上以 `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` 崩溃，整个 `bun run check` exit 1。

## 环境与证据

- 连续三次失败运行：37001967265（c8dc167f0 推送，2026-10-02 11:41）、37053825133 与 37054315547（本批次推送）。错误均在 `[types] [desktop]` 段。
- 本机（i7-12650H / 31.7 GB / Windows）同一命令通过：本地 `--incremental` 有热 tsbuildinfo，检查面小；CI 冷检出做全量检查，内存峰值超过 Node 默认堆上限。
- 上一次会话的推送（c8dc167f0）同样失败——**存量 CI 回归，非本批次引入**；更早的运行被 GitHub 账户 billing 拒启掩盖（见 BUG-0064 附注）。

## 根因与置信度

desktop TypeScript 全量检查的工作集在 CI 冷启动下超过 Node 默认 `max-old-space-size`（约 4 GiB），且 `check:types` 用 concurrently 五路并行进一步压缩可用余量。源码级因果置信度高；具体峰值数值未测（修复后由 CI 复跑验证）。

## 回归与修复

归入 [TASK-0179](../tasks/TASK-0179-ci-desktop-tsc-heap.md)：为 desktop tsc 段显式提升堆上限（`NODE_OPTIONS=--max-old-space-size=6144`），其余四路不变；本地 check:types 复验 + CI 复跑绿为修复证据。
