---
id: TASK-0518
type: task
status: verifying
priority: P2
owner: packages/plugins
requirement: REQ-0008
plan: PLAN-0032
source: verifier_0516 终审复查（TASK-0516 交付后遗漏发现）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0516]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: b7f1c5149
read_paths:
  - packages/plugins/presets/git/vite.config.ts
  - packages/plugins/presets/git/src/components/GitPanel.tsx
  - packages/plugins/presets/git/src/components/graph/BranchSelector.tsx
  - packages/plugins/docs/module-federation.md
  - packages/plugins/plugin-vite/src/index.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-shared-modules.ts
write_paths:
  - packages/plugins/presets/git/vite.config.ts
  - project/tasks/TASK-0518-git-plugin-host-theme-ui-shared.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0518 Git 插件补登宿主 theme-ui 共享声明

## 合同

- 来源与目标：TASK-0516 终审复查发现——`GitPanel.tsx` 与 `graph/BranchSelector.tsx` 实际导入 `@vetta-org/theme-ui/plugin-ui`，但 `vite.config.ts` 只有 `hostUi: true`、缺 `hostThemeUi: true`，违反 [module-federation.md](../../packages/plugins/docs/module-federation.md)「实际导入该入口的插件须同时完成两项声明」。未登记时插件构建会自行打包 theme-ui 副本（宿主 share scope 的单例形同虚设），属配置漏改而非代码回归。
- 输入 → 输出：一行配置补登 → MF 清单登记 `@vetta-org/theme-ui/plugin-ui` 为 singleton 共享（不随插件打包）。
- 做 / 不做：做 vite.config.ts 补登 + 构建级证据。不做：其他插件的逐项审计（本次核查确认 presets 内仅 git 导入 plugin-ui）、module-federation 门禁脚本化（留待后续按需）。
- Given / When / Then：git 插件执行 `bunx vite build` → `dist/mf-manifest.json` shared 数组含 `@vetta-org/theme-ui/plugin-ui`（singleton、空 assets）→ 宿主 `plugin-shared-modules.ts:43` 的映射在运行时接管。
- 验证：vite build 成功 + mf-manifest 结构核对 + `bun run check`。
- 人工验收：无独立 UI 变化；git 面板 SegmentedControl 行为由 TASK-0516 的人工验收覆盖。

## 交付

- 2026-11-26 实施交付：
  - 改动：`vite.config.ts` 补 `hostThemeUi: true`（一行）。
  - 证据：build 成功（20.9s，334 runtime files）；`dist/mf-manifest.json` shared 含 `git:@vetta-org/theme-ui/plugin-ui`（`singleton: true`、assets 为空——不随插件打包，由宿主提供）；核查确认 presets 插件中仅 git 导入 `theme-ui/plugin-ui`，无其他漏登。
  - 运行前基线对照：修复前同一构建产物中无该 shared 条目（plugin-vite 逻辑 `hostThemeUi` 缺省不登记）。
