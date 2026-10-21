---
id: TASK-0347
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0025
plan: null
source: REQ-0025
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: 206fad2bd
read_paths: [apps/desktop, docs/devflow]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/components/ModelSelect, apps/desktop/src/renderer/shared/store/chat-atoms.ts, apps/desktop/src/renderer/root-layout/RootGlobalOverlays.tsx, apps/desktop/src/shared/i18n/locales, .github/release-notes/v0.1.3.md, project/requirements/REQ-0025-missing-api-key-guidance.md, project/tasks/TASK-0347-missing-api-key-guidance.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation]
depends_on: []
conflicts_with: []
integration_status: pending
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0347 · 未配置模型 Key 时的发送引导

按 REQ-0025 实施:发送前置闸门 + 引导对话框(取消/去配置模型 key)+ 深链跳转。T02/T03 加固项按用户裁定缓做。分支说明:实施落在 `task/TASK-0342-weknora-chat-polish`(堆叠分支),`branch: main` 指最终集成目标;**本地编号与 dev 撞车,推送前统一改号**。
