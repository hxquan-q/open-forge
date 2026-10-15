<!-- Modified by The Open Forge contributors. -->
<p align="center">
  <img src="docs/assets/open-forge-banner.svg" alt="Open Forge">
</p>

<h1 align="center">Open Forge</h1>

<p align="center">
  独立维护的桌面 Agent 项目，面向可审查的工程工作流。
</p>

<p align="center">
  <a href="https://github.com/hxquan-q/open-forge/releases"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-GitHub%20Releases-2da44e" alt="从 GitHub Releases 下载"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-Apache--2.0-blue" alt="Apache-2.0 许可"></a>
  <img src="https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="macOS、Windows 与 Linux 构建目标">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Discord-%E5%8A%A0%E5%85%A5%E7%A4%BE%E5%8C%BA-5865F2?logo=discord&logoColor=white" alt="加入 Open Forge Discord"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>简体中文</b>
</p>

---

**Open Forge 是基于 Open Vetta 客户端栈持续二开、独立维护的项目。** 本仓维护桌面端、Agent 运行时、CLI、扩展工具与配套应用源码，当前开发重点是工程工作流、智能体团队、远程项目、模型接入和任务中断后的恢复。

桌面工作区保留项目会话、文件工具、预览、知识库、批量任务和自动化等基础能力，并在本仓持续修改和验证。业务服务端在独立私有仓库中维护。

## 本项目在做什么

| 方向 | 本仓维护的工作 |
| --- | --- |
| **工程工作流** | 预置 [allstar-coding 插件](packages/plugins/presets/allstar-coding/README.md)，将需求、原型、架构、开发、评审与验证组织为分阶段流程，保留工作流状态，并检查工具调用范围。 |
| **团队与会话** | 围绕团队协作、成员消息、会话交互、中断恢复和执行重放持续开发与修复。使用入口见[智能体团队](apps/docs-site/content/docs/product/agent-teams.mdx)。 |
| **远程项目** | 通过 SSH 访问项目与文件，支持本机和远端之间上传、下载，并处理进度、取消与同名冲突。见[应用环境](apps/docs-site/content/docs/product/application-environment.mdx)。 |
| **模型接入** | 维护 BYOK 服务商、自定义端点、Responses/Codex 传输方式选择，以及流式响应、重试和异常中断处理。见[模型配置](apps/docs-site/content/docs/product/models.mdx)。 |
| **日常桌面使用** | 文件预览、字体、会话整理与原生集成随运行时一起维护，具体操作入口见[使用指南](apps/docs-site/content/docs/product/overview.mdx)。 |

