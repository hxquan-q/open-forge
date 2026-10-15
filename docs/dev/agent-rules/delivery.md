<!-- Modified by The Open Forge contributors. -->
# 发布说明与交付规则

本文是[根规则](../../../AGENTS.md)按任务触发加载的全仓规则扩展，约束级别不因拆分而改变；更近一级 AGENTS 可收紧。代码路径、命令与原文中的“根文件”均相对仓库根，不相对本文目录。

## 发布说明与新增包

发布说明写在 `.github/release-notes/v<版本号>.md`，一个版本一个文件，版本号以 `apps/desktop/package.json` 的 `version` 为准。**该文件就是 GitHub Release 的正文**，用户在 Release 页面读到的就是这里写的内容，写法见 [`.github/release-notes/README.md`](../../../.github/release-notes/README.md)。

**当前版本基线**：Open Forge Desktop 已于 commit `ff5989c6d` 切换至独立版本 **0.1.0**，不再继承上游 0.5.x 版本号。所有后续版本号必须基于 0.1.0 递增（0.1.1, 0.1.2... 或 0.2.0 等），Release Notes 统一写入 `.github/release-notes/v<版本>.md`。**是否执行发布（publish）由用户明确授权**，Agent 不得主动执行 tag 推送或触发构建流水线。

### 必须写入发布说明

以下任一情况完成后，都要把对应条目写成**当前开发中版本**的一份碎片：`.github/release-notes/fragments/v<版本>/<任务或主题>.md`，小节只用 `## 新增`、`## 改进`、`## 修复`、`## 其他`，每份至少一条。这是任务的一部分，不是可选的后续工作：

- 新增功能或能力
- 修复缺陷
- 调整或修正既有行为，包括性能、交互和文案的可感知变化
- 合并 PR
- 关闭 issue

补写发布说明与代码改动放在同一次任务里完成：流水线由 tag 触发，tag 一推就开始构建，那时再补已经进不了这次发布。

碎片由 `node scripts/release/release-notes.mjs --assemble` 汇编成 `v<版本>.md`，后者仍是 GitHub Release 正文；`bun run check` 会校验碎片格式与「碎片和正文一致」。不要直接改 `v<版本>.md`，那会让守卫报出不一致。迁移前的手写版本（例如 0.1.3）维持原样，不强制迁移。

### 怎么写

- 分 `## 新增` / `## 改进` / `## 修复` / `## 其他` 四节，没有内容的小节省略。
- 面向用户描述影响：说清楚用户会看到什么变化，而不是改了哪个函数；行为有取舍时把代价一并写出来。
- 关联 PR 或 issue 时统一用 `owner/repo#123` 格式，例如 `hxquan-q/open-forge#8`。
- 没有用户可感知影响的纯内部改动（内部重构、测试、开发文档）仍要在「其他」留一条，但保持一句话，不要挤占正文。
- 已发布版本的发布说明不得修改；发现写错另起一条修订说明。
- 发布说明缺失会让 `desktop-release` 流水线在质量阶段直接失败（`node scripts/release/release-notes.mjs --check`），补不上就没有正文可发。
- `apps/desktop/CHANGELOG.md` 自 0.5.58 起冻结，只保留历史记录，不再追加。

### 新增包

- 新增 workspace 包时先判断归属：应用进 `apps/*`，可复用模块进 `packages/*`。随后遵循 [`docs/monorepo-new-package.md`](../../../docs/monorepo-new-package.md)，同时更新 workspace、TypeScript path maps、构建分层和必要的 Desktop 源码映射。
- 不执行版本发布、制品上传、registry 发布或部署，除非用户明确要求。
## 交付要求

交付时简要说明：

- 改变了什么可观察行为或文档合同
- 修改了哪些主要文件
- 实际运行了哪些测试和检查及其结果
- 哪些验证未运行以及原因
- 本次条目已写入 `.github/release-notes/v<版本号>.md`（改动、修正、新增、合并 PR、关闭 issue 均需写入）
- 已知风险、兼容性影响或仍需用户决定的事项

不得声称未实际执行的测试、构建或人工验证已经通过。

## 版本与发布状态

- **版本事实源**：Desktop 的发布版本只有 `apps/desktop/package.json#version` 一处；`.github/release-notes/v<版本>.md` 的文件名与标题必须与它一致，`bun run check` 会校验。
- **0.x 语义**：当前 `0.1.x` 属 Preview，公共 API 不作稳定承诺；不引入预发布后缀，Preview 由 GitHub Release 的 pre-release 标记表达。
- **发布日期只在发布动作里产生**：`release:desktop:prepare` 写占位「待定」，`release:desktop:publish` 在提交与打 tag 之前写入当天日期。没有 `v<版本>` tag 的版本，说明里的日期必须是「待定」；写成具体日期会让 `bun run check` 失败。
- **上游基线行**只由 `release-desktop.mjs` 按 `git merge-base upstream/dev HEAD` 写入，不手工编辑。
- **已发布版本只读**：存在 `v<版本>` tag 的说明文件不得再修改，发现写错另起一条修订说明。
- **上游继承的说明**（`# Vetta …`）保持原文，不改写成 Open Forge 正文。
- **各应用版本归属**：Desktop 以 `apps/desktop/package.json` 为准；`apps/cli-host`、`apps/mobile`（`package.json` 与 `app.json` 需一致）、`apps/kotlin`（`versionCode`/`versionName`）、`apps/im-gateway`（Makefile `VERSION`）与各插件包各自独立、当前都不发布；根 `package.json`、`apps/docs-site`、`packages/runtime-knowledge` 仍是继承自上游的 `0.55.3`，无发布含义，改动前先评估上游同步成本。
