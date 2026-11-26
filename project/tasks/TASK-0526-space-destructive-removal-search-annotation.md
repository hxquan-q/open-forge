---
id: TASK-0526
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0523, TASK-0524, TASK-0525]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 5c07d1eb4
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/project/services/space-removal.ts
  - apps/desktop/src/renderer/domains/settings/components/SpacesSettings.tsx
  - apps/desktop/src/renderer/domains/settings/components/SpacesSettings.test.tsx
  - apps/desktop/src/renderer/domains/command-menu/hooks/useCommandMenuModel.ts
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: [TASK-0524, TASK-0525]
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 工作空间分组切片③：破坏性移除档 + 全局搜索空间标注

## 合同

- 来源与目标：PLAN-0032 P9 工作空间分组（ADR-0156 决策 3/4）收尾；上游参照 `upstream/dev` 的 `SpacesSettings.tsx`（RemoveSpaceDialog）、`services/space-removal.ts`（`temp/up-space-removal.ts`）与命令面板 `commandSpaceItem`/空间标注（`temp/up-cmdmenu.ts` L368-384/L453-459/L652-665）。
- 做（本任务）：
  - **破坏性移除档**：新建 `services/space-removal.ts`（本地裁剪版）——`readSpaceRemoval` 只算普通维度：config.projects/archivedProjects 按项目归属过滤、`listSessions(defaultCwd)` 按会话路径归属过滤；无 team 维度（ADR-0156：归属键统一会话路径，团队会话不进空间，不读 listSidebarConversations、不做 allTeamPaths 排除）。`runningSpaceConversations` 只覆盖普通会话（`listRunning`）。
  - `SpacesSettings` 移除流程升级为上游两档对话框 `RemoveSpaceDialog`（`@shared/components/ui/dialog` + `@vetta-org/ui/button`，替换切片②a 的 confirmDialogAtom 单确认）：radio「仅移除工作空间 / 移除工作空间以及项目」；破坏档显示影响计数（`spaces.removalImpact`）、输名确认（输入必须等于空间名）、运行中会话列表拦截（有运行会话直接 abort 不删任何内容）；非破坏档走 `forgetSpace`。
  - 破坏档删除编排：逐条会话删除必须走本地 `useProjects.deleteSession`（BUG-0191 编排：scheduler/pinned 清理），项目注销走 `removeProject`（保持上游「项目文件和项目内会话保留」语义）；全部完成后 `forgetSpace`。任一步失败：console.error + `spaces.error` 提示，可重试。
  - **全局搜索空间标注**（`useCommandMenuModel.ts`）：移植上游 `commandSpaceItem` 本地裁剪——`openProject` → `{kind:"project", key: cwd}`；`openSession` → `sourceKind === "conversation"` 时按会话路径、否则按 `sourceCwd` 项目键；`openTeamSession` 不映射（ADR-0156 团队不进空间，不标注也不 reveal）。项目行空间名进 `badge`，会话行进 `subtitle` 后缀；激活时先 `revealSpaceItem`（与上游同位置，`openSession` 且 target 为 unavailable 时不 reveal）。删除 `useCommandMenuModel.ts:369-372` 的 TODO 注释。
  - i18n：project.json zh/en 补 `spaces.removeWithProjects`/`removalImpact`/`confirmName`/`running`/`error`（zh/en 键集一致，文案照抄上游）。
- 不做：归档项目的注销（上游语义保留——破坏档只注销在册项目，归档项目随 forgetSpace 并回主空间，影响计数文案如实写明）；皮肤统一（未立项）；`Ctrl+数字` 快捷键行为变化（切片①已交付）。
- 保留本地分叉不动：BUG-0191 删除编排、BUG-0195、SpaceSwitcher 占满底栏。
- Given / When / Then：
  - 设置页点移除 → 对话框两档可选；默认档与切片②a 行为一致（归属并回主空间）。
  - 选破坏档 → 显示项目/会话/归档影响计数；输入空间名才能点确认；输入错误确认键禁用。
  - 破坏档确认 → 逐条删归属会话（含 scheduler/pinned 清理）→ 注销在册项目 → 空间消失；有运行中会话时一个都不删并列出名称。
  - 命令面板搜到归属自定义空间的项目/会话 → 行上出现空间名标注；激活后切到该空间再打开。
