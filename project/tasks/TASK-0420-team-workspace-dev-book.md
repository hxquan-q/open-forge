---
id: TASK-0420
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: BUG-0163（用户实机验收反馈）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410]
related_issues: []
related_bugs: [BUG-0163]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 3f3ee2cf0
read_paths:
  - apps/desktop/src/main/agent-teams/team-workspace.ts
write_paths:
  - apps/desktop/src/main/agent-teams/team-workspace.ts
  - apps/desktop/src/main/agent-teams/team-workspace.test.ts
  - project/tasks/TASK-0420-team-workspace-dev-book.md
  - project/tasks/README.md
  - project/bugs/BUG-0163-team-workspace-dev-book.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0163-team-workspace-dev-book.md
exclusive_paths:
  - apps/desktop/src/main/agent-teams/team-workspace.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Team 工作区校验纳入开发册（BUG-0163）

## 目标

`resolveTeamSessionWorkspace` 的默认项目名单合并 `config.allstarProjects`，开发册项目可作为 Team 会话工作区；普通册行为不变。

## 交付记录

- 实际修改：见 BUG-0163 修复与验证；本 Task 记录 + 索引 + v0.1.4 fragment。
- 实际运行：定向红→绿；团队套件 42/42；`check:quick`（ratchet new=0）。
- 未运行及原因：完整 check 与实机复验待用户/收尾。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知。
