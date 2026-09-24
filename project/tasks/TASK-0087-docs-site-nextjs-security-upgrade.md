---
id: TASK-0087
type: task
status: done
priority: P0
owner: apps/docs-site
source: BUG-0012
execution: parallel
branch: forge/dev
worktree: main-workspace
base_commit: b81c81504
read_paths: [apps/docs-site/package.json, apps/docs-site]
write_paths: [apps/docs-site/package.json, bun.lock]
exclusive_paths: [apps/docs-site/package.json]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0012]
---
<!-- Copyright The Open Forge contributors. -->

# 文档站点 Next.js 与 PostCSS 安全依赖升级（消除 Critical RCE 漏洞）

## 目标

升级 `apps/docs-site` 中的 `next` 与 `postcss` 依赖版本，消除 Dependabot 检出的 2 项 Critical 严重级别远程代码执行漏洞（GHSA-p293-qw3h-jr36 / GHSA-2xp9-vwfh-vxw4）以及 2 项 High 高危路径遍历漏洞（GHSA-r28c-9q8g-f849 / GHSA-6g55-p6wh-862q）。

## 背景事实

- `apps/docs-site/package.json` 当前锁定使用 `"next": "16.3.0"` 和 `"postcss": "8.5.6"`。
- Dependabot 报告显示：
  - `GHSA-p293-qw3h-jr36` (CVE-2026-75604, Critical)：Next.js 在 Windows 宿主下存在未授权 RCE，修复版本为 `16.3.3`。
  - `GHSA-2xp9-vwfh-vxw4` (Critical)：Next.js 图像优化 API 在处理 AVIF 图像时存在未授权 RCE，修复版本为 `16.3.3`。
  - `GHSA-r28c-9q8g-f849` (CVE-2026-73646, High) & `GHSA-6g55-p6wh-862q` (CVE-2026-45623, High)：PostCSS `sourceMappingURL` 路径遍历与文件泄露，修复版本为 `8.5.23`。
- `apps/docs-site` 是独立的 Next.js / Fumadocs 应用，不导出任何公共 API 给其它 workspace 包，依赖改动具备完整隔离性。

## 范围

### 并发评估

- **并发结论**：**支持并发**
- **执行方式**：parallel（独立 Worktree 或独立分支，无公共代码冲突）
- **可并行 Task**：`TASK-0088`, `TASK-0089`, `TASK-0090`
- **前置依赖**：无
- **冲突文件/独占路径**：`apps/docs-site/package.json`
- **Branch**：`forge/dev`
- **Worktree**：独立或主工作区均可
- **集成负责人**：本 Task 执行者

## 行为规范

- Given：文档站点配置了 fumadocs 与 Tailwind CSS 构建流程。
- When：更新 `apps/docs-site/package.json` 中 `next` 至 `^16.3.3`，`postcss` 至 `^8.5.23` 并执行安装与构建。
- Then：
  1. 文档站静态构建（`next build`）与类型检查无报错通过；
  2. 既有文档页面、搜索与路由功能保持正常；
  3. GitHub Dependabot 中关于 Next.js 与 PostCSS 的 4 项告警可被关闭。

## 验收标准与验证命令

1. **依赖升级**：
   - `apps/docs-site/package.json` 中 `next` 为 `>= 16.3.3`。
   - `apps/docs-site/package.json` 中 `postcss` 为 `>= 8.5.23`。
2. **构建与类型验证**：
   - 运行 `bun --cwd apps/docs-site run check`（`next typegen && tsc --noEmit`）通过。
   - 运行 `bun run build:docs` 构建产物成功生成。
3. **快速门禁**：
   - 运行 `bun run check:quick -- apps/docs-site/package.json` 通过。

## 实际修改与验证记录

### 实际修改

- `apps/docs-site/package.json`：`next` 从 `16.3.0` 升至 `^16.3.3`，`postcss` 从 `8.5.6` 升至 `^8.5.23`。
- `bun.lock`：重新安装后解析为 `next@16.3.6` 与文档站直接依赖 `postcss@8.5.26`；Next 的 SWC 与 PostCSS 传递依赖同步使用已修复版本。
- `.github/release-notes/v0.1.0.md`：在「修复」记录用户可见的安全升级结果。

### 验证证据

- `bun install`：通过，锁文件更新成功。
- `bun run --cwd apps/docs-site check`：通过，`next typegen` 与 `tsc --noEmit` 均无错误。
- `bun run build:docs`：通过，Next.js `16.3.6` 完成生产构建并生成 113 个页面。
- `bun run --cwd apps/docs-site test`：33 项中 32 项通过；既有 `content-quality.test.ts` 的英文首页断言仍期待 `<span`，而仓库当前内容使用 `<HomeEmphasis>`。该文件不在本任务范围且升级前后内容未变，失败为既有基线问题。
- 官方 npm 审计端点：`next` 分组已从审计输出消失；文档站直接、Next 和 Tailwind 路径使用的 PostCSS 均为 `8.5.23+`，4 项目标 GHSA 不再命中。剩余 PostCSS High 告警来自 Desktop 的 Vite/Shadcn `8.5.15`，由 `TASK-0090` 或后续依赖集成处理。
- 构建产物 HTTP 冒烟：首页、文档路由和 `/llms.txt` 均返回 200；`/api/search` 在升级前后均因 Fumadocs 的 `DOCUMENT_ALREADY_EXISTS` 返回 500，已用 `next@16.3.0` 基线复现，不由本次升级引入。

### 剩余风险

- 搜索索引重复文档问题先于本任务存在，本次未扩大范围修复；它会阻止用搜索接口作为升级回归证据，但生产构建与普通文档路由验证通过。
- `bun.lock` 同时承载并行安全任务的依赖解析；集成时需只合并本任务的 Next/SWC/PostCSS 增量，避免覆盖其他任务正在处理的依赖。
