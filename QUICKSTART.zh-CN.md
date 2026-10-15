<!-- Modified by The Open Forge contributors. -->
# 快速开始

<p align="center"><a href="QUICKSTART.md">English</a> · <b>简体中文</b></p>

本指南用于运行独立维护的 Open Forge 桌面客户端：可以使用已发布构建，或从本仓源码启动。当前开发版本可能领先于最新安装包。

## 直接使用

可用安装包及其平台范围：

**→ [GitHub Releases](https://github.com/hxquan-q/open-forge/releases)**

选择具体 Release 中适合操作系统和架构的资产；源码具备打包能力不代表每次 Release 都提供全部格式。安装后配置 BYOK 模型和任务需要的权限。产品文档在 [`apps/docs-site/content/docs/`](apps/docs-site/content/docs/)。

未配置云服务时，开发环境使用 **lite** 构建，无需 Open Forge 登录或订阅。**full** 构建需要显式配置本仓之外维护的兼容服务端；使用该构建时再按发行方说明完成登录。见[构建模式](docs/desktop/build-modes.md)。

仓库名与文档品牌为 **Open Forge**，默认桌面构建使用 `distribution` 档：中文 **小爱ai**、英文 **Allstr ai**。需要 Open Forge 显示名时，在 `apps/desktop/.env.development` 中设置 `VETTA_BRAND_PROFILE=self` 后重启开发进程；打包时放入相应 `.env.<mode>`。此选择不改变 lite/full，也不切换数据目录。

## 从源码开发

需要 **Bun 1.3+** 和 **Node 20+**。支持 macOS、Windows、Linux。

```bash
git clone https://github.com/hxquan-q/open-forge.git
cd open-forge
bun install
```

### 桌面应用

```bash
cd apps/desktop
bun run dev
```

会同时启动 Vite renderer、主题开发服务器和 Electron。数据目录是 `~/.openforge-dev`，不会动已安装应用的 `~/.openforge`。

| 命令 | 数据根 | 什么时候用 |
|---|---|---|
| `bun run dev` | `~/.openforge-dev` | 默认沙箱 |
| `bun run dev:home` | `~/.openforge` | 希望开发构建读写真实用户数据 |

仓库**根目录**的 `bun run dev` 只监视核心库，不会启动应用。

### 文档站

```bash
bun run --cwd apps/docs-site dev
```

默认 `http://127.0.0.1:4321`。公开文档在 `apps/docs-site/content/docs/`。

### 实际会跑的检查

```bash
bun run check:quick        # 对改动文件跑 Biome + 架构守卫
bun run check              # 开 PR 前：lint + 类型 + 守卫
bun run test:pkg ai        # 单包；`bun run test:pkg --list` 查看包名
```

不要直接跑 `bun test`。Windows 上会用错 runner；请用 `bun scripts/quality/run-vitest.mjs --run <file>` 或 `bun run test:pkg`。

打包、环境变量和 lite/full 开关：[构建模式](docs/desktop/build-modes.md)。贡献地图和 PR 门槛：[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。
