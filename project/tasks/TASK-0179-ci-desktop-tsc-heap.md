---
id: TASK-0179
type: task
status: done
priority: P1
owner: quality
source: BUG-0063
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0176, TASK-0174]
related_issues: []
related_bugs: [BUG-0063]
execution: serial
branch: main
worktree: unassigned（2026-10-03 主检出串行实施）
base_commit: 497449f16
read_paths: [package.json, docs/dev/quality-gates.md, .github/workflows/quality.yml]
write_paths: [package.json, project/tasks/TASK-0179-ci-desktop-tsc-heap.md, project/bugs/BUG-0063-ci-desktop-tsc-heap-oom.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 修复 quality CI 的 desktop tsc 堆内存耗尽

## 目标与方案

BUG-0063：CI 冷启动全量 desktop tsc 超过 Node 默认堆上限。为 `check:types` 的 desktop 段加 `NODE_OPTIONS=--max-old-space-size=6144`（runner 16 GB、五路并行下的保守余量），其余四路与命令形状不变；本地 Windows 经 bun shell 同样支持 env 前缀语法。

## 不做项

不切换 desktop 到 tsgo（另属架构变更）；不降低并行度；不改 tsconfig 或增量缓存布局。

## 验证

- 本地 `bun run check:types`（新前缀下）通过、`bun run check` exit 0。
- 推送后 quality workflow 的 check job 复跑绿（三平台各一次）。

## 交付记录（2026-10-03）

- 实现：`apps/desktop` 新增 `typecheck:incremental` 脚本（`NODE_OPTIONS=--max-old-space-size=6144 tsc --noEmit -p tsconfig.json --incremental --tsBuildInfoFile ../../node_modules/.desktop-check.tsbuildinfo`），根 `check:types` 的 desktop 段改走 `bun run --cwd apps/desktop typecheck:incremental`。最初尝试在 concurrently 段内联 env 前缀——Windows 上 concurrently 经 cmd.exe spawn 不识别该语法，已改为包内脚本（bun shell 支持，跨平台一致）。
- 本地验证：`check:types` 五段全绿（desktop 段经新脚本 exit 0）、完整 `bun run check` exit 0。CI 三平台复跑证据待推送后由 quality workflow 产生。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。
- CI 证据（2026-10-03）：quality 37059120973 的 check job 通过（含 Test quality scripts 段）；首次推送曾因未同步 quality-gates 断言而红，已随 efa91bcb4 修复。
- CI 终验（2026-10-03）：quality 37060686088 的 `check + quality tests` job 成功，堆 OOM 未再出现。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI 基础设施（workflow 与包内脚本），无用户可观察行为变化；既定验收标准（CI 复跑绿，记录在案：TASK-0179 见 quality 37060686088，TASK-0180 见 desktop-packaged 37060686125）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
