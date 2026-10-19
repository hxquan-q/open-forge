---
id: TASK-0047
type: task
status: verifying
priority: P0
owner: release/docs
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: main
worktree: unassigned（本地 main 主工作区串行）
base_commit: 018358bb27b6f7854e932c972ae722fcc2ca79a6
read_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, apps/docs-site, apps/desktop/src/shared, apps/desktop/scripts, packages/action-rpc/src/endpoint-file.ts, project/requirements, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, .github]
write_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, apps/docs-site/README.md, apps/docs-site/content/docs, apps/mobile/README.md, apps/remote-relay/README.md, packages/plugins/README.md, packages/plugins/plugin-cli/README.md, project/tasks/TASK-0047-repository-docs-brand-migration.md, project/tasks/README.md, .github/release-notes, apps/docs-site/lib/site.ts, apps/docs-site/lib/layout.shared.tsx, apps/docs-site/components/brand-mark.tsx, apps/docs-site/components/home.tsx, apps/docs-site/components/studio-banner.tsx, apps/docs-site/public/images, project/requirements/PRODUCT.md]
exclusive_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, apps/docs-site/content/docs, apps/mobile/README.md, apps/remote-relay/README.md, packages/plugins/README.md, packages/plugins/plugin-cli/README.md, .github/release-notes, apps/docs-site/lib/site.ts, apps/docs-site/lib/layout.shared.tsx, apps/docs-site/components/brand-mark.tsx, apps/docs-site/components/home.tsx, apps/docs-site/components/studio-banner.tsx, apps/docs-site/public/images, project/requirements/PRODUCT.md]
depends_on: [TASK-0044, TASK-0045, TASK-0049]
conflicts_with: [TASK-0048, TASK-0154, TASK-0197, TASK-0218, TASK-0223]
integration_status: integrated
created: 2026-09-23
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 仓库文档与协作入口品牌迁移

## 目标

完成当前部分更新之外的仓库内公开文档品牌清查，使用户和贡献者看到一致、真实且不破坏命令/路径的 Open Forge 信息。

## 范围

### 并发评估

- 结论：不支持与 TASK-0048 并发；两项共享文档路线、社区链接审查和 Release Notes。
- 当前执行方式：第八片由单 Agent 在本地 main 主工作区串行完成，不新建独立工作树；与 TASK-0048 及共享发布说明任务不同时写共享文件。前七片的隔离工作树事实保留在历史交付记录。
- 可并行 Task：无。
- 前置依赖：Desktop/生态名称合同完成；`TASK-0049` 确认社区去向。现有工作树中已修改的 README、QUICKSTART、CONTRIBUTING 和开发指南必须作为输入保留，不覆盖或回退。
- 冲突文件/独占路径：根文档、`docs/**`、`.github` 模板与 Release Notes。
- 当前 Branch / Worktree：main / 主工作区；前七片来源分支为 `task/TASK-0047-repository-docs-brand-migration`，其集成与清理状态以历史记录为准。
- 集成负责人：coordinator。
- 集成顺序：TASK-0044 / TASK-0045 → TASK-0049 → 本任务；与 TASK-0048 串行集成。

### 做

- 扫描 README、QUICKSTART、CONTRIBUTING、SECURITY、`docs/**` 和 GitHub 协作模板中的用户可见品牌与旧仓库入口。
- 完成未迁移的产品名称、数据目录和开发说明；核对中英文镜像、命令、路径、许可证与联系入口。
- 对已冻结目标更新到 `hxquan-q/open-forge`；对尚未批准的域名、npm scope 和社区 URL 保留当前有效值并标明不代表迁移已完成。

### 不做

- 不覆盖当前工作树已有修改，不改已发布历史 Release Notes。
- 不猜测或创建 Discord、官网、域名、邮箱等外部入口。
- 不改技术兼容 token、服务端私有仓库内容或生产代码。

## Given / When / Then

- Given：用户或贡献者从仓库首页、快速开始、贡献指南或协作模板进入项目；When：按文档设置、运行或贡献；Then：Open Forge 品牌边界、数据路径、命令和链接准确，未确认的外部目标不会被伪装成已迁移。

## 必须保持

- `docs/` 与公开文档中的操作命令必须可核实；文档变更不改变运行时行为。
- 保留 `.vettapkg`、`@vetta/*`、`VETTA_*` 和其他被冻结的技术标识。
- 用户和其他 Agent 的既有未提交内容完整保留。

## 测试与验证

- 定向检查：相对 Markdown 链接、命令、文件路径、仓库坐标和双语对应关系。
- 用户流程：从 README 的快速入口到本地开发/贡献步骤，逐项核对命令与目标路径。
- 质量检查：按文档规范核对事实、链接和路径；仅在改到受检查代码时运行相应代码门禁。

## 阻塞

- 阻塞已解除（2026-10-06，TASK-0217 复核）：`TASK-0045` 与 `TASK-0049` 的 frontmatter 均为 done，原阻塞条件（等 0045 收口、随 0049 关闭）已满足。但**本任务尚未实施**——交付记录的四条（实际修改、实际运行、未运行及原因、剩余风险）全为空。状态转 ready，等待实施。原有约束保持不变：冻结技术标识（`.vettapkg`、`@vetta/*`、`VETTA_*`）不改；社区继续使用已冻结的现有入口。

## 第三片范围（2026-10-15）：README 重写与上游入口脱离

用户决策（2026-10-15，AskUserQuestion 确认）：

