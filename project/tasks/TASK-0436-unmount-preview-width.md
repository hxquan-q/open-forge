---
id: TASK-0436
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0175（用户实机验收反馈）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0432, TASK-0433]
related_issues: []
related_bugs: [BUG-0175]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: b4d6e6109
read_paths:
  - apps/desktop/src/renderer/shared/store/file-preview-atoms.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFileTabContentModel.ts
write_paths:
  - apps/desktop/src/renderer/shared/store/file-preview-atoms.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFileTabContentModel.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFileTabContentModel.test.tsx
  - project/tasks/TASK-0436-unmount-preview-width.md
  - project/tasks/README.md
  - project/bugs/BUG-0175-unmount-shrinks-panel-width.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0162-unmount-preview-width.md
exclusive_paths:
  - apps/desktop/src/renderer/shared/store/file-preview-atoms.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 文件页签卸载不再回拉面板宽度（BUG-0175）

## 目标

拆分「清预览」与「回拉宽度」两种语义：新增 `clearInlineFilePreviewContextAtom`（只清上下文与 restore 记录、不动宽度），`FileTabContent` 卸载清理改走它；用户主动点关闭仍走 `closeInlineFilePreviewAtom`（含回拉）。

## 交付记录

- 实际修改：见关联 BUG 修复与验证；本 Task 记录 + 索引 + v0.1.4 fragment。
- 实际运行：定向红→绿；`check:quick`（ratchet new=0）。
- 未运行及原因：完整 check 与实机复验待批次收尾/用户。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知。
