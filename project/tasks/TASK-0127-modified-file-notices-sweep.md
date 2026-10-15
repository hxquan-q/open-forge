---
id: TASK-0127
type: task
status: blocked
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
updated: 2026-09-27
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