- 上游坐标处理：**尽量脱离上游**。移除 openvetta.com 产品站/下载页链接与 open-vetta 仓库坐标（克隆段、CodeRabbit 徽章、Discussions/Security Advisories 链接），入口收缩到本仓库（README、QUICKSTART、`docs/`、`apps/docs-site/content/`）与已冻结的社区入口（Discord 邀请 `qGqkk22Vg9`）；上游仅在 Credits 署名出现。
- 重写幅度：**结构重排 + 事实刷新**，中英两份同步；产品事实刷新到当前状态（仓库地图补 `apps/remote-relay`、`apps/ssh-helper`；origin 默认分支为 `main`，克隆段不再 `git switch dev`；贡献 PR 目标保持 `dev`，与 CONTRIBUTING 一致）。

边界：

- 冻结标识不动：`@vetta-org/plugin-cli`、`npx vetta-plugin-cli`、`npm run install:vetta`、`.vettapkg`、`@vetta/*`、`VETTA_*`。
- Credits 保留上游署名（「independently maintained derivative of Open Vetta」）与 LINUX DO 友情链接。
- 不猜测或创建新外部入口；`docs/desktop/build-modes.zh-CN.md` 不存在，中英两份统一链接 `.en.md`。
- 声明头 `<!-- Modified by The Open Forge contributors. -->` 保留。
- 本片只动 `README.md` 与 `README.zh-CN.md`；QUICKSTART/SECURITY/CONTRIBUTING 内的上游坐标留后续切片。

## 交付记录（第一片，2026-10-06）

- 实际修改：README.md 与 README.zh-CN.md 各把散文里的产品称呼改为 Open Forge（英文 5 处、中文 3 处），`Vetta Serv` 改为 `Open Forge Serv`（依据 PLAN-0003 已定的 `openforge-serv` 代号）。冻结标识一律不动：`@vetta-org/plugin-cli`、`npx vetta-plugin-cli`、`npm run install:vetta` 已逐条核实为真实存在的包名与命令（`packages/plugins/plugin-cli` 的 bin 与 init 模板）。
- 刻意未改（待用户定，不是遗漏）：
  - README「Run from source」段的 `git clone https://github.com/openvetta/open-vetta.git` 与 `cd open-vetta`——改成 fork 坐标还是保留上游，取决于这份 README 面向谁；本仓为私有仓库，指向 fork 与指向上游都说得通，属仓库坐标决策。
  - CodeRabbit 徽章的 `github.com/openvetta/open-vetta` 仓库坐标，同上。
- 验证：`grep` 复核两份 README 后，除上述两处坐标外只剩冻结标识与上游署名（「Open Forge is an independently maintained derivative of Open Vetta」）。
- 未运行及原因：未跑运行时测试（纯文档改动，不改变任何命令与路径）。
- 剩余风险：本任务覆盖 84 个文件、334 行上界，本条只做了 README 中英对；QUICKSTART、CONTRIBUTING、SECURITY 与 `docs/` 待后续切片。

- 新增阻塞（2026-10-06，TASK-0048 记录同源）：`docs/` 树的清查不能按模式替换——里面同时混着产品称呼、术语名（被双链与根 CONTEXT 索引引用）、插件名（Vetta UI Design）与商业订阅品牌（Vetta Go / Vetta Zen），还有大量上游沿革记录（ADR、greenfield 实施日志、适配研究）。按模式替换当场打破术语索引，已整体撤回。需要先有一份「术语与品牌对照表」并决定沿革记录是否改名，才能继续。README、QUICKSTART、SECURITY 三份已按散文称呼改名并交付。

## 第四片范围（2026-10-15）：docs/ 树清查解阻 + QUICKSTART/SECURITY/CONTRIBUTING 上游入口处理

用户决策（2026-10-15）：docs/ 树继续修改，QUICKSTART 中英对、SECURITY、CONTRIBUTING 中英对内部上游入口一并处理；**没有 fork 等价物的入口用占位**。

### 术语与品牌对照表（v1，解阻依据）

| 类别 | 示例 | 处理 |
|---|---|---|
| 冻结技术标识 | `VETTA_*`、`@vetta/*`、`@vetta-org/*`、`vetta-plugin-cli`、`install:vetta`、`.vetta/`、`.vettapkg`、schema `$id` | 一律不动 |
| 术语词条 | `docs/glossary/**`（根 CONTEXT.md 索引合同） | 词条正文不改名 |
| 上游沿革引用 | ADR 内 `openvetta/open-vetta#N`、docs/agent、docs/adapter、docs/ai 的上游对照/分析正文（含上游 commit 与本机路径快照） | 保留原坐标不改名——改名即捏造对照事实或断研究谱系 |
| 上游商业品牌 | `Vetta Go`、`Vetta Zen`、`Vivi` | 保留（上游 SKU 与品牌形象的事实引用）；fork 自有文案不使用 |
| 产品自称（Serv 代号） | 散文 `Vetta Serv` | 按第一片先例改 `Open Forge Serv`（PLAN-0003 已批代号） |
| 活跃工程文档散文自称 | docs/desktop、dev、plugin、theme、deploy、telemetry、actions、apps、release、open-marketplace.md 中指本产品的 Vetta/OpenVetta | 改为 Open Forge（逐处核对语境，不盲替换） |
| i18n 目录字符串引用 | open-marketplace.md 引「Vetta 内置」（catalog `vettaBuiltin` 实况） | 以 catalog 实况为准不改；运行时品牌串归 TASK-0249/0250 范围 |
| 入口 URL（有 fork 等价物） | 克隆地址、Releases、站内文档路径 | 改指 `hxquan-q/open-forge` 或站内路径 |
| 入口 URL（无 fork 等价物） | 官网、官网下载页、Discussions、Security Advisories（PVR 未启用，API 实测 404）、官方市场仓库、Serv 后端 | 占位（`example.com` 风格示例值或显式「占位/待建」标注） |
| 目录名 | `docs/agent/subagent/vetta/` | 不改（会断相对链接，超出文档清扫范围） |
| 上游品牌话术文档 | `docs/user-facing-copy.md`（Vetta 与 Vivi 品牌词体系） | 加 fork 口径说明头，正文不重写（内容设计属独立工作） |

