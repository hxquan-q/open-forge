---
id: TASK-0048
type: task
status: blocked
priority: P0
owner: apps/docs-site
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: unassigned（等待 D 阶段和社区目标确认）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [apps/docs-site/README.md, apps/docs-site/lib, apps/docs-site/content/docs, project/requirements/PRODUCT.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md]
write_paths: [apps/docs-site/lib/site.ts, apps/docs-site/content/docs, apps/docs-site/public, apps/docs-site/test, .github/release-notes]
exclusive_paths: [apps/docs-site/lib/site.ts, apps/docs-site/content/docs, apps/docs-site/public, .github/release-notes]
depends_on: [TASK-0044, TASK-0045, TASK-0049]
conflicts_with: [TASK-0047]
integration_status: pending
created: 2026-09-23
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 公开文档站品牌、正文与发现入口迁移

## 目标

让公开文档站的站点元数据、中文/英文内容和 SEO/LLM 发现入口准确反映 Open Forge，并保持文档路由和语言合同有效。

## 范围

### 并发评估

- 结论：不支持与 TASK-0047 并发；文档身份、链接和 Release Notes 需要统一集成。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：Desktop 与生态品牌映射完成；`TASK-0049` 的社区目标确认完成。
- 冲突文件/独占路径：`apps/docs-site/lib/site.ts`、中英文 `content/docs`、站点发现元数据和 Release Notes。
- Branch：`forge/dev`；Worktree：实施前按当前协作状态确认。
- 集成负责人：coordinator。
- 集成顺序：TASK-0044 / TASK-0045 → TASK-0049 → 本任务；与 TASK-0047 串行集成。

### 做

- 更新站点名称、页面标题、canonical/SEO/OG 元数据与已冻结的公开目标链接。
- 清查公开文档正文中的产品名、安装命令、数据路径和旧仓库坐标；中文页及 `content/docs/en/` 镜像保持页面集合和链接合同一致。
- 更新文档发现入口并确认 sitemap、`llms.txt`、`llms-full.txt` 和搜索索引仍由公开内容正确生成。

### 不做

- 不创建或部署新域名，不修改 Vercel 项目，不向外部服务发布内容。
- 不把内部 `project/`、ADR 或私有服务端资料复制到公开站点。
- 不改未确认的社区目标或冻结的技术兼容标识。

## Given / When / Then

- Given：用户从 Open Forge 的公开文档站选择中文或英文内容；When：浏览指南、搜索文档或使用 LLM 索引；Then：品牌、页面元数据、语言镜像和链接一致，所有被收录页面均可构建并访问。

## 必须保持

- 中文默认目录与 `content/docs/en/` 页面集合保持同步。
- canonical、sitemap 和无语言前缀路由遵守 docs-site 既有合同。
- 公开文档不包含内部验证记录、凭据或无法确认的产品承诺。

## 测试与验证

- 定向检查：双语页面集合、站内链接、canonical/sitemap/LLM 索引输出。
- 用户流程：从语言切换器进入一个公开指南，使用搜索/Markdown 索引并检查页面元数据。
- 质量检查：在 `apps/docs-site` 运行 `bun run check` 与 `bun run build`；核对 README 规定的构建后搜索索引。

## 阻塞

- 仅剩 `TASK-0045`（已 ready：CLI 命令名 `openforge`、旧命令直接切换不保留别名、`vetta-serv` 改 `openforge-serv`，2026-09-25 决策齐）实施收口，及随之关闭的 `TASK-0049`；`TASK-0044` 已完成，社区入口已决策暂不建设（2026-09-25，保留现有外部链接）。当前正式站点与社区 URL 未确认前只使用已冻结目标，不引入新地址。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
