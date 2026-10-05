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
related_issues: [ISSUE-0029]
related_bugs: [BUG-0067]
execution: serial
branch: main
worktree: unassigned（仅规划，待后续会话实施）
base_commit: cf4c1147a
read_paths: [apps/docs-site, .github/workflows/docs-site.yml]
write_paths: [apps/docs-site, .github/workflows/docs-site.yml, package.json, bun.lock, project/tasks/TASK-0184-docs-site-build-repair.md, project/bugs/BUG-0067-docs-site-build-ci-red.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-03
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 修复 docs-site 构建的 Turbopack 报错

## 范围与验收

提取 CI 构建错误清单并分型（依赖解析 / 类型 / 资源），本地 `bun run --cwd apps/docs-site build` 复现后修复；CI 构建绿为验收。不做：不删内容页面绕过错误。

## 分型完成（2026-10-05）

分型已取得，见 [BUG-0067](../bugs/BUG-0067-docs-site-build-ci-red.md) 的「分型结果」与「根因」。摘要：

- 91 个错误块，两类：约 85 个是 `fumadocs-core@16.14.1` 的 `defaultStringifier` 包装丢 `attention`/`peek` 属性导致的 `RangeError: Maximum call stack size exceeded`（内容含 `**`/`*` 即触发，53/100 个 mdx）；2 个是 `<!-- ... -->` HTML 注释在 MDX 下非法（`6:2: Unexpected character '!'`）。
- 本机已复现，与 CI 同一栈；非本次品牌迁移引入（fumadocs 版本与 upstream 相同，出错文件多在改动集外）。

## 待实施

1. 选定 fumadocs 修复路径：升级 / `patchedDependencies` 复制 `attention`+`peek` / 自定义 `stringify`。
2. 4 处 `<!-- ... -->` 改为 `{/* ... */}`（保持声明头门禁可识别）。
3. 补最小回归：含 `**`/`*` 的 mdx 经 stringifier 不抛 `RangeError`。
4. 复验：本机 `bun run --cwd apps/docs-site build` 绿；CI 复跑绿为最终证据。

## 阻塞

[ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)：fork 的 Actions 预算耗尽，CI 复跑绿暂不可得；本机构建绿可作为本地证据，CI 复跑记为待办验收项。
