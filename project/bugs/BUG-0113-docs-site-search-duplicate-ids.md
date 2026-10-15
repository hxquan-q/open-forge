---
id: BUG-0113
type: bug
status: investigating
priority: P2
owner: docs-site
requirement: REQ-0003
plan: PLAN-0003
source: TASK-0047
related_tasks: [TASK-0270, TASK-0047]
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 文档站搜索索引因跨语言 URL 重复而返回 500

## 用户流程

- Given：用户访问本仓的本地生产文档构建，含完整中英文内容。
- When：在文档站搜索 configuration 或安装主题。
- Then：搜索应返回对应语言的可点击文档结果，切换语言后可继续搜索。

## 实际行为

GET /api/search/?query=configuration&locale=en 返回 500；服务端抛 A document with id "/" already exists，code=DOCUMENT_ALREADY_EXISTS。

## 环境与失败证据

- Windows / Node、Bun；Desktop 版本 0.1.3，docs-site Next.js 16.3.6 + Fumadocs 16.14.1，源码基线 11719d84d。
- bun run --cwd apps/docs-site build 生成 113 静态页，test 34 项及根 check 通过，之后本地 next start HTTP 探针复现。
- 访问仅 localhost 临时端口，探针结束已关闭子进程；无部署、用户状态或真实 Provider。
- 本轮文档迁移未修改 proxy.ts、next.config.mjs、search route 或 source.ts；修复前需在实际接缝建立失败回归，不能将该事实代替旧构建运行对照。

## 最小复现

1. 在仓库安装依赖并构建 apps/docs-site。
2. 使用 next start 在本地启动生产产物。
3. GET /api/search/?query=configuration&locale=en 返回 500；服务端抛 A document with id "/" already exists，code=DOCUMENT_ALREADY_EXISTS。

## 根因调查

hideLocale=always 让中英页面共用 URL；现有 createFromSource 默认按 page.url 作为 ID，需用真实 loader fixture 证实索引冲突，并区分 locale 过滤与文档 ID 唯一性。

## 回归与修复

由 TASK-0270 执行；覆盖正常访问、语言选择、搜索及 Markdown 输出的连续流程。未部署、尚未修复。
