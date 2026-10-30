---
id: TASK-0421
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0006
plan: PLAN-0026
source: BUG-0164（用户实机验收反馈）
related_requirement: [REQ-0006]
related_plan: [PLAN-0026]
related_tasks: [TASK-0420]
related_issues: []
related_bugs: [BUG-0164]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 3f3ee2cf0
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.test.tsx
  - project/tasks/TASK-0421-handoff-failure-loop.md
  - project/tasks/README.md
  - project/bugs/BUG-0164-handoff-failure-loop.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0164-handoff-failure-loop.md
exclusive_paths: []
depends_on: [TASK-0420]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Team 首发 handoff 失败不再自动重发（BUG-0164）

## 目标

创建失败的 handoff 保持已领取（移除失败路径的 release 重武装）：只尝试一次，错误浮出、草稿恢复交还用户手动重发；状态恢复不再驱动 effect 重发。

## 交付记录

- 实际修改：见 BUG-0164 修复与验证；本 Task 记录 + 索引 + v0.1.4 fragment。
- 实际运行：定向红→绿；团队套件 42/42；`check:quick`（ratchet new=0）。
- 未运行及原因：完整 check 与实机复验待用户/收尾。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知。
