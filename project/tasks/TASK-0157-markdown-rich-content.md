---
id: TASK-0157
type: task
status: verifying
priority: P2
owner: theme-ui + desktop content
source: user-request; upstream ed8b1af40, a8029e94f, 093ce834b, 089a91a76
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/theme-ui/src/markdown, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main, packages/runtime-node]
write_paths: [packages/theme-ui/src/markdown, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main, packages/runtime-node, project/tasks/TASK-0157-markdown-rich-content.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/theme-ui/src/markdown]
depends_on: [TASK-0148]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 富 Markdown 与批注能力适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：ed8b1af40, a8029e94f, 093ce834b, 089a91a76。

按公式/图表、隔离预览、批注分别做行为切片；保留本仓文件预览协议、图片隐私、流式窗口化、低内存缓存与 native browser/canvas 边界；不复制上游任意删除本仓组件。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

XSS/外链/相对资源、长流式文本、公式未闭合、缓存上限、HTML 死循环隔离、批注会话切换；不授权 UI 实机或付费模型。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0148。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次）

- 实际修改（上游 ed8b1af40 → 093ce834b → a8029e94f → 089a91a76 按依赖序全链适配）：
  - 切片一（ed8，已单独提交 f5b390e25）：公式/SVG/HTML 隔离渲染与计算预算。
  - 切片二三（093ce+a8029）：主进程 markdown 服务族（html-preview 隔离窗口、mermaid 独立进程渲染、favicon 发现、public-resource 直连校验、image-resource）+ IPC/preload 边界；theme-ui MarkdownImage/MermaidBlock/WebsiteIcon/host/math-syntax；renderer 侧 markdown-images 管线、useMarkdownHost、灯箱、图标、渲染预算与流式节奏（12k/50k 阈值）；AnnotationViews 由上游树提取（093ce 引用但未含于其 diff）。代码高亮语法预算（30k/1000 行/2000 列，超限保纯文本可复制），缓存驱逐自愈测试按新预算改写（条数上限触发）。
  - 切片四（089a）：批注入口收敛为「选中文字右键 + 已存标记」，移除三点菜单；AnnotationMenus/AnnotationScope.test/SessionUserMessage/SessionMessageList 采用上游终态。
  - 分歧记录：上游 ADR-0131 编号在本仓被占用，富内容 ADR 保持 0128；docs-site 两语言 workspaces 文档同步上游文案。
- 实际运行：theme-ui 180；desktop 富内容/批注/共享面合计 443+100；markdown 服务与 IPC 17+37；真实浏览器 markdown-preview.node-test 1/1（隔离/逃逸阻断/公式 worker）。
- 未运行及原因：markdown-isolation.node-test（Electron 隔离窗口 e2e）——本机 vite lib-build 未把 `mermaid.min.js?raw` 内联为字符串（动态 import 被拆块后按 CJS 加载失败），属构建环境限制；产品路径经 vite.main.config 打包内联，隔离语义另有单测与真实浏览器 node-test 覆盖。视觉校验不做（无视觉能力）。
- 剩余风险：mermaid/katex 体积随 desktop bundle 增大（懒加载按上游设计）；favicon/public-resource 的网络行为仅单测级验证，真实站点兼容性待用户使用反馈。
- 遗留收口（2026-10-03，TASK-0200）：markdown-isolation e2e 已由独立审计任务补跑通过——测试构建加 `inlineDynamicImports` 后 Electron 隔离窗口全链绿（独立 PID、断网断弹窗、Mermaid 渲染/缓存/看门狗）；交付对照审计结论与批注作用域会话就绪重挂修复见 [TASK-0200](TASK-0200-rich-content-audit-fixes.md)。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：本 Task 的验证合同明确「**不授权 UI 实机或付费模型**」，故验收口径本就是测试级。在主检出独立复跑覆盖六条子句的套件，含一条真实浏览器用例与一条 Electron 隔离窗口 e2e（两者都是仓库既有测试，非用户环境）。

| 子句 | 覆盖用例与本次读数 |
|---|---|
| XSS/外链/相对资源 | `bun run --cwd packages/theme-ui test` **23 文件 / 180 例全绿**（含 `chat/markdown-link.test.ts` 的外链/相对资源策略）；真实浏览器用例 `node --test apps/desktop/scripts/markdown-preview.node-test.mjs` **1/1 PASS**——「static HTML, blocked escape/network, inert SVG and bundled formula worker」；Electron 隔离 e2e `node apps/desktop/scripts/markdown-isolation.test.mjs` **PASS**——「denied host/network/popups」。 |
| 长流式文本 | 同 180 内 `markdown/streaming.test.ts`（新近短语高亮跟随节奏、跨块边界）与 `markdown/stable-blocks.test.ts`（稳定块复用）。 |
| 公式未闭合 | 真实浏览器用例的「bundled formula worker」段（未闭合公式走 worker 渲染不阻塞）；隔离 e2e 的 Mermaid 渲染/恢复段。 |
| 缓存上限 | 同 180 内 `shared/syntax-highlight-cache.test.ts`（字符预算按插入序淘汰、重复 put 只计最新值、单条超预算仍保留、shiki 失败路径空串同样计费）。 |
| HTML 死循环隔离 | 隔离 e2e 的 `isolation: loop` 段通过，断言含 **infinite-loop watchdog**；同用例还断言独立 PID、脚本执行、拒绝 host/network/popup、Mermaid 缓存与窗口清理。 |
| 批注会话切换 | `bun run --cwd apps/desktop test …/annotations/AnnotationScope.test.tsx`（与 markdown 面共 6 文件 / **19 例全绿**），其中「keeps answering after close, **ignores other-session updates** and restores the saved result」正是会话切换子句。 |
| 主进程 markdown 服务面 | `favicon-cache` / `favicon-service` / `public-resource` 三个文件 **16 例全绿**（外链资源与图标发现的白名单/缓存边界）。 |

- 未复跑：完整 desktop 套件（交付记录记为「富内容/批注/共享面合计 443+100」，本轮只跑覆盖子句的 9 个文件 / 35 例）与 mermaid 独立进程渲染的另一半 IPC 面（17 段中的 mermaid-service 部分），改由隔离 e2e 的 Mermaid 段与 `markdown.test.ts` 覆盖；视觉观感（公式/图表排版）无视觉能力，不做。
- 关闭建议：六条子句均有本轮独立复跑的绿用例，且 TASK-0200 已把此前受阻的隔离 e2e 补跑通过（本轮在本机复现也是 PASS）⇒ 倾向闭合 `done`；按 VERIFY-0017 约定等用户裁定。