### 边界

- `docs/agent/**`、`docs/adapter/**`、`docs/ai/**`、`docs/adr/**`、`docs/glossary/**` 本片不改名（沿革/术语/对照研究），表内有决策依据；后续如需品牌化另切片逐文件处理。
- 文档中的 URL 示例以当前 `.env.example`（`example.com` 风格）为准绳；`releases.openvetta.com` 等已核实不是现行代码默认值（陈旧上游示例）。
- Windows 安装器文件名示例按 v0.1.2 实际资产改为 `Open-Forge-<version>-win-x64.exe`。
- 顺手修复上一片遗留：CONTRIBUTING 中英对引用的 `README.md#network-behavior` / `README.zh-CN.md#网络行为` 锚点在重写后已不存在，改指「数据与构建模式」节。
- `.github/pull_request_template.md` 如含上游坐标，仅做坐标替换，不重写模板。

## 交付记录（第三片，2026-10-15）

- 实际修改：`README.md` 与 `README.zh-CN.md` 按用户决策（尽量脱离上游 + 结构重排/事实刷新）整体重写。移除的上游入口：openvetta.com 官网/下载徽章与链接、`openvetta/open-vetta` 克隆坐标与 Discussions/Security Advisories 链接、CodeRabbit 徽章、docs.openvetta.com 全部深层链接。新入口：GitHub Releases（`hxquan-q/open-forge/releases`，v0.1.2 资产经 `gh release view` 核实含安装器）、源码运行段改克隆 fork（origin 默认分支 `main`，删去 `git switch dev`）、扩展模型/文档/架构链接全部改指站内已核实存在的路径（`apps/docs-site/content/docs/**`、`docs/theme/`、`docs/plugin/`、`docs/adr/`、`docs/desktop/build-modes.en.md`）。仓库地图补 `apps/remote-relay`（Cloudflare Worker 远控中继）与 `apps/ssh-helper`（SSH 静态 helper）。
- 边界执行：冻结标识（`@vetta-org/plugin-cli`、`vetta-plugin-cli`、`install:vetta`、`.vetta/marketplace.json`）原样保留；Credits 上游署名与 LINUX DO 友链保留；未创建任何新外部入口。声明头保留（ratchet `new=0`）。
- 刻意说明：`docs.openvetta.com` 在 TASK-0049 中属冻结既有入口，本片按用户 2026-10-15 决策从 README 移除其链接（站点本体与任务记录不受影响），属用户对「面向谁」决策的更新而非违反冻结。
- 验证：两份 README 全部相对链接存在性检查通过；`grep` 复核零 `openvetta.com`/`open-vetta`/`coderabbit` 残留；中文全文回读无编码损坏；`bun run check:quick` 全绿。
- 未运行及原因：未跑运行时测试与 `test:impact`（纯文档改动，不触及任何代码路径）。
- 剩余风险：QUICKSTART 中英对、SECURITY、CONTRIBUTING 内仍指上游坐标（clone URL、下载页、advisory URL），留后续切片；发布说明条目已补。

## 交付记录（第四片，2026-10-15）

