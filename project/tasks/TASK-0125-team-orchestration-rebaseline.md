---
id: TASK-0125
type: task
status: blocked
priority: P2
owner: apps/desktop
requirement: []
plan: PLAN-0013
source: PLAN-0013 阶段 3（基线：38 waits / 34 timeouts / 主控 input 503,860 / 44.9min / $0.376）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0025, ISSUE-0026, ISSUE-0027]
related_bugs: []
execution: serial
branch:
worktree:
base_commit: main
read_paths: [apps/desktop/scripts/, project/verification/]
write_paths: [project/verification/, .github/release-notes/]
exclusive_paths: []
depends_on: [TASK-0122]
conflicts_with: []
integration_status: pending
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 团队编排效率回归实测：rebase 上游 + 阶段 1 后同任务量化对比

## 目标

PLAN-0013 的验证闸。在合并上游（≥`887017560`）且 TASK-0122 落地后，用同一任务形态
（读 xlsx → 建数据页）复跑一次真实团队会话，与本次基线量化对比，产出 `project/verification/`
记录；据此决定 ISSUE-0025 方案 C（运行时自动挂起）与 ISSUE-0027-A（质检分级）是否立项。

## 范围

### 并发评估

- 结论：必须串行——是 PLAN-0013 的收口验证，须在阶段 1 改动集成后执行。
- 前置依赖：TASK-0122 集成；上游 rebase 完成（含 `887017560`）。
- 执行方式：serial，主工作区。

### 做

- 复跑同形态任务并记录：wait 调用数/timeout 数、主控与成员 input/output tokens、总成本、
  总时长、阶段时长分布、成员会话 `browser_tab` 撞错是否消除；
- 对比基线表（本文件已知事实）；
- 产出 VERIFICATION 记录与是否升级 ISSUE-0025-C / ISSUE-0027-A 的建议。

### 不做

- 不在本任务修任何实现；
- 不阻塞阶段 1 合入——本任务是其后的验证步骤。

## Given / When / Then

- Given：阶段 1 改动已集成、上游已 rebase；
- When：用同类任务复跑一次开发团队会话；
- Then：得到可对比的量化表 + Verification 记录；等待占比、主控 input、总时长有结论。

## 必须保持

- 实测环境可复现：记录 provider/模型/输入文件与并发负载；
- 成本数据来自 usage 记录而非估算。

## 测试与验证

- 产出：`project/verification/VER-*` 记录；
- 对比指标：wait 调用数、主控 input tokens、总时长、$、成员撞错次数。

## 交付记录

- 实际修改：无实现改动；登记阻塞状态与前置条件。
- 实际运行：无（复跑须用真实 provider 产生真实费用，需用户明确授权与可用的真实环境）。
- 未运行及原因：
  - TASK-0122 未集成（status: ready，无分支/无集成提交）；
  - 上游 commit `887017560`（perf(agent-teams): 优先准备队长与首轮响应）不在本地 `main` 祖先链中，上游 rebase 前提未满足；
  - 任务要求同形态真实团队会话 ~45min 复跑并记录真实 usage/成本，本会话内不可诚实执行。
- Worktree：unassigned
- 剩余风险：前置就绪前任何「复跑数据」都属伪造，不得凭空填写基线对比；
  TASK-0122 落地后需先确认 `887017560` 已在 main 历史，再启动实测。
