<!-- Modified by The Open Forge contributors. -->
<p align="center">
  <img src="docs/assets/banner.webp" alt="Open Forge">
</p>

<h1 align="center">Open Forge</h1>

<p align="center">
  面向真实工作的开源桌面 AI Agent——本地优先、可扩展，由你掌控。
</p>

<p align="center">
  <a href="https://github.com/hxquan-q/open-forge/releases"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-GitHub%20Releases-2da44e" alt="从 GitHub Releases 下载"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-Apache--2.0-blue" alt="Apache-2.0 许可"></a>
  <img src="https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="macOS、Windows 与 Linux">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Discord-%E5%8A%A0%E5%85%A5%E7%A4%BE%E5%8C%BA-5865F2?logo=discord&logoColor=white" alt="加入 Open Forge Discord"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>简体中文</b>
</p>

---

Open Forge 把模型、项目文件、本机工具和可复用能力放进同一个桌面工作区。它适用于编码、文档、数据、研究、创意生产和可重复工作流，同时让工作继续发生在你选择的环境中。

它不只是聊天界面：Open Forge 能理解工作区、在可见的权限边界内调用工具、交付真实文件，并保留可供检查的执行过程。

<p align="center">
  <img src="docs/assets/screenshot.png" alt="Open Forge 桌面工作区">
</p>

## 为什么选择 Open Forge

| | 对你意味着什么 |
|---|---|
| **本地优先的工作区** | 项目、会话、文件与执行过程留在你选择的环境中。 |
| **自带模型** | 通过 BYOK 连接受支持的 Provider、OpenAI 兼容端点或本地推理服务。 |
| **真实工具与产物** | 在同一条任务流中处理代码、文档、表格、媒体、命令和生成文件。 |
| **过程可检查** | 工具调用、计划、权限、进度、结果和恢复路径都有记录。 |
| **方法可复用** | 使用技能、MCP、插件、主题、知识库、批量任务和自动化持续积累能力。 |
| **开放的客户端栈** | 桌面端、CLI、SDK、插件系统、主题、移动端与 IM 网关都在本仓库开发。 |

## 获取 Open Forge

