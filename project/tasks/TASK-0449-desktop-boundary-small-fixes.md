---
id: TASK-0449
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3179282c470bdb2ccab8d9bdbfb7ff836b5eb66a
read_paths:
  - packages/theme-ui/package.json
  - packages/plugins/plugin-sdk/package.json
  - packages/ui/package.json
write_paths:
  - apps/desktop/src/main/cli/agent-rpc-command.ts
  - apps/desktop/src/main/plugins/plugin-protocol-contract.test.ts
  - apps/desktop/src/renderer/domains/conversation/components/blocks/markdown-math-client.test.ts
  - apps/desktop/src/renderer/domains/conversation/components/blocks/MarkdownRichContent.test.tsx
  - apps/desktop/docs/markdown-rich-content.md
  - packages/theme-ui/src/markdown/math-client.test.ts
  - packages/theme-ui/src/markdown/rich-content.test.tsx
  - packages/theme-ui/package.json
  - bun.lock
  - docs/dev/agent-rules/repository.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 包边界小修与仓库地图补全（PLAN-0029 Phase 0.3）

## 合同

- 来源与目标：PLAN-0029 Phase 0.3；消除已核实的规则偏离，不改运行时行为。
- 输入 → 输出：
  - `agent-rpc-command.ts:68` 的 `typeof import("@vetta/cli-host")` → 顶层 `import type`，运行时懒加载 `await import()` 保留。
  - 3 个测试文件的跨包相对路径 `../../packages/*/src/**` → 目标包 `exports` 公开入口；若内部模块未公开，在 Task 中记录选择（补 exports 或改测公开行为），不新增深链。
  - `repository.md` 补 `apps/remote-relay`，并写明 `desktop → cli-host`（`--agent-rpc` 懒加载）与 `runtime-desktop → coding-agent` 两条现存例外依赖及其由 PLAN-0029 Phase 4 消除。
- 做 / 不做：只做以上三项；不调整依赖方向本身，不改 tsconfig paths。串行。
- Given / When / Then：Given 当前源码；When 完成修改；Then 定向测试通过、行为不变、`bun run check` 通过。
- 保留：`--agent-rpc` 懒加载语义与启动开销；测试断言不削弱。
- 验证：受影响测试经仓库 runner 定向运行；`bun run check`；文档链接核对。
- 人工验收：不适用（无用户可见变化）。

## 交付

- 实际修改：当前候选包含 agent-rpc 类型的顶层 import、插件协议测试的公开包入口，以及 remote-relay/既存依赖例外的仓库地图说明；属于原有未提交候选，提交前已核对实际 diff。
- 改动归属：Open-Forge-only。插件协议合同包含在本会话已通过的 Desktop 4 文件 15 例中，Desktop 类型检查通过；完整 check 仍有本轮未改的 docs/mobile 类型错误，未宣称本 Task 已完成全部验收。
- 2026-11-06 用户明确要求提交推送，本提交保存至 `xquan`，目标 `origin/xquan`；集成状态保持 pending，完整 Task 范围继续按合同核对。
- 未运行与风险：不启动真实 Desktop；不调整依赖方向或扩大依赖版本。全量验证失败详情见 TASK-0448。
- 发布：不适用

## 2026-11-06 深链测试迁入 theme-ui

- 决策（用户选择）：`markdown-math-client.test.ts` 与 `MarkdownRichContent.test.tsx` 测的是 theme-ui 内部模块（`math-render`、`math-client`、`RichCodeBlock`、`use-render-snapshot`），这些模块不在公开 `exports` 中，且该包公开发布到 npm。选择把测试迁入 `packages/theme-ui/src/markdown/`（`math-client.test.ts`、`rich-content.test.tsx`），改用包内相对导入；不为测试扩大公开 exports。
- Desktop 专用的 `markdown-host.fixture.ts` 仍被 `MarkdownMedia.test.tsx` 使用，原样保留；迁入的测试内联同结构的宿主替身。
- theme-ui `devDependencies` 新增 `@testing-library/react@16.3.2`（与仓库内其他包已锁定版本一致，未升级）；`bun.lock` 随之重排，Desktop 继续解析 16.3.3。
- 断言与用例未改动：迁移后 2 文件 14 例通过。
- `apps/desktop/docs/markdown-rich-content.md` 的开发验证命令同步到新路径。
- theme-ui 包级 `tsgo` 检查迁移前后同为 51 条既有错误（`JSX` 命名空间、`node:*` 类型），新文件未引入新错误；该检查不在 `bun run check` 内。

## 集成补记（2026-11-07）

- 三项范围（顶层 `import type`、测试改走公开入口/迁入 theme-ui、仓库地图补全）已随 `96ff5a6b0`/`1961cd20a` 集成本地 `main` 并推送 `origin/dev`（16d7e620f）；`integration_status` 补记为 integrated，状态置 verifying（人工验收不适用，完成标准见交付记录）。
