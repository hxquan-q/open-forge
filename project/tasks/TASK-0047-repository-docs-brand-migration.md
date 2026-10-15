---
id: TASK-0047
type: task
status: in_progress
priority: P0
owner: release/docs
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: 共享工作区串行（README 切片在当前工作区实施）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [project/requirements/PRODUCT.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github]
write_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github/ISSUE_TEMPLATE, .github/pull_request_template.md, .github/release-notes]
exclusive_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github, .github/release-notes]
depends_on: [TASK-0044, TASK-0045, TASK-0049]
conflicts_with: [TASK-0048]
integration_status: pending
created: 2026-09-23
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 仓库文档与协作入口品牌迁移

## 目标

完成当前部分更新之外的仓库内公开文档品牌清查，使用户和贡献者看到一致、真实且不破坏命令/路径的 Open Forge 信息。

## 范围

### 并发评估

- 结论：不支持与 TASK-0048 并发；两项共享文档路线、社区链接审查和 Release Notes。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：Desktop/生态名称合同完成；`TASK-0049` 确认社区去向。现有工作树中已修改的 README、QUICKSTART、CONTRIBUTING 和开发指南必须作为输入保留，不覆盖或回退。
- 冲突文件/独占路径：根文档、`docs/**`、`.github` 模板与 Release Notes。
- Branch：`forge/dev`；Worktree：实施前按当前协作状态确认。
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
