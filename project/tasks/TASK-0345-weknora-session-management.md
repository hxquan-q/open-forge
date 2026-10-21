---
id: TASK-0345
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0023
plan: null
source: REQ-0023
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: fafb911ab
read_paths: [apps/desktop, packages/theme-ui, docs/devflow]
write_paths: [apps/desktop/src/renderer/domains/weknora, apps/desktop/src/main/ipc, apps/desktop/src/main/weknora, apps/desktop/src/preload, apps/desktop/src/shared/i18n/locales, apps/desktop/package.json, docs/weknora-connector.md, docs/weknora-connector-delivery.md, .github/release-notes/v0.1.3.md, project/requirements/REQ-0023-weknora-session-management.md, project/tasks/TASK-0345-weknora-session-management.md]
exclusive_paths: [apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: []
integration_status: pending
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0345 · 智能客服会话管理增强

按 REQ-0023 实施:替换确认移除、会话导出(TXT/MD/docx + 路径自选)、右键多选批量删除/导出。分支说明:实施落在 `task/TASK-0342-weknora-chat-polish`(=origin/dev 堆叠,REQ-0020~0022 同枝),`branch: main` 指最终集成目标,与 0322~0324 同口径。