- 实际修改（根文档）：`QUICKSTART.md` / `QUICKSTART.zh-CN.md` 下载段改指 GitHub Releases、克隆段改 fork（去 `git checkout dev`）、`docs.openvetta.com` 改指站内 `apps/docs-site/content/docs/`；`SECURITY.md` advisory 入口改 fork URL 并显式占位（私有漏洞上报 API 实测 404 未启用）、文档链接站内化；`CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md` Discussions 改 Discord + 占位、贡献指南链接站内化、市场行占位（fork 运营市场未发布）、克隆改 fork、work-item 引用改 `Fixes #N` / `TASK-xxxx` 台账、修复死锚点 `#network-behavior` → `#data-and-build-modes`（第三片重写移除了旧节）、安全入口改 SECURITY.md + 占位。
- 实际修改（docs/ 树活跃文档，按对照表逐处核对）：`docs/actions/README.md`（`vetta action` → `openforge action`，CLI bin 以 `apps/cli-host/package.json` 核实）；`docs/release/desktop-release-runbook.md` 产品自称；`docs/dev/README.md` 标题去 Vetta，「自动选择 Vetta Desktop 主窗口」改为按品牌档案显示名匹配（`ui-verification.mjs` 的 `mainWindowTitles` 实况）；`docs/dev/vetta-debug.md` 产品自称改 Open Forge（能力名 Vetta Debug / Vetta Action / Vetta home 保留）；`docs/dev/vetta-debug-real-provider-runbook.md` Usage 归一句改 Open Forge、示例 PowerShell 变量 `$vetta*` → `$forge*`；`docs/plugin/` 六文件（README、ai、getting-started ×4、guiding-the-agent 含「八荣八耻」标题、manifest designer 行、app-actions ×2，均先核实无入链锚点）；`docs/deploy/apple-code-signing.md`（`Vetta.app` → `Open Forge.app`、DMG 产物名按 v0.1.2 资产 `Open-Forge-*`、挂载卷/命令块重写、签名 env 示例路径 `~/.config/openforge/`）；`docs/telemetry/` 四文件（自有接口 / 身份定义 / correlationId / 字段表头 / 6.4 标题 → Open Forge）；`docs/user-facing-copy.md` 按表加 Open Forge 口径说明头，上游品牌话术正文不重写。
- 实际修改（声明头）：11 个相对上游已改但缺头的文件补 `<!-- Modified by The Open Forge contributors. -->`（actions/README、kotlin ×3、build-modes ×2、design-gallery、kanban ×2、windows-auto-update、open-marketplace）；本片新改文件中 5 个原本无头（telemetry ×4、vetta-debug-real-provider-runbook）一并补齐。
- 对照表落地实况（保留类核对）：Vetta Debug / Vetta Action / Vetta home 能力名保留；`manifest.md`「Vetta 内置 Skill」为 i18n catalog 实况保留；`media.md` `desktop:vetta` provider 段跟随代码标识保留；`mcp.md` `cowart-vetta` 真实仓库路径保留；`repository.md` 上游沿革句保留；`delivery.md` `# Vetta …` 上游继承注释规则原文保留；`.github/pull_request_template.md` 核实无上游坐标，未改动。
- 验证：处理范围内 `git grep` 复核，剩余 Vetta 命中全部落入对照表保留类，无 `openvetta.com` / `open-vetta` 残留；相对链接与锚点存在性检查通过（含 `README.md#验证-profile`、actions → dev/README、user-facing-copy → 本 Task）；`guiding-the-agent.md` 与 `docs/dev/README.md` 标题改名前核实无入链；windows-auto-update 的产物名/路径以代码（`build-inno-installer.mjs`、`resolveInnoUpdateStoreRoot`）与 v0.1.2 Release 资产清单核实；中文混合串回读无编码损坏；`bun run check:quick` 全绿（声明头 ratchet `new=0`）。
- 未运行及原因：纯文档改动，未跑运行时测试与 `test:impact`（不触及任何代码路径）。
- 剩余风险：`docs/agent`、`docs/adapter`、`docs/ai`、`docs/adr`、`docs/glossary` 按边界未动（沿革/术语，另切片需用户决策）；`apps/docs-site/content` 仍有 58 个文件含 Vetta、部分含 openvetta 上游坐标，是下一片候选（README 第三片已把站内路径当入口，站内文案与 README 口径暂不一致）；占位入口（PVR、Discord 邀请、市场仓库、Serv 后端）待真实基础设施落地后回填。

## 交付记录（第五片，2026-10-15）

- 范围：用户对第四片剩余风险批示「需要改」，处理 `apps/docs-site/content`（用户可见文档站内容）+ 随之变红的站点 SEO 测试断言。
- 实际修改：六处 `openvetta.com/download` 下载页链接改 GitHub Releases（中英 index ×4、installation-and-updates ×2，链接文本与后文「下载页没有列出」同步改）；DEB/RPM 安装命令改按 CI 实况的扩展名 glob 形式（`apt install ./*.deb`，desktop-release workflow :549/:555 同款；原 `vetta_${VERSION}_amd64.deb` 文件名为上游时代命名，现行 deb 元数据包名为 `openforge`——`verify-linux-packages.mjs` 实况，精确产物文件名未经本地构建核实故不臆写）；`abilities.mdx` 中英两处内置市场来源坐标改 `hxquan-q/open-forge-marketplace`（`official-marketplace-source.ts` 的 `OFFICIAL_MARKETPLACE_REPOSITORY` 实况）；`troubleshooting.mdx` 中英 Issues 链接改本仓 + 占位注明（本仓 Issues 暂未启用）；`developers/rpc.mdx` 中英 `vetta-agent-rpc` → `openforge-agent-rpc`（v0.1.2 CLI 更名实况）；`examples/batch-project-audit.mdx` 中英示例产物名 `vetta-project-audit.md` → `forge-project-audit.md`（doc 自造示例名，仓库无代码耦合）；`documentation-policy.md` 中英「Vetta 版本」→「Open Forge 版本」；`meta.json` 中英站点标题/描述改 Open Forge（用户可见站点元数据）；`test/seo.test.ts` 三处断言随站点元数据同步（fixture 页题 + 期望 title/siteName）。
- 声明头：12 个新改 mdx/md 在 frontmatter 闭合后补头（mdx 用 `{/* */}` 形式，与既有 installation-and-updates 一致）；`meta.json` 为 JSON 不携带注释头（gate 的 NON_COMMENTABLE 清单兜底）。
- 对照表落地实况（保留类）：content 内 `install:vetta`、`.vettapkg`、`@vetta-org/*`、`VETTA_*`、`vetta-ui-design`、`border-t-vetta-coral` 主题 token 类等冻结标识原样保留；`docs.openvetta.com` 残留仅在站点代码层（`lib/seo/social-image.tsx` 社交卡渲染文本、`app/layout.tsx` dummy Request base、`.env.example`/README 的 `DOCS_SITE_URL`）——属站点部署配置而非文档内容，未纳入本片。
- 验证：`apps/docs-site/content` grep 复核零 `openvetta`/`open-vetta` 残留；两份 meta.json JSON.parse 通过；docs-site 包内 `bun run test` 34/34 通过（首轮 seo.test.ts 因旧品牌断言转红，属本次元数据改动的预期连锁，已同步修正）；`bun run check:quick` 全绿（ratchet `new=0`）。
- 未运行及原因：未跑 docs-site 构建（`next build`）与根运行时测试——内容/元数据改动被包内 vitest 与 check:quick 覆盖，构建产物验证留给下次站点部署。
- 剩余风险：站点代码层 `docs.openvetta.com` 常量（social-image 渲染文本等）待站点部署定位确定后统一处理；DEB/RPM 精确产物文件名待下次 Linux 构建核实后可将 glob 命令细化为精确文件名；沿革目录（agent/adapter/ai/adr/glossary）仍按边界未动。