这些是当前开发线的维护重点，实现与验收状态记录在 [Project](project/README.md)。[0.1.3 发布说明](.github/release-notes/v0.1.3.md)描述当前开发版本；可下载构建及其平台范围以 [GitHub Releases](https://github.com/hxquan-q/open-forge/releases) 的实际资产为准。

## 名称与构建

仓库与文档使用 **Open Forge**。Desktop 默认 `distribution` 档中文显示 **小爱ai**、英文显示 **Allstr ai**；显式设置 `VETTA_BRAND_PROFILE=self` 使用 Open Forge 显示名。两档共用数据与安装兼容身份。

品牌档与 **lite/full** 云服务模式独立。未启用云服务时，开发环境默认运行 lite。具体配置见[构建模式](docs/desktop/build-modes.md)。

## 获取与运行

需要安装包时，从[本仓 Releases](https://github.com/hxquan-q/open-forge/releases) 选择具体版本的资产。仓库包含 Windows、macOS 和 Linux 打包链；实际可下载的平台、架构和构建模式以该次 Release 为准。源码中的开发版本可能领先于已发布安装包。

从源码运行桌面端需要 **Bun 1.3+** 和 **Node.js 20+**：

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
cd apps/desktop
bun run dev
```

默认 lite 开发流程使用你自行配置的模型端点和凭据，无需 Open Forge 账号或订阅。开发数据写入 `~/.openforge-dev`，已安装构建通常使用 `~/.openforge`。根目录的 `bun run dev` 只监听核心库变化。完整准备与验证步骤见[快速开始](QUICKSTART.zh-CN.md)。

使用时先从[项目与第一个任务](apps/docs-site/content/docs/getting-started/first-task.mdx)开始，再按需要接入团队、SSH 环境、知识库、批量任务或自动化。操作指南会说明功能前提和预览边界；其中截图用于说明流程，外观和显示名可能与所选构建不同。

## 开发与扩展 Open Forge

面向 Open Forge 开发时，以目标版本在本仓的源码、导出类型和文档为准。

| 入口 | 用途 | 指南 |
| --- | --- | --- |
| **Skill（技能）** | 可复用的方法或任务流程 | [能力](apps/docs-site/content/docs/product/abilities.mdx) |
| **MCP** | 通过 STDIO 或 HTTP 连接外部工具与数据 | [MCP 连接器](apps/docs-site/content/docs/product/mcp.mdx) |
| **Plugin（插件）** | 扩展桌面 UI、文件、消息、工具与宿主动作 | [插件开发](apps/docs-site/content/docs/plugins/overview.mdx) |
| **Theme（主题）** | 桌面外观与主题页面 | [主题开发](docs/theme/README.md) |
| **SDK / RPC / CLI** | 从其他宿主嵌入或驱动 Agent | [开发者入口](apps/docs-site/content/docs/developers/overview.mdx) |

`@vetta/*`、`@vetta-org/*` 包名、`vetta-plugin-cli` 命令、`VETTA_*` 配置及 `.vetta/`、`.vettapkg` 格式仍是兼容标识。SDK 和工具应与本仓检出版本配套，或使用已针对目标构建验证的版本；npm 上的同名发布包本身不能证明包含本项目的二开改动。

插件在 `plugin.json` 中声明权限，特权操作由宿主授权并在运行时检查。插件作为受策展代码在桌面渲染进程中执行，加载或分发前请阅读[信任与权限模型](apps/docs-site/content/docs/plugins/manifest-and-permissions.mdx)。

## 数据与构建模式

默认 lite 构建提供本地会话、BYOK 和受支持的本地扩展，无需账号、订阅或托管市场。模型服务、MCP、插件、IM 桥接等集成仍各有网络与数据边界。

可选 full 构建包含账号等云功能的客户端接入，需要显式配置兼容的服务端与更新服务。业务后端、网站、计费和运营不在本仓中，其可用性应按实际分发环境确认。

- [安全与数据边界](apps/docs-site/content/docs/reference/security-and-data.mdx)
- [配置路径](apps/docs-site/content/docs/reference/configuration-paths.mdx)
- [构建模式与环境变量](docs/desktop/build-modes.md)
- [安全策略](SECURITY.md)

## 仓库地图

这是 Bun/TypeScript monorepo，另含 Go、Kotlin 与 Cloudflare Worker 应用。上述使用流程以 Desktop 为主；配套应用源码各有平台、构建与发布条件。

| 范围 | 职责 |
| --- | --- |
| [`apps/desktop`](apps/desktop) | Electron 桌面宿主与渲染层 |
| [`apps/cli-host`](apps/cli-host) | Coding Agent 的 CLI 宿主 |
| [`apps/docs-site`](apps/docs-site) | 公开文档源码与 Next.js 文档站 |
| [`apps/mobile`](apps/mobile) · [`apps/kotlin`](apps/kotlin) | Expo 与 Kotlin 移动端 |
| [`apps/im-gateway`](apps/im-gateway) | Go IM 旁路网关 |
| [`apps/remote-relay`](apps/remote-relay) · [`apps/ssh-helper`](apps/ssh-helper) | 远控中继与 SSH helper |
| [`packages/ai`](packages/ai) · [`packages/agent`](packages/agent) | 模型服务接入与 Agent Loop |
| [`packages/coding-agent`](packages/coding-agent) · `packages/runtime-*` | 产品组合、运行时、工具、存储与宿主适配 |
| [`packages/plugins`](packages/plugins) · [`packages/themes`](packages/themes) | 扩展 SDK、预置插件与主题 |

应用依赖可复用包，`packages/*` 不反向依赖 `apps/*`；跨包集成只走公开 exports。详见[架构文档](apps/docs-site/content/docs/developers/architecture.mdx)。

## 开发与文档

```bash
bun run check:quick              # 变更文件的 lint 与架构守卫
bun run check                    # 完整 lint、类型与架构守卫
bun run test:pkg <package-name>  # 定向包测试
bun run test:changed             # 当前 diff 影响的测试
```

使用 Bun 与仓库脚本，日常开发 PR 发往 **`dev`**。贡献要求见[贡献指南](CONTRIBUTING.zh-CN.md)与 [AGENTS.md](AGENTS.md)。

- [文档导航与历史资料边界](docs/README.md)
- [首次配置](apps/docs-site/content/docs/getting-started/index.mdx) · [使用指南](apps/docs-site/content/docs/product/overview.mdx)
- [插件 SDK 内部文档](docs/plugin/README.md) · [架构决策](docs/adr/)
- [文档站开发说明](apps/docs-site/README.md)

公开文档站可以从本仓构建。源码和本地构建成功均不能作为已经部署公开站点的证明。

## 社区

沿用已确认的 [Discord](https://discord.gg/qGqkk22Vg9) 社区入口。安全漏洞上报见 [SECURITY.md](SECURITY.md)。

## 鸣谢与许可

Open Forge 基于 Open Vetta 及更广泛的开源生态继续开发，包括 pi、Codex CLI、MCP、Electron、React、Bun、models.dev 和 [NOTICE](NOTICE) 中列出的项目；原始署名与第三方声明保留在该文件中。

基于 [Apache-2.0](LICENSE) 许可发布。

- **友情链接：** [LINUX DO](https://linux.do/) - 中文技术爱好者社区。本项目与 LINUX DO 互链并获其推荐。
