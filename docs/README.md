<!-- Copyright The Open Forge contributors. -->
# Open Forge 文档导航

仓库与文档统一使用 **Open Forge**。默认 Desktop 的 `distribution` 档显示小爱ai / Allstr ai，显式 `VETTA_BRAND_PROFILE=self` 使用 Open Forge；品牌档与 lite/full 云服务模式独立。配置方法见[构建模式](desktop/build-modes.md)。

## 当前使用与开发入口

| 目的 | 入口 |
| --- | --- |
| 安装、运行与贡献 | [中文 README](../README.zh-CN.md) · [快速开始](../QUICKSTART.zh-CN.md) · [贡献指南](../CONTRIBUTING.zh-CN.md) |
| 产品操作与公开扩展合同 | [产品指南](../apps/docs-site/content/docs/product/overview.mdx) · [公开文档源码](../apps/docs-site/content/docs/) · [站点开发说明](../apps/docs-site/README.md) |
| 配置与数据迁移 | [配置路径](../apps/docs-site/content/docs/reference/configuration-paths.mdx) · [构建模式](desktop/build-modes.md) |
| 插件、主题与能力分发 | [插件手册](plugin/README.md) · [主题手册](theme/README.md) · [GitHub 能力市场](open-marketplace.md) |
| 工程验证与仓库结构 | [开发指南](dev/README.md) · [质量门禁](dev/quality-gates.md) · [仓库地图](dev/agent-rules/repository.md) |
| 需求、任务与实施状态 | [Project](../project/README.md) |

默认用户数据根为 `~/.openforge`，普通开发实例为 `~/.openforge-dev`。项目目录 `<cwd>/.vetta/`、`@vetta/*` / `@vetta-org/*`、`VETTA_*`、`.vettapkg`、`desktop:vetta` 等仍是兼容标识，不能按品牌批量替换。少量界面引用遵循当前 i18n 实况，不据此改写协议或按钮名。

## 历史资料与事实边界

- [ADR](adr/) 记录决策原因和当时的约束；当前行为以源码、Schema、测试和可执行脚本为准。
- `agent/`、`ai/`、`adapter/` 包含上游对照、研究及实施沿革；`glossary/` 是被上下文索引引用的术语库。原品牌、仓库坐标、commit 和目录名保留其历史语境。
- [性能记录](desktop/preformance/README.md) 是按日期保存的测量快照；[知识库 PRD](prd-knowledge-base-llm-wiki.md) 是上游历史草案；[品牌话术](user-facing-copy.md) 保留上游内容设计。它们不表示当前功能状态、默认路径或新的品牌承诺。
- `assets/banner.webp` 与 `assets/screenshot.png` 为继承的历史素材。当前 README 使用 [Open Forge 文字横幅](assets/open-forge-banner.svg)；公开指南中的旧截图仅用于说明流程。

文档站只加载 `apps/docs-site/content/docs/`，不会自动发布整个 `docs/`。默认源坐标、示例域名或一次本地构建均不代表外部服务已部署；部署和发布状态须单独核实。
