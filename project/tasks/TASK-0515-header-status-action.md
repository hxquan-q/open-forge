---
id: TASK-0515
type: task
status: verifying
priority: P2
owner: packages/plugins/presets/git
requirement: REQ-0008
plan: PLAN-0032
source: upstream（fb5539dcf 提交判断抽取、f04c041c4 顶栏状态、66ca7d7d8 气泡形态重做）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0510, TASK-0512, TASK-0514]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: a725008d3
read_paths:
  - packages/plugins/presets/git/src/
  - packages/plugins/presets/git/test/
  - packages/plugins/presets/git/locales/
  - packages/plugins/plugin-sdk/src/ui.ts
write_paths:
  - packages/plugins/presets/git/src/git/commitFlow.ts
  - packages/plugins/presets/git/src/git/publish.ts
  - packages/plugins/presets/git/src/git/headerStatus.ts
  - packages/plugins/presets/git/src/components/CommitActionRow.tsx
  - packages/plugins/presets/git/src/components/HeaderStatusAction.tsx
  - packages/plugins/presets/git/src/components/CommitBox.tsx
  - packages/plugins/presets/git/src/components/GitActions.tsx
  - packages/plugins/presets/git/src/index.tsx
  - packages/plugins/presets/git/plugin.json
  - packages/plugins/presets/git/ability.json
  - packages/plugins/presets/git/locales/zh.json
  - packages/plugins/presets/git/locales/en.json
  - packages/plugins/presets/git/README.md
  - packages/plugins/presets/git/test/
  - project/tasks/TASK-0515-header-status-action.md
  - .github/release-notes/fragments/v0.1.5/git-header-status-action.md
  - .github/release-notes/v0.1.5.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0515 顶栏分支状态与提交气泡（PLAN-0032 P8④）

## 合同

- 来源与目标：PLAN-0032 P8 第四项。手工合并上游三提交：`fb5539dcf`（抽 `git/commitFlow.ts` 的 `planCommit` 与 `git/publish.ts` 的 `preflightPush`，作为面板与顶栏共用的唯一判断点）、`f04c041c4`（顶栏展示分支名 + 未提交文件数，点开气泡切分支 / 提交 / 拉推）、`66ca7d7d8`（气泡形态重做：分支无底色下拉、fetch/pull/push/sync ButtonGroup 带角标、提交行共用 `CommitActionRow`、直达面板图标按钮）。
- 输入 → 输出：`packages/plugins/presets/git/src/` → 会话页顶栏多一格 Git 状态动作（`registerHeaderAction`，依赖 TASK-0510 已就绪的宿主 2.14.0 合同）；提交判断收敛到共享模块。
- 做 / 不做：做 commitFlow/publish/CommitActionRow 收编（CommitBox、GitActions 改调共享实现）、headerStatus 探测缓存（去掉上游对 `peekGitTabProbe` 的短路——本地已删整套 gitTabProbe 缓存，直探不影响正确性）、HeaderStatusAction 气泡、index.tsx 注册（`id: "status"`、`order: 40`、`pin: "prefer"`、surfaces `["conversation"]`）、pluginApiVersion 升 `^2.14.0` 并补 `ui.slot.header-action` 权限、插件版本 0.3.0→0.4.0、locales 补 `header.*` 16 键、两个测试移植。不做：上游 `useGitTabMeta`/标签卡显隐链改造（本地 probeGitTab + claimTabAttach 属刻意演进，P9 另行评估）、上游标签卡 scope 放宽（本地保留 `["project"]`）。
- Given / When / Then：项目会话页顶栏 → Git 状态格显示分支名与未提交计数 → 点开气泡 → 切分支/写消息提交/拉推与面板行为一致；非仓库目录不显示该格；冲突数优先于变更数显示且角标转红。
- 保留：本地 fork 的 GitActions `diffStat` 增删行显示、CommitBox 其余交互、probeGitTab 标签卡机制、插件 author 文案。
- 验证：`run-vitest.mjs`（git 插件 test 目录，含移植的 headerStatus 单元测试与 headerPanel UI 集成测试）+ `bun run check:quick -- <改动文件>` + `bun run check`。
- 人工验收：顶栏 Git 状态格出现且可交互；气泡内切分支/提交/拉推实际生效；与面板共享草稿；需用户实机确认。

## 交付

- 实际修改与验证：新增共享模块 `src/git/commitFlow.ts`（planCommit 唯一判断点）与 `src/git/publish.ts`（preflightPush）、`src/git/headerStatus.ts`（顶栏状态探测缓存：MIN_GAP_MS 节流、inFlight/queued 竞态、JSON 相等不打扰订阅；适配项：去掉上游 peekGitTabProbe 短路，直探三条命令）、`src/components/CommitActionRow.tsx`（面板与气泡共用提交行）与 `src/components/HeaderStatusAction.tsx`（useGitHeaderAction 声明 + GitHeaderPanel 气泡：分支下拉、fetch/pull/push/sync ButtonGroup 带角标、提交框共享面板草稿与 AI 生成、直达面板按钮）。CommitBox 换用上游原文（planCommit + CommitActionRow，无本地行为丢失）；GitActions 收编共享 preflightPush（保留本地 diffStat 增删行显示）；index.tsx 注册 `registerHeaderAction`（id status、order 40、pin prefer、surfaces conversation）；plugin.json pluginApiVersion 升 `^2.14.0` + 补 `ui.slot.header-action` 权限，plugin.json/ability.json 版本 0.3.0→0.4.0；locales zh/en 各补 16 个 `header.*` 键（与上游逐键逐值一致）；README 补权限文档。测试移植 headerStatus.test.ts（planCommit 5 + summarizeStatus 2）与 headerPanel.test.tsx（气泡集成 6 例）。git 插件 run-vitest 15 文件 87/87 绿；check:quick missing=0；`bun run check` 完整门禁 exit 0。
- 评审与集成：verifier_0515 独立复查 `complete/pass`——七个新文件除声明头外与上游逐字一致（headerPanel.test 按既定取舍采用上游 30d76f88b 版），GitActions/CommitBox 合并无误删，导入/合同/Hooks 规则/宿主 normalize 逐点确认，locales 逐键比对 0 差异。中级项两项已处理：仓库根误文件 `$null` 与 verifier 临时对照文件已清理；`.github/release-notes/v0.1.5.md` 纳入 write_paths 且正文由 `--assemble` 产出（`--check` exit 0 无漂移）。低级观察三项（disposeHeaderRepoStatus 无调用方——上游同样如此；popover.title 在 popover 形态下不显示——宿主产品取舍；README 权限文档滞后——已补）均不阻塞。
- 未运行与风险：未做实机 UI 走查（`verify:ui:*` 未授权）；顶栏格子的实际排位、气泡在窄屏收纳托盘里的内联展开形态需用户实机确认。
- 发布：碎片 `.github/release-notes/fragments/v0.1.5/git-header-status-action.md`（`## 新增`）已汇编进正文；推送 origin xquan 按既有授权执行。