## 第六片合同（2026-10-15）：审查反馈补齐与当前产品事实对齐

- 来源：用户确认“需要改”“继续”；本次为 Open-Forge-only 文档维护，复用 REQ-0003 / PLAN-0003，并对照 REQ-0011 的已实现双品牌合同。
- 当前基线：前五片已提交；主工作区最新提交为 6d21c4b9d。此前发现的外链清收已由第五片落地，本片在该已提交基线上补足剩余缺口，不覆盖其它会话修改。
- 执行：单 Agent，在独立工作树实施；execution: parallel 仅为隔离工作树合同，不派生 Worker，与 TASK-0048 仍串行集成。写域为根入口文档、活跃 docs、公开文档内容/说明及站点无逻辑字面量文案；保留沿革目录、协议与项目内 .vetta 兼容标识。
- 目标：README/QUICKSTART/构建与公开安装指南解释仓库品牌 Open Forge、默认 Desktop 品牌小爱ai / Allstr ai、显式 self 档及其与 lite/full 的独立关系；修正版本示例、可执行文件名、全局数据路径与市场来源说明；清理活跃产品自称遗漏；更新 PRODUCT 的当前入口与品牌事实。
- 图片：README 不再用上游营销横幅和旧桌面截图冒充当前产品；保留原始资产作为历史资源，入口采用可维护的本项目 SVG 品牌横幅。
- Given 用户从 README 进入快速开始或配置/插件/主题文档；When 按说明使用当前默认构建、self 构建或定位配置；Then 名称、路径、命令、版本与当前事实源一致，且中英文镜像同步。
- 不变量：不修改生产逻辑、默认品牌、包名/环境变量/IPC/项目目录与生态协议；不启动 Desktop、不使用真实 Provider、不部署、不猜外部基础设施。私有上报渠道等占位保持明确的未就绪说明。
- 验证：相对链接与引用路径检查；公开语言页面集合/既有 docs-site tests；bun run --cwd apps/docs-site check 与 build（覆盖搜索、sitemap、LLM 来源）；变更文案 i18n 的定向 test:impact；根 bun run check。无行为变更不新增镜像实现的单元测试。
- 工程与自审证据落本 Task；提交/集成按真实事实记录，发布未授权。

- 第六片范围细化：公开站点社交卡品牌/alt 与 .env.example 的旧部署示例同时修正；RootLayout 的语言检测 dummy URL 改为 example.test，不发网络请求。均为字面量文案/示例，不改变路由与部署。补充 docs/README.md 文档导航，历史 PRD 与性能采样仅标注历史边界。

- 事实核对补充：UI Debug 实际根为 ~/.openforge-ui-debug/<workspace-id>；市场来源内置项不可停用，旧文档 registeredDefaultRepositories 字段已无代码消费，按当前 version: 1 / sources 与协调策略修正文档。第六片的站点字面量清理覆盖 i18n、social-image 和 layout 三处，无生产行为变更。

- 同域清查补充：市场 manifest、插件宿主要求与更新/发布手册仍含上游 0.5.x 的活跃版本示例；当前示例改按 0.1.x，历史引入版本和真实实测数据保留并明确标注上游语境。macOS 应用名示例明确 self 档前提，不将其当默认分发名。

- 首轮完整 check 的 scope 门禁发现本任务与 TASK-0154/0197/0218/0223 共写 v0.1.3 发布说明；本轮已确认主工作区干净、基线未漂移，在本 Task 补齐 conflicts_with 并明确共享文件串行集成，不改写其他任务或放宽门禁。

## 交付记录（第六片，2026-10-15）

