---
id: TASK-0127
type: task
status: archived
priority: P2
owner: scripts/quality
requirement: []
plan: []
source: ISSUE-0023 处置记录（ratchet 已落地，本 Task 为 A 阶段收尾）
execution: serial
branch: main
worktree: 主工作区（必须是无并行代码线的安静窗口）
base_commit: main
read_paths: [scripts/quality/check-modified-file-notices.mjs, scripts/quality/baselines/modified-file-notices.txt, scripts/quality/check-guards.mjs, project/decisions/waivers/WAIVER-0002-modified-file-notices-baseline.md]
write_paths: [scripts/quality, project/decisions/waivers, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-27
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# 修改声明头存量缺失一次性 sweep

## 目标

在无并行代码线的安静窗口，对 `scripts/quality/baselines/modified-file-notices.txt`
快照内的存量缺失执行 `--write` 全量补声明头，随后把基线改为硬门禁（或删除基线）。

## 范围

- 执行前 `git status` 确认工作区干净、无在途并行改动会被机械改动卷入；
- `node scripts/quality/check-modified-file-notices.mjs --write` 全量 sweep；
- 复核写入结果（frontmatter/shebang/XML 声明插入位置正确）后重跑审计应为
  `missing=0 unclassified=0`；
- 删除 `modified-file-notices.txt` 基线或把 check-guards 切换为无 baseline 硬门禁；
- WAIVER-0002 置 `resolved`。

## 阻塞原因

需要无并行代码 Task 的安静窗口；当前仓库多会话并行活跃期，执行会制造大面积
机械冲突（ISSUE-0023 已评估）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

## 归档记录（2026-11-18）

结论：目标主体已由后续分批 sweep 收敛，剩余尾量越出本任务可写范围，本任务不再作为
独立排期项维护。

- 复核（2026-11-18，`chenxvhua`，`node scripts/quality/check-modified-file-notices.mjs`）：
  `changed=3127 covered=2871 excluded=249 missing=7 unclassified=0`；带基线运行输出
  `ratchet: waived=7 new=0`，即新增缺失已被门禁判负、存量只允许减少。
- 基线快照 651 条中已修复 644 条（TASK-0479 交付期的 `--write` 加上
  `51f02ff55`、`50cd62bd2`、`25467b0d2`、`1dda8f403` 等收缩批次），剩 7 条：
  - `docs/architecture/dependents.md`：机器生成文件，手写声明头会被
    `check-context-boundaries.mjs --write-dependents` 覆盖，正确做法是改生成器；
  - `apps/desktop/src/renderer/domains/conversation/components/new-session/useNewSessionPageModel.ts`：
    属内核会话域，不在本工作流可写范围；
  - `apps/desktop/src/main/agent-teams/team-runtime-manager.ts`、`apps/desktop/src/main/cli/agent-rpc-command.ts`、
    `packages/coding-agent/src/composition/contracts/tool-environment.ts`、
    `packages/coding-agent/test/runtime-core/turn-capability-session-assembly.test.ts`、
    `packages/runtime-node/src/coding/host/tool-environment.ts`：分别是
    TASK-0484/0486/0479/0482 改动时新增的修改文件。
- 归档理由：任务前提是「无并行代码线的安静窗口做一次性全量 sweep」，该窗口在 2026-09~11
  多会话并行期始终未出现；但规模已从 651 降到 7，尾量小于门禁噪声，而直接 sweep 需触碰
  内核域文件与机器生成文件，超出本任务声明范围，升格为独立 Task 的收益不抵风险。
- 承接方：剩余 7 条由 `WAIVER-0002` 的 ratchet 继续跟踪（`new=0` 保证不新增），waiver
  `expires 2027-03-31` 前的复审按原条款评估。若要把 `check-guards` 切成无基线硬门禁，
  须先清零这 7 条（含内核域文件与 dependents 生成器）并删除
  `scripts/quality/baselines/modified-file-notices.txt`，届时另开 Task。
- 未运行及原因：未执行 `--write` 全量 sweep（会写入内核域与机器生成文件，越界）；
  未改基线快照与 `check-guards` 门禁配置（清零前动手会让门禁失去 ratchet 保护）。
- 剩余风险：7 条存量声明头仍缺失，Apache-2.0 §4(b) 合规面在该 7 个文件上不完整；
  风险由 `WAIVER-0002` 显式承担并设到期日。
