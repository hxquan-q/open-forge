<!-- Modified by The Open Forge contributors. -->
<p align="center"><img src="docs/assets/open-forge-banner.svg" alt="Open Forge"></p>

# Open Forge

[English](README.md) · [简体中文](README.zh-CN.md)

Open Forge 是面向本地与远程项目的桌面 AI Agent 工作区，将项目会话、模型接入、文件工具、智能体团队和工程工作流放在同一个应用中。

本仓维护客户端应用、Agent 运行时、CLI 和扩展工具。业务服务端独立维护。

## 可以用来做什么

| 方向 | 使用入口 |
| --- | --- |
| 项目与会话 | 保留任务上下文，查看工具执行过程。[第一个任务](apps/docs-site/content/docs/getting-started/first-task.mdx) |
| 工程工作流 | 使用预置 [allstar-coding 插件](packages/plugins/presets/allstar-coding/README.md)，组织需求、架构、开发、评审和验证。 |
| 智能体团队 | 协调成员，跟踪各成员的会话与进度。[团队指南](apps/docs-site/content/docs/product/agent-teams.mdx) |
| 远程项目 | 连接 SSH 环境，在本地与远端目录间传输文件。[应用环境](apps/docs-site/content/docs/product/application-environment.mdx) |
| 模型与扩展 | 配置模型服务，按需添加技能、MCP 连接器、插件或主题。[模型配置](apps/docs-site/content/docs/product/models.mdx) · [能力](apps/docs-site/content/docs/product/abilities.mdx) |

知识库、批量任务、自动化和文件预览等能力及其使用条件见[使用指南](apps/docs-site/content/docs/product/overview.mdx)。开发与验收状态记录在 [Project](project/README.md)。

## 安装或从源码运行

安装包从 [Open Forge Releases](https://github.com/hxquan-q/open-forge/releases) 下载。可用平台和架构以各版本实际提供的资产为准。

本地开发需要 **Bun 1.3.14** 与 **Node.js 20+**，准备后执行：

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
bun run --cwd apps/desktop dev
```

启动后配置模型服务，打开项目并新建会话。默认 lite 开发流程无需账号或订阅，模型服务使用你自己的配置。完整步骤见[快速开始](QUICKSTART.zh-CN.md)。

仓库名称为 **Open Forge**。默认桌面分发档中文显示 **小爱ai**、英文显示 **Allstr ai**；显式设置 `VETTA_BRAND_PROFILE=self` 可使用 Open Forge 显示名。具体设置见[构建模式](docs/desktop/build-modes.md)。

## 仓库结构

```text
apps/       桌面端、CLI、文档站、移动端和传输服务
packages/   Agent、模型接入、运行时、能力、插件与主题
docs/       工程手册与文档导航
project/    需求、计划、任务、缺陷、调研和验证记录
scripts/    开发、质量检查、打包与发布工具
tests/      仓库级夹具与验证支持
patches/    纳入版本管理的依赖补丁
```

应用通过公开 exports 使用可复用包。[文档导航](docs/README.md)说明内容归属，并提供应用与包的详细入口。

## 参与开发

以下命令在仓库根目录运行：

```bash
bun run check:quick              # 变更文件的 lint 与架构守卫
bun run test:pkg ai              # 定向包测试
bun run test:impact -- <file...> # 指定文件影响的测试
bun run check                    # 完整 lint、类型与架构守卫
```

根目录的 `bun run dev` 监听核心库变化。启动桌面端使用上方源码运行命令。贡献要求和 PR 的 `dev` 目标分支见[贡献指南](CONTRIBUTING.zh-CN.md)。

## 数据与构建模式

安装版通常使用 `~/.openforge`，普通开发环境使用 `~/.openforge-dev`。Lite 提供本地会话、BYOK 和受支持的本地扩展；可选 full 构建需要分发方配置兼容后端。品牌选择与 lite/full 是独立设置。

模型服务、MCP 连接器、插件及其他集成可能访问外部服务。使用前可查阅[安全与数据边界](apps/docs-site/content/docs/reference/security-and-data.mdx)、[配置路径](apps/docs-site/content/docs/reference/configuration-paths.mdx)和[安全策略](SECURITY.md)。

## 文档入口

- [快速开始](QUICKSTART.zh-CN.md) · [使用指南](apps/docs-site/content/docs/product/overview.mdx)
- [开发者指南](apps/docs-site/content/docs/developers/overview.mdx) · [插件手册](docs/plugin/README.md) · [主题开发](docs/theme/README.md)
- [文档导航](docs/README.md) · [贡献指南](CONTRIBUTING.zh-CN.md)
- [当前版本发布说明](.github/release-notes/v0.1.3.md)

## 许可

采用 [Apache-2.0](LICENSE) 许可。版权、来源署名与第三方声明保留在 [NOTICE](NOTICE)。
