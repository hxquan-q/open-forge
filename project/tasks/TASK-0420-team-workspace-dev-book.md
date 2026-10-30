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
base_commit: fb4206f3c
read_paths:
  - apps/desktop/src/main/agent-teams/team-workspace.ts
  - apps/desktop/src/main/config/desktop-config-store.ts
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

`resolveTeamSessionWorkspace` 的默认项目名单合并 `config.allstarProjects`，开发册项目可作为 Team 会话工作区；`DesktopConfig` 将该字段声明为可选时也安全回退为空列表，修复当前 Desktop typecheck 的 TS18048；普通册行为不变。

## 测试与验证

- 定向：`bun ../../scripts/quality/run-vitest.mjs --run src/main/agent-teams/team-workspace.test.ts`（apps/desktop 内），覆盖册内/册外路径与 `allstarProjects` 缺省。
- 相邻：Team workspace/session create 相关套件。
- `check:quick` 与完整 `bun run check`；确认 Desktop typecheck 通过。

## 交付记录

- 实际修改：Team 工作区名单对 optional `allstarProjects` 回退空数组；测试覆盖开发册/普通册/名单外路径及字段缺省。
- 实际运行：`team-workspace.test.ts` 3/3；`test:impact` direct 37/37、related 117/117；`bun run check:quick` 通过；Desktop typecheck 与完整 `bun run check` 通过。
- 未运行及原因：未启动用户 Desktop 做实机验收，避免操作用户运行实例。
- Worktree：未拆出（主检出串行）。
- 剩余风险：开发册项目的 Team 会话尚待用户实机验收。
