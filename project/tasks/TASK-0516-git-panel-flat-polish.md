---
id: TASK-0516
type: task
status: verifying
priority: P2
owner: packages/plugins/presets/git
requirement: REQ-0008
plan: PLAN-0032
source: upstream（73305d477 平铺、994d3d88d 分区拖拽、3239d8e23 类型图标、060b589a1 分段控件、4b169ab54 分支切换 Select、055c3a5fa 访达文案）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0512, TASK-0514, TASK-0515]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e7fa4fcb1
read_paths:
  - packages/plugins/presets/git/src/
  - packages/plugins/presets/git/test/
  - packages/plugins/presets/git/locales/
  - packages/plugins/plugin-sdk/src/ui.ts
write_paths:
  - packages/plugins/presets/git/src/git/platform.ts
  - packages/plugins/presets/git/src/components/GitChanges.tsx
  - packages/plugins/presets/git/src/components/GitFlatList.tsx
  - packages/plugins/presets/git/src/components/ChangeSectionList.tsx
  - packages/plugins/presets/git/src/components/DiffPane.tsx
  - packages/plugins/presets/git/src/components/GitFileTree.tsx
  - packages/plugins/presets/git/src/components/icons.tsx
  - packages/plugins/presets/git/src/components/GitPanel.tsx
  - packages/plugins/presets/git/src/components/BranchBar.tsx
  - packages/plugins/presets/git/src/components/graph/BranchSelector.tsx
  - packages/plugins/presets/git/src/components/SplitHandle.tsx
  - packages/plugins/presets/git/src/components/ChangeMenu.tsx
  - packages/plugins/presets/git/src/components/PatchContent.tsx
  - packages/plugins/presets/git/src/components/graph/CommitDetailPane.tsx
  - packages/plugins/presets/git/src/git/log.ts
  - packages/plugins/presets/git/package.json
  - packages/plugins/presets/git/vitest.config.ts
  - packages/plugins/presets/git/locales/zh.json
  - packages/plugins/presets/git/locales/en.json
  - packages/plugins/presets/git/test/
  - packages/plugins/presets/git/README.md
  - docs/architecture/dependents.md
  - bun.lock
  - project/tasks/TASK-0516-git-panel-flat-polish.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/git-panel-flat-polish.md
  - .github/release-notes/v0.1.5.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0516 Git 变更面板平铺与宿主控件打磨

## 合同

- 来源与目标：REQ-0008 择优上游适配的基线外增量。PLAN-0032 调查基线 `641aaf694`（2026-11-24 定）之后上游同日在变更面板继续推进的六个提交，均属 PLAN-0032 P8「Git/Markdown 打磨」主题的延续，按既定「手工合入、保留本地分叉」口径执行：
  - `73305d477` 变更面板从树/平铺双视图改为按文件名平铺单视图（删除树视图与折叠态），透出活动面板底色；
  - `994d3d88d` 暂存/更改分区之间拖拽调整高度（权重冻结，容器变高变矮比例保持）；
  - `3239d8e23` 变更行按文件类型显示图标；
  - `060b589a1` 变更/提交历史页签与分支作用域切换改用宿主分段控件（`@vetta-org/ui` SegmentedControl）；
  - `4b169ab54` 分支切换改用宿主 Select，浮层宽度收紧不被长分支名撑开；
  - `055c3a5fa` 右键菜单在 macOS 显示「在访达中显示」（新增 `src/git/platform.ts`，渲染进程 navigator 判定，仅挑文案）。
