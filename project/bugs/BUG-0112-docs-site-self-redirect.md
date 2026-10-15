---
id: BUG-0112
type: bug
status: investigating
priority: P1
owner: docs-site
requirement: REQ-0003
plan: PLAN-0003
source: TASK-0047
related_tasks: [TASK-0270, TASK-0047]
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 公开文档页与 Markdown 别名返回 307 自重定向

## 用户流程

- Given：用户访问本仓的本地生产文档构建，含完整中英文内容。
- When：打开当前文档站首页/安装页或点击「查看 Markdown」。
- Then：页面应按 Cookie / Accept-Language 显示中英文内容，Markdown 应返回正文。

## 实际行为

GET /getting-started/installation-and-updates/（FD_LOCALE=en 或 zh）及 /reference/configuration-paths.md 均反复返回 307，Location 等于原请求路径；fetch 最终报 redirect count exceeded。

## 环境与失败证据

- Windows / Node、Bun；Desktop 版本 0.1.3，docs-site Next.js 16.3.6 + Fumadocs 16.14.1，源码基线 11719d84d。
- bun run --cwd apps/docs-site build 生成 113 静态页，test 34 项及根 check 通过，之后本地 next start HTTP 探针复现。
- 访问仅 localhost 临时端口，探针结束已关闭子进程；无部署、用户状态或真实 Provider。
- 本轮文档迁移未修改 proxy.ts、next.config.mjs、search route 或 source.ts；修复前需在实际接缝建立失败回归，不能将该事实代替旧构建运行对照。

## 最小复现

1. 在仓库安装依赖并构建 apps/docs-site。
2. 使用 next start 在本地启动生产产物。
3. GET /getting-started/installation-and-updates/（FD_LOCALE=en 或 zh）及 /reference/configuration-paths.md 均反复返回 307，Location 等于原请求路径；fetch 最终报 redirect count exceeded。

## 根因调查

优先检查 hidden-locale middleware 与 Next 的请求路由/URL 规范化交互；目前未锁定根因，不能仅凭 build 成功推断可访问。

## 回归与修复

由 TASK-0270 执行；覆盖正常访问、语言选择、搜索及 Markdown 输出的连续流程。未部署、尚未修复。
