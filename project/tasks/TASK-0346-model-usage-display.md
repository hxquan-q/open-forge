---
id: TASK-0346
type: task
status: in_progress
priority: P2
owner: desktop
requirement: REQ-0024
plan: null
source: REQ-0024
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: 04e3bd81d
read_paths: [apps/desktop, docs/devflow]
write_paths: [apps/desktop/src/main/models/balance, apps/desktop/src/main/ipc/fs.ts, apps/desktop/src/preload, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/shared/i18n/locales, .github/release-notes/v0.1.3.md, project/requirements/REQ-0024-model-usage-display.md, project/tasks/TASK-0346-model-usage-display.md]
exclusive_paths: [apps/desktop/src/main/models/balance]
depends_on: []
conflicts_with: []
integration_status: pending
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0346 · 模型选型区服务商余额显示

按 REQ-0024 实施:主进程余额数据面(DeepSeek/Kimi,ARK 留位)+ 输入栏常驻余额小字(未支持/失败零渲染)。分支说明:实施落在 `task/TASK-0342-weknora-chat-polish`(堆叠分支),`branch: main` 指最终集成目标;**本地编号与 dev 撞车,推送前统一改号**。
