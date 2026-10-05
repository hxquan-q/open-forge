---
id: TASK-0184
type: task
status: verifying
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
worktree: unassigned（主工作区串行）
base_commit: cf4c1147a
read_paths: [apps/docs-site, .github/workflows/docs-site.yml]
write_paths: [apps/docs-site, .github/workflows/docs-site.yml, package.json, bun.lock, patches, scripts/quality/check-modified-file-notices.mjs, project/tasks/TASK-0184-docs-site-build-repair.md, project/bugs/BUG-0067-docs-site-build-ci-red.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-03
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 修复 docs-site 构建的 Turbopack 报错

## 范围与验收

提取 CI 构建错误清单并分型（依赖解析 / 类型 / 资源），本地 `bun run --cwd apps/docs-site build` 复现后修复；CI 构建绿为验收。不做：不删内容页面绕过错误。

## 分型完成（2026-10-05）

分型已取得，见 [BUG-0067](../bugs/BUG-0067-docs-site-build-ci-red.md) 的「分型结果」与「根因」。摘要：

- 91 个错误块，两类：约 85 个是 `fumadocs-core@16.14.1` 的 `defaultStringifier` 包装丢 `attention`/`peek` 属性导致的 `RangeError: Maximum call stack size exceeded`（内容含 `**`/`*` 即触发，53/100 个 mdx）；2 个是 `<!-- ... -->` HTML 注释在 MDX 下非法。
- 本机已复现，与 CI 同一栈；非本次品牌迁移引入（fumadocs 版本与 upstream 相同，出错文件多在改动集外）。

## 交付记录（2026-10-05）

- 实际修改：
  - `patches/fumadocs-core@16.14.1.patch` + 根 `package.json` 的 `patchedDependencies`：修正 `modHandler`，包装 handler 时保留 `attention`/`peek`，消除 `strong`/`emphasis` 的无限自递归。
  - 4 个 `.mdx` 的 `<!-- ... -->` 改为 `{/* ... */}`；`core/workspaces-and-sessions.mdx`（zh/en）的声明头原先在 frontmatter 之前，移到闭合 `---` 之后。
  - `scripts/quality/check-modified-file-notices.mjs`：为 `.mdx` 增加 `jsx` 注释样式（`--write` 不再插入非法 HTML 注释）；`patches/` 列入不携带声明头的白名单。
  - `apps/docs-site/test/mdx-stringifier.test.ts`：直接构造含 `strong`/`emphasis` 的最小 mdast，断言不再抛 `RangeError`。
- 验证命令与结果：
  - `bun run --cwd apps/docs-site build`：exit 0，113 个静态页；`RangeError` 计数从 85 降到 0，错误块从 91 降到 0。
  - `bun run --cwd apps/docs-site test`：34/34 通过（含新增 1 例）。
  - `bun run test:quality`：487/487 通过（改动了 `scripts/quality`）。
  - 声明头门禁 ratchet：`unclassified=0`、`new=0`。
  - 完整 `bun run check`：exit 0。
- 未运行及原因：CI 复跑（`ISSUE-0029`）。Vercel 生产部署随下次构建自然恢复，未在本轮触发部署。
- 剩余风险：修复依赖 fork 本地的 bun patch；若日后升级 fumadocs-core，需先确认上游是否已修 `modHandler`，再决定撤补丁还是换版本。

## 集成

- 实现提交：`53671cbc1`（本地 `main` 串行），集成状态 `integrated`。
- 未推送 origin/dev、未发布。
