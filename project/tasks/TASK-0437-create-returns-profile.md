---
id: TASK-0437
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0174（用户实机验收反馈）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0434]
related_issues: []
related_bugs: [BUG-0174]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: b4d6e6109
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/conversations/desktop-conversation-service.ts
write_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/ipc/session-create-returns-profile.test.ts
  - project/tasks/TASK-0437-create-returns-profile.md
  - project/tasks/README.md
  - project/bugs/BUG-0174-create-missing-capability-profile.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0161-create-returns-profile.md
exclusive_paths:
  - apps/desktop/src/main/ipc/session-create-returns-profile.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# CREATE 返回透传会话档位（BUG-0174）

## 目标

`CHANNELS.CREATE` handler 返回补上 service 已算出的 `agentMode` 与 `capabilityProfile`，渲染端 `activeSessionAtom` 拿到档位，§11.3 门控对交互式 code 会话恢复放行。

## 交付记录

- 实际修改：见关联 BUG 修复与验证；本 Task 记录 + 索引 + v0.1.4 fragment。
- 实际运行：定向红→绿；`check:quick`（ratchet new=0）。
- 未运行及原因：完整 check 与实机复验待批次收尾/用户。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知。
