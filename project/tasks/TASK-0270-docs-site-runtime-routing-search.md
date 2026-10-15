---
id: TASK-0270
type: task
status: in_progress
priority: P1
owner: docs-site
requirement: REQ-0003
plan: PLAN-0003
source: TASK-0047
related_bugs: [BUG-0112, BUG-0113]
execution: serial
branch: main
worktree: .
base_commit: 11719d84d
read_paths: [apps/docs-site, docs/adr, docs/dev, project/tasks/TASK-0047-repository-docs-brand-migration.md]
write_paths: [apps/docs-site, .github/release-notes/v0.1.3.md, project/bugs/BUG-0112-docs-site-self-redirect.md, project/bugs/BUG-0113-docs-site-search-duplicate-ids.md, project/bugs/README.md, project/tasks/TASK-0270-docs-site-runtime-routing-search.md, project/tasks/TASK-0047-repository-docs-brand-migration.md, project/tasks/README.md]
exclusive_paths: [apps/docs-site]
depends_on: [TASK-0047]
conflicts_with: [TASK-0047, TASK-0048, TASK-0154, TASK-0197, TASK-0218, TASK-0223]
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 修复文档站生产访问与搜索链路

## 目标与来源

用户已授权 README/docs 二开适配；TASK-0047 成品验证发现阻止阅读的页面自重定向及搜索 500。本任务独立承接行为修复（Upstreamable），不将文档改名提交与行为修改混为一项。

## 范围与并发

- 单 Agent，本地 main 串行；TASK-0047 的文档提交 11719d84d 已集成，主工作区起步干净，无并行写入。与 TASK-0048 及共享发布说明的任务串行集成。
- 调查 middleware/Next 请求交互、Markdown rewrite、Fumadocs 搜索 ID 与语言过滤；在实际生产接缝补回归后作最小修复。允许添加包内 helper 与测试，但不改依赖版本、不改公开 URL 合同。
- 保留 hidden-locale 公共 URL、FD_LOCALE / Accept-Language、完整中英内容、canonical、sitemap、LLM/Markdown、社交卡与品牌口径。
- 不启动 Desktop / verify:ui、不碰真实状态/Provider、不部署、不改服务器或发布设置。

## Given / When / Then 与最低验证

- Given 完整双语站点；When 从无语言前缀首页打开安装/配置页并切换语言，再点击 Markdown；Then 返回正确语言的页面/Markdown，无重定向环，URL 继续中立。
- Given 中英页面共用 URL；When 分别搜索中文与英文，再打开结果；Then 索引成功、结果链接可用且不混入其他语言。
- 先将当前 localhost 307 自循环与搜索 DOCUMENT_ALREADY_EXISTS 变为可失败回归或生产基线；优先真实 NextRequest/Fumadocs loader/index，不 mock 内部协作者。框架路由必须用构建后 localhost HTTP 流程复验。
- 定向 tests → test:impact（必要时按脚本回退 test:changed）→ docs-site check/build → 生产 HTTP 中文/英文页面、Markdown、搜索、sitemap/robots/llms/社交卡 → 根 bun run check。

## 验收与交付

工程验证待完成；技术评审为单 Agent 自审。人工功能验收待用户反馈。提交与本地 main 集成后绑定实际提交，未获发布/部署授权。

## 交付记录

- 当前基线：已捕获两个生产入口失败；新回归/修复待实施。
- 采用直接修复与少量可测接缝；只有源码/失败回归证明必要时才重构，不改动其他应用。
