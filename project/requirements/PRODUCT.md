<!-- Copyright The Open Forge contributors. -->
# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

本仓的主要使用与开发对象：

- **桌面用户**：围绕项目使用 Agent，完成工程任务、团队协作、文件处理与可重复工作流。Windows / macOS / Linux 的实际制品以具体 Release 为准；移动端与网关源码各有平台和成熟度边界。
- **本仓贡献者与扩展开发者**：维护二开功能，或编写 Skill、MCP、插件、主题及 SDK/RPC/CLI 集成。开发合同以本仓目标版本为准，同名上游 npm 包不能自动代表 fork 的配套实现。

## Product Purpose

Open Forge 是独立维护的桌面 AI Agent 工作区，围绕项目提供工程流程编排、智能体团队、SSH 远程环境、模型接入和中断恢复；客户端、Agent 运行时、CLI 与扩展源码共同演进。业务服务端在独立私有仓库维护。

成功意味着：用户在自己选择的环境里完成真实任务，全程看得到计划、工具调用、权限、结果与恢复路径。

## Positioning

- **独立维护的客户端工程**（Apache-2.0）：desktop、CLI、运行时、SDK、插件系统、主题与配套应用源码在本仓维护；源码存在不代表所有应用已作为产品发布。
- **当前二开重点**：allstar-coding 分阶段工程工作流、团队会话、SSH 文件传输、自定义模型与 Responses/Codex 传输方式、会话恢复和桌面稳定性。以对应源码、Task 和测试说明实现与接受状态，不将所有基础能力包装为 fork 独有创新。
- **Local-first 默认流程**：未启用云服务的开发构建运行 lite，无账号、订阅、托管 marketplace 依赖；模型端点与凭据由使用者配置。
- **BYOK**：接入支持的 Provider、OpenAI-compatible 端点或本地推理。
- **分层扩展模型**：Skill → MCP → Plugin → Theme → SDK/RPC/CLI，简单工作流不必升级成完整插件。
- **发行与服务分离**：开发版本、Release 资产、公开文档部署、私有后端及云市场分别确认；不借用上游已运营服务或发布包作为本项目的可用性证明。

## Operating Context

- 桌面工作区（Electron）：项目与会话组织任务历史、文件、上下文、产物与执行细节。
- 用户自行配置模型端点；MCP server、插件、webhook、IM 集成、更新源与可选遥测各自构成数据边界。
- 配套入口：IM 桥接（`apps/im-gateway`，Go）、webhook、通知、quick entry、移动端；按各自构建与平台条件使用，不统一承诺与 Desktop 同等可用。
- 协作与文档：本仓库 `hxquan-q/open-forge`、GitHub Releases、`docs/` 文档导航与 `apps/docs-site` 公开文档源码。协作渠道以本仓实际启用的入口为准，不将其他项目的社区或网站作为本项目服务。
- 服务端（业务 API、控制台、官网、计费/订阅决策）在私有仓库 `openforge-serv`，不在此仓库。

## Capabilities and Constraints

- 能力：检查工作区、运行命令、文件操作、MCP 工具、显式批准的敏感操作；预览/处理代码、PDF、Office、表格、图片、音视频、SVG、生成 UI；批量任务与定时自动化；本地知识库、可安装 skill/scenario。
- 约束：插件是 curated code 而非任意代码沙箱，能力在 `plugin.json` 声明、宿主授权、运行时复查；local-first ≠ 零网络。full 只表示构建包含云客户端模块，需显式配置兼容后端，不代表本仓提供可登录的运营服务；lite 不静默启用它。
- 暂未定的产品事实：移动端相对桌面端的功能边界与优先级（记录为开放问题，不在此处发明）。

## Brand Commitments

- **仓库与文档品牌**：Open Forge；许可证 Apache-2.0。Desktop 默认 `distribution` 档中文显示小爱ai、英文显示 Allstr ai；显式 `VETTA_BRAND_PROFILE=self` 使用 Open Forge。品牌档与 lite/full 云服务模式独立，两档共用兼容身份及 `~/.openforge`（开发默认 `~/.openforge-dev`）。
- **当前入口决策（2026-10-18）**：按用户最新文档整理要求，当前入口只介绍本项目，使用本仓库、Releases 与站内文档；移除继承的社区链接和背书，不创建新外部入口。历史资料从 `docs/archive/README.md` 独立查阅，版权与第三方声明保留在 NOTICE。
- **内部兼容身份**：`@vetta/*`、`VETTA_*` 等包名和协议/环境变量维持现状，按各自合同渐进处理，不做全局字符串替换。Desktop `APP_RUNTIME_NAME` 当前保持 `vetta`，它参与 Electron `safeStorage` 密钥定位；更改会使已有凭据无法解密，必须先设计并验证迁移方案。
- **双语承诺**：English + 简体中文（README 双语、桌面端 i18n 以 zh 为 fallback 基准）。
- **当前入口视觉资产**：`docs/assets/open-forge-banner.svg` 为项目文字横幅；文档站标识取自 Desktop self 档事实源。继承的横幅、图标与截图移入 `docs/archive/upstream/`，不进入公开站点。
- **桌面端既有视觉规范**见 `apps/desktop/DESIGN.md`（暗色默认、token 化颜色、克制动效），init 不改动它。

## Evidence on Hand

- 当前文字横幅：`docs/assets/open-forge-banner.svg`；尚未为当前品牌档采集新的 Desktop 实机截图。
- 公开文档内容由 `apps/docs-site/content/docs` 维护；可本地构建，不据此宣称 fork 已部署公开站点。当前未采集的新截图不以旧截图代替，指南使用文字步骤。
- 双品牌事实源：`apps/desktop/src/shared/desktop-brand*.json`、Vite/打包配置及 REQ-0011。
- `docs/adr/` 架构决策记录（计费/订阅类编号刻意空洞，在 openforge-serv）。
- **不存在的证据**：本仓库没有客户证言、案例研究、定价、benchmark 数据——未来表面工作不得编造；订阅/权益叙述属于 openforge-serv，不在此断言。

## Product Principles

1. 用户控制环境优先：执行发生在用户选择的地方，敏感操作显式批准。
2. 可审查胜过魔法：计划、工具调用、权限与恢复路径保持可见。
3. 扩展成本匹配任务大小：简单需求不强迫成为完整插件。
4. 开源客户端是承诺而非营销：lite 构建对官方后端零依赖。
5. 双语是一等公民：中英文文案、文档与社区并存。

## Accessibility & Inclusion

- 界面文案全量 i18n（zh 为基准与 fallback），桌面端暗色为默认主题。
- 无其它已确立的产品级无障碍要求；新表面如需标准（如 WCAG 等级）应在使用时确认。
