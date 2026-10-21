---
id: TASK-0344
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0022
plan: null
source: REQ-0022
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: 1fb9adef6
read_paths: [apps/desktop, packages/theme-ui, docs/devflow]
write_paths: [apps/desktop/src/renderer/domains/weknora, apps/desktop/src/main/weknora, apps/desktop/src/main/ipc/weknora.ts, apps/desktop/src/preload, apps/desktop/src/shared/i18n/locales, docs/weknora-connector.md, .github/release-notes/v0.1.3.md, project/requirements/REQ-0022-weknora-kb-citation.md, project/tasks/TASK-0344-weknora-kb-citation.md]
exclusive_paths: [apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: []
integration_status: pending
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0344 · 智能客服引用标签角标化与原文弹层

按 REQ-0022 实施：`<kb/>`→可点击角标（悬停全名/点击经 `chunks/by-id` 弹只读原文卡片），`<web/>`→标准外链，思考区与流式期间剥标签，历史回看同渲染；store 数据零改动，仅新增只读 GET 数据面。

分支说明：实施落在 `task/TASK-0342-weknora-chat-polish`（=origin/dev + 32 起堆叠，REQ-0020/0020/0021 三 feature 同枝，push/PR 时机由用户单独裁定）；台账 `branch: main` 指最终集成目标，与 0322/0323 同口径。
