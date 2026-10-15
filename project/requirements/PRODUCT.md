<!-- Copyright The Open Forge contributors. -->
# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

双层受众，同等重要：

- **终端用户**：在桌面工作区里完成真实工作的人——编码、文档、数据、研究、创意与可重复工作流。桌面端覆盖 macOS / Windows / Linux；移动端（Expo/React Native、Kotlin Android）与 IM 网关支撑离开工位后的继续使用。
- **扩展开发者**：为产品编写 Skill、MCP 服务、插件、主题，或通过 SDK / RPC / CLI 嵌入与驱动 Agent 的人。插件脚手架（`@vetta-org/plugin-cli`）不要求持有本仓库源码，任何 coding agent 均可开发。

## Product Purpose

Open Forge 是一个开源桌面 AI Agent，"for real work — local-first, extensible, and under your control"。它把模型、项目文件、本地工具与可复用能力放进同一个桌面工作区：能检查工作区、在可见权限边界内使用工具、产出真实文件，并保留可审查的执行轨迹。它不只是聊天界面。

成功意味着：用户在自己选择的环境里完成真实任务，全程看得到计划、工具调用、权限、结果与恢复路径。

## Positioning

- **整个客户端栈开源**（Apache-2.0）：desktop、CLI、SDK、插件系统、主题、移动客户端、IM 网关都在本仓库。
- **Local-first**：项目、会话、文件与执行发生在用户选定的环境；源码构建产出 lite 版，无账号、订阅、托管 marketplace 依赖，凭证留在本地凭证存储。
- **BYOK**：接入支持的 Provider、OpenAI-compatible 端点或本地推理。
- **分层扩展模型**：Skill → MCP → Plugin → Theme → SDK/RPC/CLI，简单工作流不必升级成完整插件。
- 邻近产品无法诚实复制的点：开源的完整客户端栈 + lite 构建对官方后端零依赖 + 可见权限边界下的真实工具执行。

## Operating Context

- 桌面工作区（Electron）：项目与会话组织任务历史、文件、上下文、产物与执行细节。
- 用户自行配置模型端点；MCP server、插件、webhook、IM 集成、更新源与可选遥测各自构成数据边界。
- 离开工位：IM 桥接（`apps/im-gateway`，Go）、webhook、通知、quick entry、移动端。
- 社区与文档：本仓库 `hxquan-q/open-forge`、GitHub Releases、`docs/` 文档导航与 `apps/docs-site` 公开文档源码；Discord 沿用已确认的社区入口。新官网、文档部署与 Discussions 不当作已建成入口。
- 服务端（业务 API、控制台、官网、计费/订阅决策）在私有仓库 `openforge-serv`，不在此仓库。

## Capabilities and Constraints

- 能力：检查工作区、运行命令、文件操作、MCP 工具、显式批准的敏感操作；预览/处理代码、PDF、Office、表格、图片、音视频、SVG、生成 UI；批量任务与定时自动化；本地知识库、可安装 skill/scenario。
- 约束：插件是 curated code 而非任意代码沙箱，能力在 `plugin.json` 声明、宿主授权、运行时复查；local-first ≠ 零网络；lite 构建不静默启用 Open Forge Serv 集成（构建期选择）。
- 暂未定的产品事实：移动端相对桌面端的功能边界与优先级（记录为开放问题，不在此处发明）。

## Brand Commitments

- **仓库与文档品牌**：Open Forge；许可证 Apache-2.0。Desktop 默认 `distribution` 档中文显示小爱ai、英文显示 Allstr ai；显式 `VETTA_BRAND_PROFILE=self` 使用 Open Forge。品牌档与 lite/full 云服务模式独立，两档共用兼容身份及 `~/.openforge`（开发默认 `~/.openforge-dev`）。
- **当前入口决策（2026-10-15）**：尽量脱离上游，使用本仓库、Releases 与站内文档，不以 openvetta.com、docs.openvetta.com 或上游仓库作为本项目的使用入口；无 fork 等价物的服务明确标注待建。Discord 邀请 `qGqkk22Vg9` 沿用已冻结入口，不创建新社区。上游署名与历史研究继续保留。
- **内部兼容身份**：`@vetta/*`、`VETTA_*` 等包名和协议/环境变量维持现状，按各自合同渐进处理，不做全局字符串替换。Desktop `APP_RUNTIME_NAME` 当前保持 `vetta`，它参与 Electron `safeStorage` 密钥定位；更改会使已有凭据无法解密，必须先设计并验证迁移方案。
- **双语承诺**：English + 简体中文（README 双语、桌面端 i18n 以 zh 为 fallback 基准）。
- **社区背书**：LINUX DO 链接与认可（README "Friends & Links"）。
- **当前入口视觉资产**：`docs/assets/open-forge-banner.svg` 为可维护的项目文字横幅；`docs/assets/banner.webp` 与 `docs/assets/screenshot.png` 是继承的历史资产，不能作为当前 fork 的营销图或实机证据。
- **桌面端既有视觉规范**见 `apps/desktop/DESIGN.md`（暗色默认、token 化颜色、克制动效），init 不改动它。

## Evidence on Hand

- 当前文字横幅：`docs/assets/open-forge-banner.svg`；尚未为当前品牌档采集新的 Desktop 实机截图。
- 公开文档内容由 `apps/docs-site/content/docs` 维护；可本地构建，不据此宣称 fork 已部署公开站点。已有截图用于流程说明，视觉与显示名以实际品牌档及构建为准。
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
