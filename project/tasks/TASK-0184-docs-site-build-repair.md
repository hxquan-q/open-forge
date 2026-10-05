---
id: TASK-0184
type: task
status: ready
priority: P2
owner: docs-site
source: BUG-0067
related_requirement: [REQ-0004]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0067]
execution: serial
branch: main
worktree: unassigned（仅规划，待后续会话实施）
base_commit: cf4c1147a
read_paths: [apps/docs-site, .github/workflows/docs-site.yml]
write_paths: [apps/docs-site, .github/workflows/docs-site.yml, project/tasks/TASK-0184-docs-site-build-repair.md, project/bugs/BUG-0067-docs-site-build-ci-red.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 修复 docs-site 构建的 Turbopack 71 错

## 范围与验收

提取 CI 构建错误清单并分型（依赖解析/类型/资源），本地 `bun run --cwd apps/docs-site build` 复现后修复；CI 构建绿为验收。不做：不删内容页面绕过错误。

## 交付记录

待实施（本会话仅建档）。
