---
id: TASK-0435
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0173（TASK-0425 报告 F03）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0434]
related_issues: []
related_bugs: [BUG-0173]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: fb4206f3c
read_paths:
  - apps/desktop/src/renderer/shared/store/ai-activity-atoms.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks
write_paths:
  - apps/desktop/src/renderer/shared/store/ai-activity-atoms.ts
  - apps/desktop/src/renderer/shared/store/ai-activity-atoms.test.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiActivity.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiActivity.test.tsx
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.test.ts
  - project/tasks/TASK-0435-edit-target-cross-workspace.md
  - project/tasks/README.md
  - project/bugs/BUG-0173-edit-target-cross-workspace.md
  - project/bugs/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0160-edit-target-cross-workspace.md
exclusive_paths:
  - apps/desktop/src/renderer/shared/store/ai-activity-atoms.ts
depends_on: [TASK-0434]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 编辑目标按来源身份过滤（BUG-0173 / F03）

## 目标

`AiEditTarget` 携带来源 cwd，消费端（文件详情跟随、页签跟随编辑分支）只消费本工作区目标；同 cwd 照常跟随。与 shell 分支既有 cwd 过滤同口径。

## 交付记录

- 实际修改：`ai-activity-atoms.ts`（接口 + 工厂携带 cwd）；`useFollowAiFileEdits`（Context workspace.cwd 过滤）；`useFollowAiActivity` 编辑分支（同过滤）；三个测试文件（工厂断言、既有夹具补 cwd、跨项目红 2 用例）；BUG-0173/本 Task/索引与 v0.1.4 fragment。
- 实际运行：红 2→绿；全套件 23/23；`check:quick` 通过（ratchet new=0）。批次收尾完整 `bun run check` exit 0（含本片类型面）。
- 未运行及原因：完整 check 见批次收尾；实机跨项目走查待用户。
- Worktree：未拆出（主检出串行）。
- 剩余风险：隔离粒度为 cwd（同项目多 code 会话视为同源），与 shell 分支一致；同 cwd 面板 remount 回放是独立 BUG-0178 / TASK-0442，已从本 Task 范围拆出。