带标签的版本会在 [GitHub Releases](https://github.com/hxquan-q/open-forge/releases) 发布 macOS、Windows 与 Linux 的预构建包。

### 从源码运行

需要 **Bun 1.3+** 与 **Node.js 20+**。

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
cd apps/desktop
bun run dev
```

源码检出默认产出 **lite** 构建：无需账号、无订阅、不依赖托管服务。模型请求发往你配置的端点，凭据保存在本地凭据存储中。构建模式与环境变量见 [`docs/desktop/build-modes.en.md`](docs/desktop/build-modes.en.md)。

开发实例使用 `~/.openforge-dev`，不影响已安装应用的 `~/.openforge` 数据。仓库根目录的 `bun run dev` 只监听核心库变化，不会启动 Electron。完整安装与验证命令见 [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md)。

## 你可以做什么

- **在项目与会话中工作。** 任务历史、文件、上下文、产物与执行细节放在一起。
- **使用本机与外部工具。** 执行命令、检查文件、连接 MCP 服务，敏感操作一律显式批准。
- **处理专业产物。** 预览并处理源码、PDF、Office 文件、表格、图片、音频、视频、SVG 与生成的 UI。
- **放大已验证的任务。** 用批量任务把同一工作流跑遍多个目录，或调度为自动化。
- **复用组织知识。** 建立本地知识库，安装可复用的技能与场景。
- **离开工位继续工作。** 使用受支持的 IM 桥接、Webhook、通知、快捷入口与原生桌面集成。

[产品指南](apps/docs-site/content/docs/product/overview.mdx)提供全部能力领域的最新任务指南与截图。

## 扩展模型

Open Forge 提供多个扩展层级，简单的工作流不必升级成完整插件：

| 扩展 | 适用场景 | 指南 |
|---|---|---|
| **Skill（技能）** | 教会 Agent 一个可复用的方法或领域工作流。 | [能力](apps/docs-site/content/docs/product/abilities.mdx) |
| **MCP** | 通过标准协议连接外部工具与数据。 | [MCP 连接器](apps/docs-site/content/docs/product/mcp.mdx) |
| **Plugin（插件）** | 扩展桌面 UI、文件、消息、工具与宿主动作。 | [插件开发](apps/docs-site/content/docs/plugins/overview.mdx) |
| **Theme（主题）** | 替换视觉系统并提供主题专属页面。 | [主题开发](docs/theme/README.md) |
| **SDK / RPC / CLI** | 从另一个应用或进程嵌入或驱动 Agent。 | [开发者入口](apps/docs-site/content/docs/developers/overview.mdx) |

### 在任意目录开发插件

开发插件不需要本仓库，也不需要 Open Forge 源码检出，Agent 同样不需要：

```bash
npx @vetta-org/plugin-cli init --id my-plugin --name "My Plugin"
cd my-plugin && npm install
npx vetta-plugin-cli docs        # 手册在哪里，以及它对应哪个 SDK 版本
npm run install:vetta            # 构建、打包并安装进正在运行的桌面应用
npx vetta-plugin-cli watch       # 热重载：宿主从这个目录加载插件
```

`init` 还会写出一个 `AGENTS.md`，因此**任何**编码 Agent——Claude Code、Cursor 或 Open Forge 自身——都能在无宿主侧配置的情况下接手项目。插件手册随 `@vetta-org/plugin-sdk` 一起分发，Agent 读到的合同就是项目编译所依据的合同；`docs` 负责定位手册，而不是让任何人硬编码 `node_modules` 路径。

要从一个仓库发布多个能力，可以脚手架一个 marketplace：

```bash
npx @vetta-org/plugin-cli init hub --name my-market \
  --repository https://github.com/me/my-market --min-app-version 0.55.0
```

它会在仓库里放好索引、`abilities/` 目录布局、仓库级 `AGENTS.md`，以及运行 `vetta-plugin-cli sync --check` 的 CI，让 `.vetta/marketplace.json` 与每个 ability 包保持一致。开发命令始终作用于最近的 ability 目录，因此在 marketplace 内工作与开发独立插件完全相同。

插件在 `plugin.json` 中声明能力；特权操作由宿主授权并在运行时再次校验。插件运行在桌面渲染进程内，应被视为策展代码而不是任意代码沙箱。分发前请阅读[插件信任与权限模型](apps/docs-site/content/docs/plugins/manifest-and-permissions.mdx)。

## 数据与构建模式

源码检出默认产出 **lite** 构建。它不依赖 Open Forge 运营的后端：不需要账号、订阅、远程管理或托管 marketplace。已发布的安装包可能启用可选的 Open Forge Serv 集成（账号、订阅与托管 marketplace）；该集成在构建期选择，绝不会在 lite 构建中静默启用。

本地优先不等于零网络流量。模型 Provider、MCP 服务、插件、Webhook、IM 集成、更新源与可选遥测各自构成自己的数据边界。请阅读：

- [安全与数据边界](apps/docs-site/content/docs/reference/security-and-data.mdx)
- [配置路径](apps/docs-site/content/docs/reference/configuration-paths.mdx)
- [构建模式与环境变量](docs/desktop/build-modes.en.md)
- [安全政策](SECURITY.md)

## 仓库地图

这是 Bun/TypeScript monorepo，另含 Kotlin、Go 与 Cloudflare Worker 应用。依赖从应用指向可复用包；`packages/*` 永不依赖 `apps/*`。

| 区域 | 职责 |
|---|---|
| [`apps/desktop`](apps/desktop) | Electron 桌面宿主与渲染层 |
| [`apps/cli-host`](apps/cli-host) | 编码 Agent 的 CLI 宿主 |
| [`apps/docs-site`](apps/docs-site) | Next.js 文档站 |
| [`apps/mobile`](apps/mobile) | Expo/React Native 移动客户端 |
| [`apps/kotlin`](apps/kotlin) | Kotlin Multiplatform Android 客户端 |
| [`apps/im-gateway`](apps/im-gateway) | Go IM sidecar 网关 |
| [`apps/remote-relay`](apps/remote-relay) | 移动端与桌面端远程控制协议的 Cloudflare Worker 中继 |
| [`apps/ssh-helper`](apps/ssh-helper) | 远程项目经 SSH 上传的静态 helper 二进制 |
| [`packages/ai`](packages/ai) · [`packages/agent`](packages/agent) | Provider 抽象与 Agent 循环 |
| [`packages/coding-agent`](packages/coding-agent) · `packages/runtime-*` | 产品组合、运行时合同、工具、存储、MCP 与宿主适配器 |
| [`packages/plugins`](packages/plugins) · [`packages/themes`](packages/themes) | 扩展 SDK、预设与主题 |

架构细节与公开集成合同见[开发者文档](apps/docs-site/content/docs/developers/architecture.mdx)与 [`docs/adr/`](docs/adr/)。

## 开发与贡献

使用 Bun 与仓库脚本；不要在本 monorepo 里跑裸 `bun test`。

```bash
bun run check:quick              # 变更文件的 lint 与架构守卫
bun run check                    # 完整 lint、类型与架构守卫
bun run test:pkg <package-name>  # 定向包测试
bun run test:changed             # 当前 diff 影响的测试
```

Pull request 打到 **`dev`** 分支。贡献地图、测试期望与评审标准见 [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)。架构与 Agent 协作规则见 [`AGENTS.md`](AGENTS.md)。

漏洞请私下报告——报告渠道、范围与所需材料见 [`SECURITY.md`](SECURITY.md)。

## 文档

- [产品指南与能力参考](apps/docs-site/content/docs/product/overview.mdx)
- [第一个任务教程](apps/docs-site/content/docs/getting-started/first-task.mdx)
- [插件开发](apps/docs-site/content/docs/plugins/overview.mdx) · [`docs/plugin/` 内的插件 SDK 内部文档](docs/plugin/README.md)
- [主题开发](docs/theme/README.md)
- [SDK、RPC、CLI 与架构](apps/docs-site/content/docs/developers/overview.mdx)
- 仓库安装见 [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md) · 贡献见 [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)
- 架构决策见 [`docs/adr/`](docs/adr/)

文档站源码在 [`apps/docs-site`](apps/docs-site)，本地用 `bun run --cwd apps/docs-site dev` 启动。

## 社区

加入 Open Forge Discord 提问、分享工作流、技能、插件与主题，跟进发布动态，与维护者交流。

<p align="center">
  <a href="https://discord.gg/qGqkk22Vg9"><img src="https://img.shields.io/badge/Open%20Forge-Discord-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Open Forge Discord"></a>
</p>

**https://discord.gg/qGqkk22Vg9**

## 鸣谢与许可

Open Forge 是 Open Vetta 的独立维护衍生版。它建立在更广泛的开源生态之上，包括 pi、Codex CLI、MCP、Electron、React、Bun、models.dev 以及 [`NOTICE`](NOTICE) 中列出的项目；完整的第三方清单与原始声明见该文件。

基于 [Apache-2.0](LICENSE) 许可发布。

- **友情链接：** [LINUX DO](https://linux.do/) - 中文技术爱好者社区。本项目与 LINUX DO 互链并获其推荐。
