---
id: TASK-0512
type: task
status: verifying
priority: P2
owner: packages/plugins/presets/git
requirement: REQ-0008
plan: PLAN-0032
source: upstream（54fb4d5a9 活动面板按钮组 + d25fa3cc8 去标签栏分割线 + aeae24785 分支选择默认大小靠右）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0510]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 113012e17
read_paths:
  - packages/plugins/presets/git/src/components/
  - packages/plugins/presets/git/src/components/graph/
  - packages/ui/src/button-group.tsx
  - packages/ui/src/select.tsx
write_paths:
  - packages/plugins/presets/git/src/components/GitActions.tsx
  - packages/plugins/presets/git/src/components/GitPanel.tsx
  - packages/plugins/presets/git/src/components/graph/BranchSelector.tsx
  - project/tasks/TASK-0512-git-panel-button-group.md
  - .github/release-notes/fragments/v0.1.5/git-panel-button-group.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0512 Git 活动面板按钮组（PLAN-0032 P8③）

## 合同

- 来源与目标：PLAN-0032 P8 第三项。上游 `54fb4d5a9`（fetch/pull/push/sync 操作按钮改用宿主 `ButtonGroup`/`ButtonGroupItem`）+ `d25fa3cc8`（去掉标签栏下方水平分割线）+ `aeae24785`（提交图分支选择不再撑满整行，改默认大小靠右），手工合并进本地 fork 的 git 插件。
- 输入 → 输出：`packages/plugins/presets/git/src/components/`（GitActions/GitPanel）与 `graph/BranchSelector` → 按钮组成胶囊、标签栏分割线移除、分支选择 `ml-auto` 默认尺寸。纯视觉/结构改造，行为合同不变。
- 做 / 不做：只合 UI 层按钮组与两处细节；不动上游同批的 `git/publish.ts` 共享重构与顶栏分支气泡（属 P8④ 范畴）；不做提交图操作缺口（P8②）。串行主工作区，无拆分收益。
- Given / When / Then：上游 diff 手工合入后，本地 fork 的 diffStat 行级增删统计显示与内联 preflight push 实现保留不变；git 插件现有测试与 `check:quick` 全绿。
- 保留：diffStat `+x/−y` 统计、`untrackedTruncated` 提示、preflight push 内联实现、发布确认对话框、`onRefreshSignal` 联动、busy/自旋语义全部不动。
- 验证：`run-vitest.mjs`（git 插件 test 目录）+ `bun run check:quick -- <改动文件>` + `bun run check`；视觉差异属 UI 验收，需用户实机确认。
- 人工验收：打开 Git 面板，确认 fetch/pull/push/sync 合并为一组胶囊、标签栏下无分割线、提交图分支选择靠右不撑满；工程完成以门禁+回归为准。

## 交付

- 实际修改与验证：上游 `54fb4d5a9` 按钮组重构手工合入 GitActions（`ButtonGroup blur={false}` + `ButtonGroupItem`，label/count 组合进 label prop，补 `aria-label`，label 内去 `text-foreground` 与上游一致）；`d25fa3cc8`（GitPanel 标签栏去 `border-b border-border`）与 `aeae24785`（BranchSelector `ml-auto`、SelectTrigger 恢复默认尺寸）逐字套用。本地 fork 的 diffStat 统计、内联 preflight push、ConfirmDialog 发布确认、`reloadIdRef` 竞态防护、`onRefreshSignal` 联动逐一核对未动。git 插件 `run-vitest.mjs --run` 11 文件 62/62 绿；`check:quick -- <三文件>` 全绿（声明头 missing=0，两个文件补加 `// Modified by The Open Forge contributors.`）；`bun run check` 完整门禁全绿。
- 评审与集成：verifier 独立复查 `complete/pass`——GitActions 与上游 `54fb4d5a9` after 逐字一致（仅多声明头）、fork 合同保留证据齐全、ButtonGroupItem/SelectTrigger 合同与上游修复意图吻合、宿主转发链路成立、唯一直接调用方 `GitChanges.tsx:174` 宽/窄两条渲染路径均成立；无阻断发现。
- 未运行与风险：纯视觉改造未做实机 UI 走查（`verify:ui:*` 未授权）；胶囊外观、分割线移除、分支选择靠右、窄面板宽度需用户会话实测确认。
- 发布：碎片 `.github/release-notes/fragments/v0.1.5/git-panel-button-group.md`（`## 改进`）已汇编进正文；推送 origin xquan 按既有授权执行。
