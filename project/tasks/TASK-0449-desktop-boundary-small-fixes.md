---
id: TASK-0449
type: task
status: ready
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
  - docs/dev/agent-rules/repository.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
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

- 实际修改与验证：待执行
- 评审与集成：待执行
- 未运行与风险：待记录
- 发布：不适用
