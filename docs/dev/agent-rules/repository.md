<!-- Modified by The Open Forge contributors. -->
# 仓库地图与领域入口

本文是[根规则](../../../AGENTS.md)按任务触发加载的全仓规则扩展，约束级别不因拆分而改变；更近一级 AGENTS 可收紧。代码路径、命令与原文中的“根文件”均相对仓库根，不相对本文目录。

## 项目概览

Open Forge 是基于上游 OpenVetta 演进的 AI Agent 产品栈。**本仓库是客户端侧的开源仓库**：TypeScript/Bun monorepo、Electron 桌面应用、Expo/React Native 与 Kotlin 移动端、Next.js 文档站，以及 Go 写的 IM 旁路网关。面向外部贡献者的入口是 [`CONTRIBUTING.md`](../../../CONTRIBUTING.md)，不要把本文件当成对外贡献指南。

服务端（业务 API、管理控制台、官网）在独立的私有仓库 `openforge-serv`，不在此处。涉及计费、配额、订阅、权益的决策文档（ADR-0016/0017/0019/0038/0039/0051/0052/0056）同样只存在于那边——本仓库的 `docs/adr/` 会有对应的编号空洞，这是刻意的，见 `docs/adr/README.md`。

顶层目录按「是否被别的包依赖」划分，新增目录必须遵守：

- `apps/`：可交付的应用，依赖图的叶子节点，不被任何包 import。`desktop`、`cli-host`、`docs-site`、`mobile`（Expo/React Native）、`kotlin`（Kotlin Multiplatform，仅 Android）、`im-gateway`（Go）与 `ssh-helper`（Go，远程项目的远端 helper，见 ADR-0124）。
- `packages/`：可复用模块，只能被 `apps/` 或其它 `packages/` 依赖。

主要分层：

- 应用与宿主：`apps/*`
- 产品组合：`coding-agent`
- 通用运行时：`runtime-*`、`capability-*`、`action-rpc`
- 核心库：`ai`、`agent`
- 扩展生态：`plugins`、`skill-presets`、`theme-*`、`toolkit`

核心依赖方向：

```text
apps/*  (desktop / cli-host / docs-site / mobile / kotlin / im-gateway / ssh-helper)
                      |
                      v
       coding-agent / runtime-* / capability-*
                      |
                      v
                 agent / ai
```

`packages/*` 不得反向依赖 `apps/*`，跨包调用优先使用目标包在 `package.json#exports` 中声明的公开入口，不得从其他包深度导入 `src/**`。
## 指令作用域

常用的包级规则：

| 范围 | 规则 |
| --- | --- |
| AI Provider 与模型协议 | [`packages/ai/AGENTS.md`](../../../packages/ai/AGENTS.md) |
| Agent Loop | [`packages/agent/AGENTS.md`](../../../packages/agent/AGENTS.md) |
| Coding Agent 产品组合 | [`packages/coding-agent/AGENTS.md`](../../../packages/coding-agent/AGENTS.md) |
| Desktop 主进程与 Renderer | [`apps/desktop/AGENTS.md`](../../../apps/desktop/AGENTS.md) |
| Plugin SDK、Preset 与外置插件 | [`packages/plugins/AGENTS.md`](../../../packages/plugins/AGENTS.md) |
| CLI | [`apps/cli-host/AGENTS.md`](../../../apps/cli-host/AGENTS.md) |
| Runtime 与 Toolkit | 目标 `packages/runtime-*/AGENTS.md` 或 [`packages/toolkit/AGENTS.md`](../../../packages/toolkit/AGENTS.md) |

Desktop 主进程部分目录还有更细规则；修改对应目录时必须继续读取：

- [`app-actions`](../../../apps/desktop/src/main/app-actions/AGENTS.md)
- [`app-monitor`](../../../apps/desktop/src/main/app-monitor/AGENTS.md)
- [`ipc`](../../../apps/desktop/src/main/ipc/AGENTS.md)

没有包级 `AGENTS.md` 的目录遵循本文件，并以该包 README、测试和现有代码模式为补充。
## 常见任务入口

项目已有知识图谱时，先按[知识图谱调查](../../../.agents/skills/open-forge-task-intake/references/knowledge-context.md)检查 `.ua`（兼容 `.understand-anything`）的版本、目标子图和 Git 增量，再回读源码。图谱是历史导航，不覆盖本文件的领域边界；普通开发不以重建图谱为前提。

| 任务 | 首先阅读 |
| --- | --- |
| 选择质量门禁与测试范围 | [`docs/dev/quality-gates.md`](../../../docs/dev/quality-gates.md) |
| 设计、编写或审查测试 | [`.agents/skills/open-forge-testing/SKILL.md`](../../../.agents/skills/open-forge-testing/SKILL.md) |
| 统一开发入口 | [`.agents/skills/open-forge-task-intake/SKILL.md`](../../../.agents/skills/open-forge-task-intake/SKILL.md) |
| Task 派工、Worktree、分支集成与 dev 推送 | [`project/collaboration/development-workflow.md`](../../../project/collaboration/development-workflow.md) |
| Project 需求、计划、Task、Issue、Bug 管理 | [`project/README.md`](../../../project/README.md) 与 [`project/CONVENTIONS.md`](../../../project/CONVENTIONS.md) |
| Desktop 启动、调试与 UI 验证（仅在用户明确要求时） | [`docs/dev/README.md`](../../../docs/dev/README.md) |
| 新增 workspace 包 | [`docs/monorepo-new-package.md`](../../../docs/monorepo-new-package.md) |
| Plugin SDK、Preset 或外置插件 | [`packages/plugins/README.md`](../../../packages/plugins/README.md) |
| Coding Agent 架构修改 | [`docs/agent/coding-agent/README.md`](../../../docs/agent/coding-agent/README.md) |
| Capability 与权限模型 | [`docs/capabilities/README.md`](../../../docs/capabilities/README.md) |