- 输入 → 输出：`packages/plugins/presets/git/src/` 面板组件 → 平铺单视图、分区可拖高、分段控件与 Select、平台化文案。
- 做 / 不做：做上述六提交的终端状态合入；locales 与上游逐键对齐（键序按上游，补 `section.resize`、`menu.revealInFinder`、`settings.commitSectionTitle`、`settings.behaviorSectionTitle`，删 `action.showTree/hideTree`，更新 `plugin.description` 与 `commit.copyHash`）。不做：上游 `f2b699899` 设置页 SettingsSection 重组（本地 GitSettingsView 为刻意分叉，settings 分段键仅随 locales 对齐带入，界面不跟进）、`d753d869f`/`9d1cadfed` 等基线内已另有本地实现或已评估的内容、`30d76f88b` 非 git 插件部分。
- 保留：本地刻意分叉——GitActions `diffStat` 增删行显示、TASK-0515 顶栏气泡链、probeGitTab 标签卡机制、CommitBox/CommitActionRow 共享提交行、本地既有各 fix（literal path 等）。
- Given / When / Then：打开项目 Git 面板 → 变更按文件名平铺（无树/平铺切换）、行首显示文件类型图标 → 暂存与更改分区之间出现可拖分隔条，拖动后高度比例在容器缩放时保持 → 页签与作用域切换为宿主分段控件 → 分支下拉为宿主 Select 且浮层不被长名撑开 → macOS 右键菜单显示「在访达中显示」。
- 验证：git 插件 `run-vitest.mjs`（移植上游 `changesPanel.test.tsx`、`gitPanelTabs.test.tsx`、`branchBar.test.tsx` 适配版）+ `check:quick -- <改动文件>` + `bun run check`。
- 人工验收：实机核对平铺密度、拖拽手感、Select 浮层与分段控件观感；`verify:ui:*` 未授权不做。

## 交付

- 2026-11-26 实施交付（主代理直接实施）：
  - 合入方式：六提交范围内 src 文件剥离一致性头后与 upstream/dev 逐字节相同（verifier SHA256 归一化比对确认：`GitChanges`/`ChangeSectionList`/`DiffPane`/`GitFileTree`/`GitFlatList`/`PatchContent`/`platform`/`BranchBar`/`BranchSelector`/`ChangeMenu`/`SplitHandle`/`icons`/`log`）；`GitPanel.tsx` 与 upstream 差异精确等于两处刻意分叉（不带入 `DiffStat` 头部组件与 `invalidateGitTabProbe`，因本地保留 GitActions diffStat 且无 probeGitTab 缓存）。locales zh/en 与 upstream/dev 逐字节相同。
  - 基建配套：新增 `vitest.config.ts`（react/motion 单例 dedupe + radix inline）与 `test/setup.ts`（React 单例桥）；`package.json` 补 `@vetta-org/theme-ui`、`motion` devDependencies；`README.md` Context Boundary 补 `@vetta-org/theme-ui` 内部依赖声明并刷新 `docs/architecture/dependents.md`。
  - 移植测试：`changesPanel`（6 例）/`gitPanelTabs`（1）/`branchBar`（4）/`diffVirtualization`（1）/`platform`（4）随 upstream 带入；`diffVirtualization.test.tsx` 有一处带注释 jsdom 适配——本地 `@pierre/diffs` 1.5.x 虚拟器首批渲染与 connect 存在时序竞争（浏览器 IntersectionObserver 正常回调无此问题），先等容器挂载再等待行；受控实验确认逐字版必败、适配版必过（各 2/2）。
  - 复查修正：verifier_0516 指出 `platform.test.ts` 遗漏，已按 upstream 逐字补入。
  - 验证证据：git 插件 `run-vitest.mjs --run` 全量 20 文件 103 用例全绿；`bunx tsc --noEmit` 通过；`bun run check` exit 0；`release-notes --assemble/--check` exit 0（仅既有风格警告）；`check-project-indexes` 通过。
  - 已知遗留（继承自 upstream 终态，非本次引入，未在范围内修复）：`GitChanges.tsx` 分区权重钳制在容器被压到低于最小权重时拖拽方向可能反向漂移；折叠分区头部计入 `available` 高度使钳制略松；`BranchBar` 点击远程分支裸 checkout 落到 detached HEAD。留待后续评估是否上报或本地修。
  - 未做：`verify:ui:*` 未授权；未启动长驻 dev；人工验收待用户实机核对平铺密度、拖拽手感、Select 浮层与分段控件观感。
