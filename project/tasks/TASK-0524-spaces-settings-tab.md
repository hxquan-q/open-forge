---
id: TASK-0524
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0523]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 57ee28c44
read_paths: []
write_paths:
  - apps/desktop/src/shared/store/ui-atoms.ts
  - apps/desktop/src/renderer/domains/settings/registry.ts
  - apps/desktop/src/renderer/domains/settings/components/settings-tab-loaders.ts
  - apps/desktop/src/renderer/domains/settings/components/SettingsPage.tsx
  - apps/desktop/src/renderer/domains/settings/components/SpacesSettings.tsx
  - apps/desktop/src/renderer/domains/settings/components/SpacesSettings.test.tsx
  - packages/theme-ui/src/settings/SpacesSettingsView.tsx
  - packages/theme-ui/src/settings/index.ts
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - apps/desktop/src/shared/i18n/locales/zh/settings.json
  - apps/desktop/src/shared/i18n/locales/en/settings.json
  - apps/desktop/src/renderer/domains/project/components/sidebar/SpaceSwitcher.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/SpaceSwitcher.test.tsx
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: [TASK-0523]
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 工作空间分组切片②a：设置页工作空间标签页 + 非破坏移除 + 弹层设置入口

## 合同

- 来源与目标：PLAN-0032 P9 工作空间分组（ADR-0156 决策 3「设置页工作空间标签页」、决策 4「移除默认并回主空间」）与 TASK-0523 交付边界（切片②）；上游参照 `upstream/dev` 的 `SpacesSettings.tsx`、`SpacesSettingsView.tsx`（theme-ui）、registry 注册方式。
- 做（本任务）：
  - 移植 theme-ui `SpacesSettingsView`（`temp/up-SpacesSettingsView.tsx` 参照）：讲解区 + 空间列表 + HTML5 原生拖排；注册进 `settings/index.ts` barrel。
  - 新建 `SpacesSettings.tsx` 域组件并注册设置页标签页：ui-atoms `SettingsTab` 加 `"spaces"`、registry 加 tab/section 条目、settings-tab-loaders 与 SettingsPage 映射。
  - 创建/编辑经既有 `spaceEditorAtom`（切片①对话框）；排序经 `reorderSpace`。
  - 移除流程**只做非破坏档**：确认对话框（复用本地既有确认形态，不上游 radio 两档）——移除空间后项目与会话归属并回主空间（`forgetSpace` 语义本就如此）。破坏档（连同内容删除 + 主进程核验 + 输名确认）属 TASK-0526 切片③，本任务不做，UI 不展示。
  - SpaceSwitcher「更多」弹层底部补「工作空间设置」入口（切片①留的坑位），点击打开设置页 spaces 标签（顺带把测试里「无设置入口」反向断言更新为正向断言）。
  - i18n：project.json 补 `settings`、`spaceSettings`、`intro.*`（13 键），settings.json 补 `tabSpaces`、`section_workspaces`；zh/en 键集一致。`move`/`remove*` 等其余键随各自任务补。
  - ADR-0156 边界不动：无 team 归属维度；归档项目仍不受空间影响。
- 不做：侧栏过滤与移动菜单（TASK-0525）；破坏性移除与主进程删除模式、全局搜索标注（TASK-0526）；皮肤统一增量（候选，未立项）。
- Given / When / Then：
  - 设置页出现「工作空间」标签 → 讲解区四条 + 主空间行 + 自定义空间列表展示，顺序与 SpaceSwitcher 一致。
  - 列表内拖动把手改变顺序 → 底栏切换器顺序同步变化。
  - 点新建/编辑 → 打开切片①的 SpaceEditorDialog（新建态/编辑态）。
  - 移除自定义空间（确认后）→ 空间消失，其归属项目/会话回落主空间，底栏同步消失；主空间行无移除按钮。
  - 底栏「更多」弹层点「工作空间设置」→ 打开设置页并落在 spaces 标签。
- 验证：SpacesSettings 组件测试（列表渲染、reorder 回调、create/edit 分发、remove 走 forgetSpace）；registry 既有测试适配；`bun run test:impact`；`bun run check`。
- 人工验收：设置页增删改排空间、底栏同步、弹层进设置、移除后归属回落。

## 交付

- 实施（2026-11-27）：
  - theme-ui `SpacesSettingsView` 逐字节移植上游（去版权头差异后 sha 一致），注册进 `settings/index.ts` barrel。
  - 注册链路 5 处：`SettingsTab` 加 `"spaces"`；registry 加 tab（webhook 与 archive 之间）与 section `{tab:"spaces",id:"workspaces"}`；settings-tab-loaders 与 SettingsPage 全键映射补齐。
  - 新建 `SpacesSettings.tsx` 域组件：讲解区四条 + 主空间行 + 自定义空间列表；创建/编辑走切片① `spaceEditorAtom`，排序走 `reorderSpace`；移除只做非破坏档——全局 confirmDialogAtom 确认后 `forgetSpace`，归属自动并回主空间；上游 radio 两档/输名确认/主进程核验未带入（属 TASK-0526）。
  - SpaceSwitcher「更多」弹层底部补「工作空间设置」入口：关弹层后 navigate `/settings/$tab` tab=spaces；测试反向断言更新为正向用例（捕获 navigate.mock.calls + toEqual）。
  - i18n：project.json zh/en 补 spaces.settings/spaceSettings/remove/removeTitle/removeDescription/intro.*（13 键）；settings.json zh/en 补 tabSpaces/section_workspaces；zh/en spaces 子树各 90 键完全对齐。
  - release fragment `workspace-grouping-settings.md` 已汇编进 v0.1.5。
- 验证（实际执行）：
  - 定向：SpacesSettings.test.tsx 6/6、SpaceSwitcher.test.tsx + registry.test.ts 16/16；settings/sidebar/store 影响面 66 文件 390/390。
  - `bun run check` 全绿（lint/types/guards 全部 exit 0）。
  - `check-test-assertion-depth.mjs` ok；`project-indexes` 焦点表同步 ok。
  - `test:impact`（桌面全量）6781 通过 / 13 失败：失败为 HEAD 既有环境性问题——loopback SSH 类（本机无 SSH 服务，如 skill-presentation-read.test.ts 2 例，改动文件与其零交集）、DetailDrawer mock 缺 cn、session-switch 并行抖动；与本次改动无关已逐类核对。
  - verifier_0524 独立复查 complete/pass：全部合同点 file:line 证据核对通过，无必修项。
- 未执行：Desktop 实机验证（无授权）；破坏性移除、移动菜单、侧栏过滤（按合同属 TASK-0525/0526）。
- 遗留（不阻塞）：
  - `spaces.intro.group.description` 提到的右键「移动到工作空间」入口随 TASK-0525 落地，发布前会补齐；同版本内不构成断档。
  - preload `AppMonitorSettingsTab` 未含 `"spaces"`：当前无 spaces 埋点调用，接入埋点时再补。
