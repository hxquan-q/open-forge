<!-- Modified by The Open Forge contributors. -->
# Open Forge 快速开始

[English](QUICKSTART.md) · [简体中文](QUICKSTART.zh-CN.md)

## 使用安装包

从 [GitHub Releases](https://github.com/hxquan-q/open-forge/releases) 选择适合操作系统和架构的资产。源码版本可能领先于最新可下载版本。

安装后配置模型服务，打开项目目录并新建会话。按[第一个任务](apps/docs-site/content/docs/getting-started/first-task.mdx)完成一次执行，检查过程并核对结果。

## 从源码运行桌面端

准备 **Bun 1.3.14**、**Node.js 20+** 与 Git，然后执行：

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
bun run --cwd apps/desktop dev
```

桌面命令会启动 renderer、主题开发服务器和 Electron，使用期间保留该终端。仓库根目录的 `bun run dev` 只监听核心库。

默认开发流程使用 lite 模式，配置自己的模型端点和凭据即可，无需 Open Forge 账号。Full 模式需要另行配置兼容后端。

默认品牌档显示 **小爱ai / Allstr ai**。需要 Open Forge 显示名时，在 `apps/desktop/.env.development` 中设置 `VETTA_BRAND_PROFILE=self` 后重启；打包使用相应的 `.env.<mode>`。品牌选择不改变 lite/full 或数据目录。详见[构建配置](docs/desktop/build-modes.md)。

## 数据目录

| 实例 | 默认数据根 |
| --- | --- |
| 已安装的桌面端 | `~/.openforge` |
| 普通桌面开发环境 | `~/.openforge-dev` |

覆盖配置与迁移行为见[配置路径](apps/docs-site/content/docs/reference/configuration-paths.mdx)。`dev:home` 会显式使用安装版数据；日常开发使用普通 `dev` 隔离数据。

## 编辑文档站

在仓库根目录执行：

```bash
bun run --cwd apps/docs-site dev
```

站点默认使用 4321 端口。公开内容位于 `apps/docs-site/content/docs/`，英文页位于其 `en/` 子目录。内容结构和检查步骤见[文档站 README](apps/docs-site/README.md)。

## 验证改动

```bash
bun run check:quick
bun run test:pkg ai
bun run test:impact -- <file...>
bun run check
```

按受影响行为选择测试，`ai` 只是包名示例；`bun run test:pkg --list` 可列出支持的包。测试使用仓库 runner，不直接运行 `bun test`。完整 `check` 检查 lint、类型与守卫，不运行测试。

接下来可阅读[贡献指南](CONTRIBUTING.zh-CN.md)、[文档导航](docs/README.md)或[故障排查](apps/docs-site/content/docs/troubleshooting.mdx)。
