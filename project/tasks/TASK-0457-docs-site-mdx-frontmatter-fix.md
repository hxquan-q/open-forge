---
id: TASK-0457
type: task
status: done
priority: P2
owner: docs
requirement: []
plan: []
source: TASK-0452
related_requirement: []
related_plan: []
related_tasks: [TASK-0452]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - apps/docs-site/content/docs/plugins/
  - apps/docs-site/content/docs/en/plugins/
write_paths:
  - apps/docs-site/content/docs/plugins/capabilities.mdx
  - apps/docs-site/content/docs/en/plugins/capabilities.mdx
  - project/tasks/TASK-0457-docs-site-mdx-frontmatter-fix.md
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197]
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# docs-site MDX frontmatter 修复

## 目标

origin/dev（39cdeec9d526）上 docs-site workflow 构建失败：`capabilities.mdx`（中/英两份）的版权 JSX 注释位于 frontmatter `---` 之前，MDX 解析器拒绝。本地 `bun run check` 只 typecheck 不 build，未拦截。由 TASK-0452 端到端验收的 CI 记录发现。

## 范围

### 并发评估

- 结论：两个内容文件的单行移动，主工作区串行，无并行诉求。

### 做

- 将两份 `capabilities.mdx` 的 `{/* Modified ... */}` 注释移到 frontmatter 之后，与 content 内全部健康 MDX（如 `docs/core/overview.mdx`）的既有惯例对齐。
- 本地 `bun run --cwd apps/docs-site build` 复现修复（CI 失败路径即生产 build）。

### 不做

- 不改 frontmatter 内容、正文与其它文件；不调整 docs-site 构建配置或本地 check 的覆盖面（build 是否纳入本地门禁另行讨论）。

## Given / When / Then

- Given 注释行在 frontmatter 之前 / When 移动到其后 / When `bun run --cwd apps/docs-site build` / Then 构建成功，dev 推送后 docs-site workflow 转绿。

## 测试与验证

- `bun run --cwd apps/docs-site build`（本地复现 CI 失败路径）；推送后以 docs-site workflow 结果复核。

## 交付记录

- 实际修改（2026-11-07）：两份 `capabilities.mdx` 的版权 JSX 注释各上移一行至 frontmatter 之后，对齐 `docs/core/overview.mdx` 等全部健康 MDX 的既有惯例；无其它改动。
- 实际验证：`bun run --cwd apps/docs-site build` 修复前失败路径即 CI 42264316550 的 MDX frontmatter 错误，修复后本地 build 通过（exit 0）；`check:guards` task-worktrees（449 任务 0 警告）与 project-indexes 通过。
- 集成：提交进 main 并推送 `main:dev` 后由 docs-site workflow 复核转绿；本任务 status 置 verifying、integration_status 随推送记 integrated。
- 人工验收：不适用（内容文件构建修复）；完成标准为本地 build 与远端 workflow 双绿。

