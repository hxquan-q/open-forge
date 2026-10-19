<!-- Copyright The Open Forge contributors. -->
# Open Forge 文档导航

当前文档按读者要完成的工作组织：使用说明进入公开文档站，工程合同进入对应手册，需求和实施状态进入 Project。各目录维护自己的正文，本页提供导航。

## 使用 Open Forge

| 目标 | 入口 |
| --- | --- |
| 了解项目与运行方式 | [项目首页](../README.zh-CN.md) · [快速开始](../QUICKSTART.zh-CN.md) |
| 完成第一次任务 | [首次配置](../apps/docs-site/content/docs/getting-started/index.mdx) · [第一个任务](../apps/docs-site/content/docs/getting-started/first-task.mdx) |
| 查找功能和设置 | [使用指南](../apps/docs-site/content/docs/product/overview.mdx) · [模型配置](../apps/docs-site/content/docs/product/models.mdx) |
| 确认数据与权限 | [配置路径](../apps/docs-site/content/docs/reference/configuration-paths.mdx) · [安全与数据](../apps/docs-site/content/docs/reference/security-and-data.mdx) |
| 查看当前改动 | [发布说明](../.github/release-notes/v0.1.3.md) |

## 开发与扩展

| 领域 | 权威入口 |
| --- | --- |
| 本地开发与调试 | [开发指南](dev/README.md) · [质量门禁](dev/quality-gates.md) |
| Desktop 与构建 | [桌面工程](desktop/README.md) · [构建模式](desktop/build-modes.md) |
| Agent 与模型 | [Coding Agent](agent/coding-agent/README.md) · [AI](ai/README.md) · [能力架构](capabilities/README.md) |
| 插件与主题 | [插件手册](plugin/README.md) · [主题手册](theme/README.md) · [能力市场](open-marketplace.md) |
| UI 文案 | [本项目文案约定](user-facing-copy.md) |
| 开发贡献 | [贡献指南](../CONTRIBUTING.zh-CN.md) · [仓库地图与包边界](dev/agent-rules/repository.md) |

Desktop 默认分发名为小爱ai / Allstr ai，显式 self 档显示 Open Forge。品牌与 lite/full 模式独立，以构建模式手册为准。

## 仓库目录

| 位置 | 放什么 | 进一步阅读 |
| --- | --- | --- |
| `apps/` | 可运行的应用与服务 | [Desktop](../apps/desktop/) · [CLI](../apps/cli-host/) · [文档站](../apps/docs-site/README.md) · [Expo](../apps/mobile/README.md) · [Kotlin](../apps/kotlin/) · [IM Gateway](../apps/im-gateway/) · [Relay](../apps/remote-relay/README.md) · [SSH Helper](../apps/ssh-helper/) |
| `packages/` | 可复用库、运行时与扩展生态 | [AI](../packages/ai/README.md) · [Agent](../packages/agent/README.md) · [Coding Agent](../packages/coding-agent/README.md) · [插件](../packages/plugins/README.md) |
| `apps/docs-site/content/docs/` | 当前公开使用说明与扩展指南 | [站点维护](../apps/docs-site/README.md) |
| `docs/` | 工程合同、手册与决策入口 | 本导航及各领域 README |
| `project/` | 本项目需求、计划、任务、缺陷和证据 | [Project](../project/README.md) · [管理规范](../project/CONVENTIONS.md) |
| `scripts/`、`tests/`、`patches/` | 工具脚本、仓库级验证支持、依赖补丁 | [质量门禁](dev/quality-gates.md) |

根 README 介绍项目；QUICKSTART 负责首次运行；CONTRIBUTING 负责贡献流程；AGENTS 负责工程规则。完整字段和操作步骤留在对应手册，避免在这些入口间复制正文。

## 兼容标识

`@vetta/*`、`@vetta-org/*`、`VETTA_*`、`.vetta/`、`.vettapkg` 及部分工具/插件 id 是现行代码使用的技术标识。文档示例按实际命令和 Schema 书写，不能只为改品牌替换。全局数据根和项目内目录的区别见配置路径手册。

## 历史与决策

历史研究、原始设计和旧素材统一从[归档索引](archive/README.md)查阅。部分决策仍服务于现行实现；保留的日期、坐标与测量结果只陈述当时事实。当前行为以源码、Schema、测试和可执行脚本为准。

公开站点只加载 `apps/docs-site/content/docs/`；工程资料、Project 与归档不会随此导航自动发布。
