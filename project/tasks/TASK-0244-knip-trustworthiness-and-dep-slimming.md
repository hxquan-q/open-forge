---
id: TASK-0244
type: task
status: done
priority: P2
owner: knip/依赖治理
requirement:
plan:
source: 2026-10-14 仓库优化盘点：knip 配置过期致报告不可信（coding-agent entry 指向已删除文件、packages/ai scripts/ 面不可见、两条 ignoreDependencies 失效）+ 17 个全仓零引用依赖
related_requirement: []
related_plan: []
related_tasks: [TASK-0243]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 0e1e573b8
read_paths: [knip.config.ts, packages/coding-agent/package.json, packages/ai/package.json, apps/mobile/package.json]
write_paths: [knip.config.ts, packages/coding-agent/package.json, packages/ai/package.json, apps/mobile/package.json, bun.lock, .github/release-notes/v0.1.3.md, project/tasks/TASK-0244-knip-trustworthiness-and-dep-slimming.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# knip 报告可信化与零引用依赖清理

## 目标

让 `bun run deadcode:report` 的依赖级结论可信，并按其结论删除全仓零引用的 17 个依赖声明。

## 范围

### 做

- **knip.config.ts 三处过期修正**：
  - coding-agent `entry` 中 6 个已不存在的路径（`src/cli.ts`、`src/core/hooks|settings-manager|mcp/*|resolve-config-value.ts`）替换为 `package.json#exports`（24 条，全部指向 `dist/`）对应的 `src/` 实现文件——exports 无法被 knip 自动映射回源码，此前 public-api 面被整体误报 unused files；
  - packages/ai 的 `entry`/`project` 补 `scripts/**/*.ts`——`scripts/generate-test-image.ts` 是 `canvas`（devDep）唯一使用点，此前不可见导致 canvas 被误报 unused devDependency；
  - 根 `ignoreDependencies` 删除 `deepeval`、`promptfoo`——`scripts/eval/harness/*.ts` 与 `scripts/eval/promptfoo/run.mjs` 真实使用，豁免已失效。保留 `@vetta/coding-agent`（根清单的 hoist/launcher 职责仍在，root scripts 无真实 import，删豁免会制造新误报）。
  - 补 apps/mobile 工作区条目：`main: expo-router/entry` 是虚拟模块（knip 报 entry file not found），显式给 `src/app/**` 路由面作 entry。
- **删除 17 个零引用依赖**（每个都做了「谁声明 × 全仓 4 形态引用（from/import()/require()/副作用 import，含 .ts/.tsx/.mjs/.cjs/.js/.jsx）」审计，引用均为 0）：
  - packages/coding-agent deps：`@modelcontextprotocol/sdk`、`@silvia-odwyer/photon-node`、`ajv`、`ajv-formats`、`diff`、`file-type`、`glob`、`marked`、`strip-ansi`；devDeps：`@types/diff`、`@types/ms`——真实使用方在 runtime-node/runtime-mcp/desktop/ai，均各自声明自有副本；
  - packages/ai deps：`@mistralai/mistralai`、`chalk`、`zod-to-json-schema`——chalk 的 9 处引用在 coding-agent 与 cli-host（各自声明）；
  - apps/mobile deps：`@expo/ui`、`expo-glass-effect`、`expo-status-bar`——源码与 app.json 均零引用。
- `bun install` 同步 bun.lock。

### 不做

- **保留 `canvas`（packages/ai devDep）**：knip 误报，`scripts/generate-test-image.ts:3` 在用；本次以修配置消除误报，不删依赖。
- 不删除 knip 报告的 unused files / unused exports：需配置修好、报告稳定后另行核证（多数是 exports 面或公共合同）。
- 不动 `remote-relay`/`remote-desktop`/`skill-presets` 的 knip 提示（advisory，非坏损）。
- 不做依赖升级或版本变动，纯减法。

## Given / When / Then

- Given：knip 报 15 unused dependencies + 3 unused devDependencies，其中 canvas 为配置盲区误报。
- When：修正三处配置、删除 17 项声明、`bun install` 后复跑 `bun run deadcode:report`。
- Then：unused dependencies/devDependencies 中这 17 项消失，`canvas` 不再出现；`bun run check` 全绿；安装成功。

## 必须保持

- 任何包的运行时解析不受影响：被删依赖在全仓（含被 knip 忽略的 desktop/plugins/runtime-* 工作区）无任何 import 形态引用；真实使用方均自有声明。
- coding-agent 对外 24 条 exports 合同不变（只改 knip 分析配置，不改 package.json#exports）。

## 测试与验证

- 定向：`bun install` 成功；`bun run deadcode:report` 对照——17 项消失、canvas 消失、无新增 unused dependencies。
- 质量检查：完整 `bun run check`（含 root tsgo、desktop typecheck、mobile typecheck——若 mobile 依赖删除破坏解析会在此暴露）。
- 用户流程：不适用（依赖声明清理，无行为变化）。

## 验收分层

- 工程验证：待执行；绑定上述命令。
- 技术评审：自审；每依赖有声明方×引用形态审计记录，canvas 误报有根因（knip project 盲区）与证据。
- 集成：main 串行，验收后推 origin/dev。
- 人工功能验收：不适用。
- 发布：未授权；v0.1.3「其他」小节补一句。

## 交付记录

- 实际修改：knip.config.ts（coding-agent entry 由 6 条死路径重写为 exports 24 条对应的 src 文件、packages/ai 补 `scripts/**` 面、根 ignoreDependencies 删 `deepeval`/`promptfoo`、新增 apps/mobile 工作区条目）；packages/coding-agent、packages/ai、apps/mobile 三个 package.json 删 17 项依赖声明；bun.lock 同步。
- 实际运行：`bun install`（17 packages removed，与声明删除数一致）；`bun run deadcode:report` 前后对照——unused dependencies 与 unused devDependencies 两节整体消失、unused files 23→18（exports 面的 4 个文件出列）、unused exports 63→27、unused exported types 30→14、Configuration hints 15→2；完整 `bun run check` exit 0（root tsgo / desktop / mobile typecheck 全过）。
- 未运行及原因：未跑测试套件——删除的是全仓四种引用形态均为零的依赖声明，模块解析风险由 root/desktop/mobile typecheck 与安装图（17 packages removed）覆盖。
- Worktree：未拆出；串行小改，main 直接实施。
- 剩余风险：knip 剩余 2 条 hints 为有意保留（`@vetta/coding-agent` launcher 豁免、Expo `expo-router/entry` 虚拟入口固有提示）；18 个 unused files 与 41 个 unused exports 为 advisory，待配置稳定后另行核证，不随本任务删除。