- 实际修改：中英 README/QUICKSTART、build-modes、公开安装/配置/插件指南补齐 Open Forge 仓库品牌与默认小爱ai / Allstr ai、self 档及 lite/full 独立关系；43 份活跃文档全局根改为 ~/.openforge，保留项目内 .vetta；修正 OpenForge.exe、Windows 安装路径、市场默认坐标/分支/不可停用语义与 0.1.x 版本示例。README 使用新 SVG 横幅，不再展示继承的旧截图；新增 docs/README.md，历史 PRD/性能/品牌话术保留历史边界。站点说明、社交卡、aria 和 PRODUCT 与事实源同步，当前 v0.1.3 发布说明已补。
- 实际验证：docs-site test 7 文件 / 34 项通过；test:impact 三处字面量代码关联 5 文件 / 31 项通过；包内 check 通过；生产 build 通过，113 静态页；64 份修改文档的 337 个本地链接/路径引用检查全部有效；git diff --check 通过；声明头 ratchet new=0；根 bun run check 首轮仅本任务漏声明共享发布说明冲突，补齐后第二轮全部通过（lint 4818 文件、root/CLI/Desktop/docs/mobile 类型与全部 guards）。
- 本地生产请求验证：robots、sitemap（52 个文档 URL）、英文 LLM 索引/全文、直接 Markdown 导出与社交 PNG 可响应；社交卡已视觉回读。普通中英文档页与 .md 别名出现 307 自重定向，搜索出现 DOCUMENT_ALREADY_EXISTS（首页 ID / 重复）。两项发现的生产入口在本片未改，分别登记 BUG-0112/0113，交由独立 TASK-0270 修复，不把构建通过称为完整访问通过。
- Worktree：由官方 CLI 创建，bun install --frozen-lockfile 成功；本任务定向 worktree:check 通过。全仓 worktree:check --all 的既有 TASK-0235～0239 严格日期字段、TASK-0266 绝对路径及历史工作树登记问题未在本片修改；它们不影响根 check 的当前合同检查。
- 技术评审：单 Agent 自审；核对实际路径/版本/品牌档/市场源码、中英镜像、声明头、图片与历史事实边界；不是独立评审。没有改动运行时默认值、包名、IPC、项目目录或生产逻辑。
- 未运行：未启动 Desktop/verify:ui、未访问真实 Provider 或用户数据、未执行打包升级/真实发布/部署；本轮仅做文档与站点本地验证。
- 验收：文档修改可审阅，status=verifying；用户尚未人工接受。提交/集成事实在集成后补记。公开页面与搜索的成品验收由 TASK-0270 补齐，远程部署与外部市场可用性不在本次验证中。

- 本地集成：第六片提交 11719d84d 已 fast-forward 合入本地 main；无内容冲突。文档站访问问题续接 TASK-0270，原文档任务保持 verifying 待用户审阅；未推送或部署。

- 成品验证补充（TASK-0270）：初始 307 现象经差分定位为 Next.js 将探针绑定的回环 IP 规范化到 localhost 后重复执行 rewrite，并非已确认的部署故障；统一本地探针主机名即恢复阅读与 Markdown，生产路由无需改动。搜索的跨语言 ID 冲突已独立修复，完整生产 HTTP 6/6、包内 35/35、质量合同 102/102 与完整根 check 通过；文档成品仍待用户人工接受，远程部署未验证。

## 第七片合同（2026-10-15）：按二开项目重写正文叙述

- 用户反馈：允许上游致谢及必要提及，但 README 正文的主观描述仍沿用 Vetta 的产品视角。本片纠正项目定位、交付边界与默认使用流程，不能仅靠替换品牌词完成。
- 已复核基线：根 README 仍以继承的泛化能力营销为主体，独立维护定位只出现在末尾致谢；插件上手直接指向上游 npm 发布包；安装/云服务叙述混淆代码能力、实际 Release 与已运营服务；公开快速开始把登录作为默认前置，与本仓默认 lite 构建冲突。中英首页另有四处 VETTA 装饰标题漏改。
- 目标：README 开头明确本仓是独立维护的 Open Forge 客户端工程，围绕已落地的团队/工程工作流、SSH、模型与恢复改动组织介绍；保留基础能力操作入口，区分当前开发版本、可下载制品、非 Desktop 应用源码和独立私有服务端。插件/SDK 指南以本仓版本合同为准，不将同名上游发布物自动视为 fork 的配套版本。
- 做：重写中英 README 的定位、二开重点、获取/开发/扩展与服务边界；同步 Quickstart、docs 导航、PRODUCT、公开首页/快速开始/使用概览/开发入口/安装与兼容等受影响正文，核对 full 模式说明；上游归属、技术兼容标识和历史资料继续保留真实语境。
- 不做：不改变运行时、包名、命令、环境变量、品牌档默认值、协议或数据；不新增品牌/商业能力/部署承诺，不改 GitHub 仓库设置，不启动 Desktop 或真实 Provider，不合并/推送 origin/main。
- Given 用户从本仓 README 进入默认源码构建与公开指南；When 了解本项目定位、首次运行、选择扩展或判断可用服务；Then 读到的是当前 fork 的维护范围与默认 lite 流程，登录/full/发布物均有实际前提，中英文一致。
- 执行：复用 REQ-0003 / PLAN-0003，单 Agent 在既有 TASK-0047 隔离工作树串行修改，已确认干净并 fast-forward 至 110b10405；与 TASK-0048 及共享发布说明任务串行。直接修改文档即可，不需要重构生产代码。
- 验证：对照版本/品牌/构建开关、插件源码和既有交付记录；检查本地链接/引用、语言页面集合与源码残留；运行 docs-site 既有测试与构建、test:impact/changed 和规定门禁。不为纯文案新增镜像单元测试；实际命令、未执行项和提交/集成事实在交付时回写。
- 集成前复核补充：公开插件日志页仍将全局日志根写为旧 `~/.vetta`。按 `apps/desktop/src/main/logger.ts` 的 `getVettaHomePath()` 和配置路径合同修正中英说明，区分安装、开发和兼容回退根；一并修正英文插件页的冠词笔误。上述补充仍为本片公开文档事实核对，不改运行时。

## 交付记录（第七片，2026-10-15）

