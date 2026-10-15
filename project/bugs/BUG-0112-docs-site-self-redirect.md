---
id: BUG-0112
type: bug
status: done
priority: P3
owner: docs-site
requirement: REQ-0003
plan: PLAN-0003
source: TASK-0047
related_tasks: [TASK-0270, TASK-0047]
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 本地生产探针以回环 IP 绑定时产生 307 自重定向

## 用户流程

- Given：用户访问本仓的本地生产文档构建，含完整中英文内容。
- When：打开当前文档站首页/安装页或点击「查看 Markdown」。
- Then：页面应按 Cookie / Accept-Language 显示中英文内容，Markdown 应返回正文。

## 实际行为

探针以 `next start --hostname 127.0.0.1` 绑定并访问该 IP 时，GET /getting-started/installation-and-updates/（FD_LOCALE=en 或 zh）及 /reference/configuration-paths.md 反复返回 307，Location 等于原请求路径；fetch 最终报 redirect count exceeded。此绑定条件在初始报告中遗漏，调查后修正；不能据此认定部署站点不可访问。

## 环境与失败证据

- Windows / Node、Bun；Desktop 版本 0.1.3，docs-site Next.js 16.3.6 + Fumadocs 16.14.1，源码基线 11719d84d。
- bun run --cwd apps/docs-site build 生成 113 静态页，test 34 项及根 check 通过，之后本地 next start HTTP 探针复现。
- 访问仅 localhost 临时端口，探针结束已关闭子进程；无部署、用户状态或真实 Provider。
- 本轮文档迁移未修改 proxy.ts、next.config.mjs、search route 或 source.ts；修复前需在实际接缝建立失败回归，不能将该事实代替旧构建运行对照。

## 最小复现

1. 在仓库安装依赖并构建 apps/docs-site。
2. 使用 `next start --hostname 127.0.0.1` 在本地启动生产产物。
3. GET /getting-started/installation-and-updates/（FD_LOCALE=en 或 zh）及 /reference/configuration-paths.md 均反复返回 307，Location 等于原请求路径；fetch 最终报 redirect count exceeded。

## 根因证据

- 直接调用 createI18nMiddleware 时返回正常内部 rewrite，无自重定向。
- 临时 `[DEBUG-0270]` 日志捕获单次 IP 请求先从 `/` rewrite 到 `http://localhost:<port>/zh/`，再以 `/zh/` 二次进入中间件并重定向回 `/`。
- 当前 NextURL 的 parseURL 将回环 IP 改为 localhost，而路由器以 initURL 的 `127.0.0.1` 为同源判断依据；主机名不一致导致该 rewrite 被作为外部 HTTP 请求执行。
- 保持同一构建产物与生产逻辑，仅将探针绑定和访问统一为 localhost 后，双语首页、安装页、配置页与 Markdown 从 307 转为 200。搜索仍 500，由 BUG-0113 独立修复。

## 回归与修复

由 TASK-0270 修正测试环境，README 说明本地生产探针使用 localhost，未修改生产路由或 Next 配置。生产 HTTP 回归已覆盖双语连续阅读、Markdown、Cookie/浏览器语言及语言前缀规范化；6/6 通过，临时日志已移除。该条按可重复差分证据闭合为本地探针问题，无用户产品行为变更需要人工接受；不宣称真实部署已验证。
