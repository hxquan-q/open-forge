---
id: TASK-0270
type: task
status: verifying
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
write_paths: [apps/docs-site, .github/workflows/docs-site.yml, .github/release-notes/v0.1.3.md, project/bugs/BUG-0112-docs-site-self-redirect.md, project/bugs/BUG-0113-docs-site-search-duplicate-ids.md, project/bugs/README.md, project/tasks/TASK-0270-docs-site-runtime-routing-search.md, project/tasks/TASK-0047-repository-docs-brand-migration.md, project/tasks/README.md]
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

调查修正：307 自循环只在探针以 `next start --hostname 127.0.0.1` 绑定时复现，NextURL 将其改为 localhost，rewrite 被视作外部请求并再次进入语言中间件。同一构建仅改为一致的 localhost 绑定与访问后，双语阅读和 Markdown 均通过；不能将该现象扩大为部署站点不可用。移除临时日志，生产路由配置保持原状，以正确绑定的生产回归守护访问流程。搜索重复 ID 与此无关，仍在同一构建返回 500，需修复。

## 范围与并发

- 单 Agent，本地 main 串行；TASK-0047 的文档提交 11719d84d 已集成，主工作区起步干净，无并行写入。与 TASK-0048 及共享发布说明的任务串行集成。
- 调查 middleware/Next 请求交互、Markdown rewrite、Fumadocs 搜索 ID 与语言过滤；在实际生产接缝补回归后作最小修复。允许添加包内 helper 与测试，但不改依赖版本、不改公开 URL 合同。
- 保留 hidden-locale 公共 URL、FD_LOCALE / Accept-Language、完整中英内容、canonical、sitemap、LLM/Markdown、社交卡与品牌口径。
- 不启动 Desktop / verify:ui、不碰真实状态/Provider、不部署、不改服务器或发布设置。
- 为防止仅 build 通过再次漏掉搜索运行时故障，将生产 HTTP 回归接入既有 docs-site CI 的 Build 之后；先补流水线顺序/失败阻断合同。保留 dev push、PR 路径筛选、workflow_dispatch、Ubuntu、只读 contents 权限、下载缓存和取消策略，不新增部署或上传步骤。工作流注释同步移除未经确认的上游域名/生产部署声明。

## Given / When / Then 与最低验证

- Given 完整双语站点；When 从无语言前缀首页打开安装/配置页并切换语言，再点击 Markdown；Then 返回正确语言的页面/Markdown，无重定向环，URL 继续中立。
- Given 中英页面共用 URL；When 分别搜索中文与英文，再打开结果；Then 索引成功、结果链接可用且不混入其他语言。
- 先将初始本地 IP 绑定的 307 自循环与搜索 DOCUMENT_ALREADY_EXISTS 变为可失败回归或生产基线；优先真实 NextRequest/Fumadocs loader/index，不 mock 内部协作者。框架路由必须用构建后 localhost HTTP 流程复验。
- 定向 tests → test:impact（必要时按脚本回退 test:changed）→ docs-site check/build → 生产 HTTP 中文/英文页面、Markdown、搜索、sitemap/robots/llms/社交卡 → 根 bun run check。

## 验收与交付

工程验证已完成；技术评审为单 Agent 自审，非独立评审。人工功能验收待用户反馈，保持 verifying。提交与本地 main 集成后绑定实际提交；未推送、未发布或部署。

## 交付记录

- 红灯基线：构建后 `test:production` 首轮 4 失败 / 1 通过；临时边界日志证明 IP 规范化导致中间件二次调用。将绑定和访问统一为 localhost 后，同一产物 2 失败 / 3 通过（仅双语搜索 500）；阅读、Markdown 与发现入口均通过。
- 搜索修复：使用公开 `buildIndex` 扩展，以语言和公开 URL 组成唯一 ID；保留 URL、structuredData 和框架的 locale 过滤，不退回已弃用的按语言分库 API。
- 采用直接修复与少量可测接缝；只有源码/失败回归证明必要时才重构，不改动其他应用。
- 红绿证据：同一 localhost 生产回归中的中文/英文搜索先稳定返回 500，修复后转为 200；完整 HTTP 套件新增语言协商与前缀规范化后 6/6 通过。CI 顺序合同先因缺少构建后测试失败，再添加既有 workflow 的后续步骤后通过。
- 实际验证：docs-site 包内测试 7 文件 / 35 项通过；test:impact 对包配置保守回退 test:changed，仅选择 docs-site，35/35 通过；质量门禁合同定向 102/102 通过；docs-site check、根 build:docs（113 静态页）与完整根 bun run check 全部通过；本 Task 的 worktree:check 通过。git diff --check 通过，声明头 ratchet new=0；临时日志全部移除。
- 技术自审：核对 buildIndex 使用公开扩展，框架仍负责 locale 过滤、breadcrumbs 和索引生命周期；结果 URL 不含语言前缀。生产 proxy、Next 配置、语言注册表和内容路径均无改动。测试启动 Node 子进程，仅绑定 localhost，按就绪信号同步，并在结束/失败后清理；CI 保持只读权限和既有触发范围，未添加部署。
- 未运行：远程 CI/Ubuntu 执行、外部域名部署、真实浏览器点击语言切换、Desktop/verify:ui 和真实 Provider。HTTP 证据验证后端路由/内容/搜索合同，不代替浏览器交互或用户人工接受。
- 验收入口：在 apps/docs-site 先运行 bun run build，再运行 bun run test:production；手动阅读可在构建后运行 bun run preview，从 localhost:4321 打开安装/配置页并切换语言，搜索 configuration / 配置后打开结果，再选择查看 Markdown。预期品牌、语言与数据目录一致，搜索无 500；测试服务已关闭。