- 根因：前片主要检查品牌字符串、入口坐标和路径，保留了上游的通用产品宣传结构与默认账号流程，未充分审核叙述主体、发行/服务主体及 SDK 发布版本归属。用户明确允许致谢与必要提及；本片处理语义与流程前提，不追求 Vetta 字符串归零。
- 实际修改：中英 README 从本仓维护范围和二开工作展开，介绍工程工作流、团队、SSH、模型与恢复；区分继承基础能力、当前开发线和实际 Release，移除 README 中未经目标构建兼容性确认的上游 npm 快捷上手承诺。Quickstart、PRODUCT、docs 导航与构建模式同步，full 明确为需要兼容后端的客户端构建选择。
- 公开指南：中英首页清理四处旧品牌标题并重写项目介绍；首次设置改按默认 lite 无需账号的流程，登录、组织和云目录均限定对应 full 服务前提；安装与兼容矩阵区分打包能力和真实发布资产；开发/插件指南补齐本仓 SDK 与上游 registry 版本边界，故障排查同步 lite 入口。保留原有 README 数据章节锚点、上游署名、技术兼容标识和历史资料。
- 已运行：显式 32 文件的 test:impact 选择 docs-site 全包，7 文件 / 35 项通过；check:quick 全部通过，声明头 ratchet new=0；build:docs 构建成功，113 静态页；30 份修改文档的 304 个本地链接、公开路由、图片与 README 入链锚点检查有效；本 Task 的 worktree:check 通过，git diff --check 无错误。无逻辑变化，按文案政策不新增镜像实现的单元测试。
- 技术与内容复核：单 Agent 自审；以 Desktop 版本/品牌层和 Vite 云开关、插件源码/包清单及既有交付记录核对事实；中英文对照回读。GitHub API 核实最新已发布版本为 v0.1.2 Preview，当前源码为 0.1.3，因此安装格式与版本不再作无条件发布承诺。
- 未运行：Desktop/verify:ui、真实 Provider、浏览器人工操作、真实升级/发布/部署；本片没有修改运行时。远程 CI 先前因 Actions 预算阻断，不能以本地通过代替远程通过或用户人工接受。
- 集成/接受：status=verifying，integration_status=integrated。原 dev→main PR #10 已合并（origin/main@18081000f），本片是之后的新修订；用户尚未接受这版正文，不把旧 PR 的合并状态当作本片已进入默认分支。
- 补充复核：中英插件日志页的全局根由旧 `.vetta` 改为 `.openforge` / `.openforge-dev` 并链接配置路径说明；来源为 Desktop logger 与 action-rpc 数据根解析，保留显式配置和旧根回退前提。两条新增引用的中英目标文件均存在；四个补充路径的 check:quick 通过，补充后 build:docs 再次成功生成 113 页。主工作区首轮集成测试 35/35 与完整 check 通过后，为纳入上述真实遗漏已退出尚未提交的合并；最终组合仍需重新集成验证。
- 最终集成验证：源码提交 `2e11771af` 与补充提交 `1a7582bad` 已无冲突合入本地 main；实际集成点为包含本记录的合并提交（父提交 `75d07b1ac` / `1a7582bad`）。重新执行 `bun run test:changed --base origin/dev`，选择 36 个差异文件中的 docs-site，7 文件 / 35 项全部通过；随后完整 `bun run check` 的 lint、全部类型、mobile lint 与 guards 通过。声明头 ratchet new=0，无新增单元测试或运行时改动。
- 待推批次复核：main 上原有 `75d07b1ac` 为已单独提交、status=done 的 RESEARCH-0026 及其索引，未改写其内容；已核对属于纯调研文档、符合记录路由，组合的 Project/索引/链接与完整门禁通过。本轮不将该研究中的实机测量宣称为本任务复测结果。批次仅为文档与管理记录；后续按已有授权推 dev、建立新的 dev→main PR，稳定分支合并与部署仍由用户决定。

## 第八片合同（2026-10-18）：清理继承文案与重组阅读入口

- 来源：用户要求整理二开项目 README、其他文件内容和结构，不再沿用原项目内容；复用 REQ-0003 / PLAN-0003，不新建重复来源。改动归属 Open-Forge-only。
- 当前事实：根入口仍有继承的 Discord 宣传、社区背书与上游产品定位；品牌话术正文仍为旧产品设计；Mobile、Relay、插件入口仍自称旧品牌。文档导航混有当前操作与历史证据。
- 目标与输出：重写中英 README、快速开始与贡献指南；整理 docs 与应用/插件 README 的职责和入口；以本仓现行实现重写文案规范；同步公开文档中的社区入口及残余品牌称呼。文档按使用、开发、管理和历史证据组织，不移动源码包。
- 并发结论：必须串行，单 Agent 在本地 main 执行；不启动 Worker，不新建 Worktree。当前仅有他人未跟踪的 temp/，不读写或提交。TASK-0048 与本任务共享公开内容，不并发实施；其余历史冲突任务不写入。
- 当前 Branch / Worktree：main / C:/Users/xquan/Desktop/open-forge；输入基线 018358bb27b6f7854e932c972ae722fcc2ca79a6。历史切片的分支和集成事实保留在原交付记录，本片集成状态单独回写。
- 输入与依赖：根 package.json 脚本、Desktop 品牌/构建事实源、目标包 README 和公开文档；所需品牌与兼容决策已经落地，不新增外部基础设施。
- Given 读者从仓库首页了解、运行或参与 Open Forge；When 按中英文导航查找产品指南、工程手册、目录职责和历史记录；Then 入口以本项目为主体、命令与链接可核实，不将原项目社区、品牌愿景或生产部署当成本项目事实。
- 不变量与不做项：保留 LICENSE、NOTICE、必须的版权声明及兼容命令/包名/协议/数据路径；不改 Agent/桌面运行时、默认品牌、构建配置或依赖；不触碰用户数据、真实 Provider、Desktop 实例或部署。用户已明确选择「历史资料独立归档，当前入口只介绍本项目」。
- 取舍：直接整理内容和导航即可，无需生产代码重构；物理移动须先核实入链，不批量替换技术标识或研究坐标。
- 验证：核对中英内容、相对链接/锚点、目录及命令事实；公开内容运行既有 docs-site 测试、构建及生产 HTTP 验证，Project 索引与声明头检查；文案/静态资源不新增镜像单元测试。由于同步清理站点静态导航和图片引用，完成后执行完整 bun run check。本片不默认推送。
- 失败/恢复：无运行时状态转换；链接或构建失败修正文档后复验，保留未完成结果，不弱化检查。最终文档可直接审阅，用户接受尚待反馈。

