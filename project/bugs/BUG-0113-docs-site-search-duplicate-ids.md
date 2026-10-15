---
id: BUG-0113
type: bug
status: verifying
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

hideLocale=always 让中英页面共用 URL；createFromSource 默认按 page.url 作为 ID。Fumadocs 16.14.1 将全部语言放入同一索引后按 locale 过滤，插入第二种语言的首页时 ID `/` 冲突。真实生产 HTTP 回归中，两种 locale 均触发 DOCUMENT_ALREADY_EXISTS，与本地 IP 绑定问题无关。

## 回归与修复

由 TASK-0270 使用公开 buildIndex 扩展，将 ID 设为 locale + URL，同时保留公开 URL、正文结构和 locale 过滤。真实生产回归中英文搜索从 500 转为 200，结果各自只返回对应语言的配置页，并可跟随中立链接读到配置正文；整个生产 HTTP 套件 6/6 通过，既有包内测试加 CI 顺序合同共 35/35 通过，质量合同 102/102、build 与完整根 check 通过。待用户功能接受；未部署，未运行远程 CI。