- 验证：`space-removal` 单元测试（归属过滤、归档口径）；`SpacesSettings.test.tsx` 对话框测试（两档、输名门控、运行拦截、删除编排顺序）；命令面板标注接线测试（badge/subtitle 修饰、revealSpaceItem 调用、team 行不标注）；`test:impact`；`bun run check`；断言深度门禁（捕获值断言）。
- 人工验收：两档移除全流程（含输错名、运行中拦截）、命令面板空间标注与跳转。

## 交付

- 实施（2026-11-27）：
  - 破坏性移除档：新建 `services/space-removal.ts`（本地裁剪版）——`readSpaceRemoval` 只算普通维度（config.projects/archivedProjects 按项目归属过滤、`listSessions(defaultCwd)` 按会话路径归属过滤），无 team 维度、不读 listSidebarConversations、不做 allTeamPaths 排除；`runningSpaceConversations` 只查 `listRunning` 命中普通会话。
  - `SpacesSettings` 移除流程升级为 `RemoveSpaceDialog` 两档对话框（`@shared/components/ui/dialog` + `@vetta-org/ui/button`）：radio「仅移除工作空间 / 移除工作空间以及项目」；破坏档显示 `spaces.removalImpact` 影响计数（在册项目/独立会话/归档分列）、输名确认（确认键在 `confirmation !== space.name` 或盘点未就绪时禁用）、运行中会话列表拦截（重盘点后有一个运行中即直接 return，一个都不删）。非破坏档保持切片②a 行为：`forgetSpace`，归属并回主空间。
  - 破坏档删除编排（本地分叉保留）：逐条会话走 `useProjectActions.deleteSession`（BUG-0191 编排：session.delete 主删除 + 置顶/scheduler 关联清理），项目注销走 `removeProject`（保持上游「项目文件和项目内会话保留」语义，归档项目不删除、随 forgetSpace 并回主空间）；确认瞬间重新盘点（对话框开着期间归属可能被别处移动）；任一步失败 console.error + `spaces.error` 提示，空间保留、已删内容不回滚，可直接重试。
  - 全局搜索空间标注（`useCommandMenuModel.ts`）：移植上游 `commandSpaceItem` 本地裁剪——`openProject` → `{kind:"project", key: cwd}`；`openSession` → sourceKind conversation 按会话路径、其余按 sourceCwd 项目键；`openTeamSession` 不映射（ADR-0156 团队不进空间，不标注也不 reveal）。项目行空间名进 `badge`，会话行进 `subtitle` 后缀；`runAction` 开头 `revealSpaceItem`（openSession 且 access 为 unavailable 时不 reveal）；viewer 落点补 `rememberSpaceLocation`（上游同位置）；删除 useCommandMenuModel 原 TODO(spaces) 注释。
  - i18n：project.json zh/en 补 `spaces.removeWithProjects`/`removalImpact`/`confirmName`/`running`/`error`（文案照抄上游，zh/en 各 26 键集一致）；release fragment `workspace-destructive-removal-search-annotation.md` 已汇编进 v0.1.5。
- verifier_0526 静态复查：complete/pass。修复低优先问题一处——`SpacesSettings.tsx` 顶部注释过时（仍写「移除走非破坏档」），已更新为两档说明。复查观察项「!cwd 时确认键可点却无反馈」与上游写法一致，正常流程 cwd 已就绪，不修。
- 验证（实际执行）：
  - 定向：space-removal 6/6、SpacesSettings 11/11（含两档、输名门控、影响计数、运行拦截零删除、失败保留现场、失败重试成功、删除顺序 session→project）、useCommandMenuModel 25/25（含 badge/subtitle 标注、reveal 切空间、team 行不标注不切空间）。
  - `test:impact`（3 个源文件影响面）desktop 20 文件 137/137 通过；`bun run check` 全绿（lint/types/guards，含 test-assertion-depth——新断言用 mock.calls 捕获值口径，基线未升）。
- 未执行：Desktop 实机验证（无授权）。人工验收点：两档移除全流程（输错名禁用、运行中拦截）、命令面板空间标注与跳转。