- 归档范围细化：新增 docs/archive/ 统一索引；旧文案、知识库草案、旧横幅/截图及公开站点历史产品截图移入 upstream/。ADR 与研究链仍被工程资料引用，按原位历史索引保留路径。旧 PRD 原址留迁移入口，保护源码注释引用；同步 PRODUCT 的旧素材路径与最新入口决策。
- 站点连带范围：移除继承的 Discord 导航与首页链接，站点标识使用现有 self 档项目图标；页面图文改为文字说明，保留有用图注内容。仅调整静态链接和资源路径，不改变路由、语言识别、SEO 生成或 Agent 行为。新增写域/独占域为 apps/docs-site/lib/site.ts、apps/docs-site/lib/layout.shared.tsx、apps/docs-site/components/{brand-mark,home,studio-banner}.tsx、apps/docs-site/public/images 与 project/requirements/PRODUCT.md；按本条在 frontmatter 中同步。

## 交付记录（第八片，2026-10-18）

- 实际修改：重写中英 README、QUICKSTART、CONTRIBUTING 和安全说明，正文围绕本项目的功能、运行、目录和贡献展开；移除继承的 Discord 宣传及 LINUX DO 背书。docs/README 统一使用、开发、目录与历史导航，当前文案约定独立重写；Mobile、Relay、插件与 CLI README 修正项目称呼、数据根、版本示例和 SDK 配套前提。
- 历史归档：用户明确选择独立归档。旧文案与知识库草案进入 docs/archive/upstream/；15 份旧横幅、图标和产品截图按原字节移动并核对 SHA-256。旧 PRD 路径保留迁移入口，避免源码注释失效。ADR/研究/性能证据保持原路径，由归档索引集中发现，不伪造或重写历史结论。
- 公开文档：旧截图从 public/ 移出，保留操作文字与有用图注；中英文首页使用项目横幅，站点图标使用 Desktop self 档现有事实源；移除继承社区链接，桌宠指南改按功能描述，不虚构界面标签。PRODUCT 和站点 README 同步内容边界、资产来源及当前入口决策。
- 实际验证：docs-site 包内测试 7 文件 / 35 项通过；5 个静态站点文件的 test:impact 命中 1 文件 / 10 项通过；生产 build 编译成功并生成 113 页；test:production 1 文件 / 6 项 HTTP 流程通过；完整 bun run check 的 lint、全部类型、Mobile lint 与 guards 通过；44 份变更/归档文档共 299 个本地链接、路径及公开路由检查通过；git diff --check 通过；release-notes --check、Project 索引与本 Task worktree:check 通过。
- 检查纠偏：首轮 worktree:check 指出串行 Task 不应把主检出绝对路径登记为独立工作树，已改为 unassigned（主工作区串行）并复验通过；首轮链接检查找到 QUICKSTART 中英两条错误的 troubleshooting 路径，已修正并复验。暂存检查发现归档原文的 Markdown 双空格硬换行被 Git 视为行尾空白，已换成等价的反斜杠换行语法并重新检查。未放宽守卫或测试断言。
- 发布说明：当前 0.1.3 为既有手写正文，按兼容政策在「其他」追加一句；没有新增碎片或改写已发布版本。
- 技术评审：单 Agent 自审，核对当前脚本/包名、品牌事实源、路径、双语和归档引用；没有独立评审。LICENSE、NOTICE、协议、凭据与运行时兼容标识保持原样。
- 集成：本片在 main 串行实施，随包含本交付记录的 docs(project) 原子提交集成本地 main，父提交为 018358bb27b6f7854e932c972ae722fcc2ca79a6；实际提交号由本次 Git 提交记录及对话交付提供。未推送、未创建 PR、未发布或部署。
- 未运行及原因：未启动 Desktop/verify:ui、未调用真实 Provider、未进行真实账号/更新/远程服务测试；这些行为未改动。没有新增单元测试，文案、静态导航和资源由既有站点测试、构建、HTTP 流程与链接检查覆盖。没有采集当前 Desktop 实机截图，公开页以文字说明代替历史画面。
- 验收分层：工程验证通过；integration_status=integrated（本地 main）；用户尚未审阅本版，status=verifying，不视为已经人工接受。发布未授权。
- 验收入口：README.zh-CN.md → QUICKSTART.zh-CN.md → docs/README.md；历史资料通过 docs/archive/README.md 单独查阅。应看到本项目介绍与有效入口，旧素材不在公开页分发；如发现旧宣传正文、失效链接或把历史资料作为当前功能证明，应关联本 Task 修正。
- 工作区：单 Agent 串行，无新增 Worktree；用户既有 temp/ 保留，不读取、不暂存或提交。
