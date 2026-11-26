---
id: TASK-0525
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0523, TASK-0524]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: bd8c8327d
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useMoveSpaceMenu.ts
  - apps/desktop/src/renderer/domains/project/hooks/useSidebarFilterSelectModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useDefaultSessionListModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjectGroupModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.ts
  - apps/desktop/src/renderer/domains/project/components/ProjectContextMenu.tsx
  - apps/desktop/src/renderer/domains/project/components/SessionContextMenu.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/ProjectsPanelMenus.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/add-project/useAddProjectMenuModel.ts
  - apps/desktop/src/renderer/domains/conversation/components/new-session/project-selector/useNewSessionProjectSelection.ts
  - apps/desktop/src/renderer/shared/store/project-atoms.ts
  - packages/theme-ui/src/project/ProjectContextMenuView.tsx
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: [TASK-0523, TASK-0524]
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 工作空间分组切片②b：侧栏过滤 + 右键移动菜单 + 归属写入

## 合同

- 来源与目标：PLAN-0032 P9 工作空间分组（ADR-0156 决策 1「侧栏按选中空间过滤」、决策 2「右键移动到工作空间」）；上游参照 `upstream/dev` 的 `useProjectsPanelModel.ts`、`useMoveSpaceMenu.ts`、`useSidebarFilterSelectModel`、菜单接线与 `useProjects`/`useAddProjectMenuModel`/`useNewSessionProjectSelection` 归属写入。
- 做（本任务）：
  - **侧栏过滤**（`useProjectsPanelModel.ts`）：新增 `visibleUserProjects` 独立 useMemo（`userProjects` 按 `spaceOf` 收窄到选中空间），`filteredProjects` 改基于它再做本地 type 过滤；批量项目只在主空间（`visibleSpaceBatchProjects`，`noOtherProjects` 同步）；`defaultSessions` 投影后按归属过滤，所有 kind 统一用 `session.path`（删上游 team 键分支——ADR-0156 无 team 归属）；`projectSidebarSessions` 不额外过滤。非主空间 claw 钳制：`storedFilter` 为 claw 且非主空间时 `defaultConversationFilter` 钳为 `"conversation"`。
  - **clearConversation 空间语义**（同文件）：移植上游新版——发起时按归属过滤计数；onConfirm 再读 spaces 过滤；`window.vetta.session.listRunning()` 有运行中会话则静默 return；主空间且全局无归属记录时走 `clearDefaultConversation("conversation")`，否则逐条 `session.delete`；导航条件含主空间 cwd 判定。viewer 打开分支在 navigate 前 `rememberSpaceLocation`。
  - **移动菜单**：新建 `useMoveSpaceMenu.ts`（照抄上游逻辑）；`ProjectContextMenu` 接线（非默认且非批量项目，theme-ui `ProjectContextMenuView` 新增 `extraItems` prop，插入位置 open-in-folder 之后）；`SessionContextMenu` 接线（`independent` 时 `{kind:"conversation", key: session.path}`，删上游 team 键分支），move 追加进 `model.extraItems` 末尾。`independent` 传递链：`project-atoms` 类型加必选字段、`useDefaultSessionListModel` 传 `!isClaw`、`useProjectGroupModel` 传 `false`（项目会话随项目走）、`ProjectsPanelMenus` 透传。
  - **归属写入**：`useProjects.createProject`/`openProjectPath`/`openProject` 按上游写归属——openProjectPath 第二参改选项对象 `{ name?, spaceId? }`（本地 `name` 分叉与上游 `spaceId` 合并），已存在（含归档）项目 reopen 时 `selectSpace` 跳回既有归属空间、新登记才 `assignSpace`；用 `entry.path`（IPC 解析后路径）。`useAddProjectMenuModel.handleImport` 正式导入成功路径加 `assignSpace`。`useNewSessionProjectSelection`：projects 按空间过滤（isDefault 豁免）、scope key 改 `${spaces.selected}:${routeCwd}`、takenNames 用未过滤 allProjects；**保留 BUG-0037 档位随迁分叉**。
  - **过滤器钳制**：`useDefaultConversationFilterSelectModel` 非主空间隐藏 claw 选项+值钳制（照抄上游）；`useSidebarFilterSelectModel`（本地分叉维度）非主空间同样隐藏 batch 选项、`storedFilter=batch` 时钳回 `"all"`（决策点：批量项目只显示在主空间，维度语义一致，上游无参照）。
  - i18n：project.json zh/en 补 `spaces.move`；zh/en 键集一致。
- 不做：破坏性移除档与全局搜索空间标注（TASK-0526）；皮肤统一（未立项）；team 归属维度（ADR-0156 明确删除）；`useFlatSidebarConversations`/平铺视图（本地无此功能，不属于对齐范围）；上游 `useNewSessionSend` 的 startGoal（本地分叉保留）。
- 保留本地分叉不动：BUG-0191 删除编排（menus 层不抄上游 forgetConversations）、filter prop 的 type 过滤维度、BUG-0195 dataFileMissing、导航清理逻辑、SpaceSwitcher 占满底栏。
- Given / When / Then：
  - 切到自定义空间 → 侧栏只显示该空间归属的项目与会话；批量项目组消失；默认区会话按归属过滤。
  - 项目右键「移动到工作空间」→ 子菜单列出主空间+全部空间，当前归属勾选；选目标后项目移到对应空间（且若正打开，位置记忆跟随）；「新工作空间」打开编辑器（move 预填）。
  - 默认区独立会话右键有移动入口（claw 档没有）；项目内会话右键没有移动入口。
  - 当前空间新建项目/打开目录/导入项目/远程登记 → 新项目归属当前空间；reopen 已存在项目 → 跳回其既有归属空间。
  - 非主空间下过滤器不显示 claw/batch 选项；原本停在 claw/batch 档时自动回落。
  - 清空会话在自定义空间只删该空间归属会话；主空间且无任何归属记录时清空全量。
- 验证：panel 编排测试扩展（过滤/钳制/clearConversation 空间语义）；`useMoveSpaceMenu` 接线测试（菜单节点结构、移动分发、新工作空间分发）；`useSidebarFilterSelectModel` 钳制测试；`useProjects.projectWrites` 归属测试；`useNewSessionProjectSelection` 过滤测试；`bun run test:impact`；`bun run check`；`check-test-assertion-depth.mjs`（新测试用捕获值断言，不用 `toHaveBeenCalled*`）。
- 人工验收：切空间后侧栏过滤、右键移动项目/会话、新工作空间、新建/打开/导入归属、清空会话空间语义、过滤器钳制。

## 交付

- 实施（2026-11-27）：
  - 侧栏过滤：新增 `visibleUserProjects`（项目按 `spaceOf` 收窄）/`effectiveFilter`/`visibleSpaceBatchProjects`（批量组只在主空间，非主空间 batch 档回落「全部」）；`defaultSessions` 统一按会话路径归属过滤（无 team 键分支）；非主空间 storedFilter=claw 时 `defaultConversationFilter` 钳为 `"conversation"`。
  - `clearConversation` 空间语义：发起时按归属过滤计数、onConfirm 再读 spaces 重过滤、`listRunning` 有运行中会话整体取消；主空间且无归属记录走 `clearDefaultConversation("conversation")`，否则逐条 `session.delete`；viewer 打开分支 navigate 前 `rememberSpaceLocation`。
  - 移动菜单全链：新建 `useMoveSpaceMenu.ts`（上游原样照抄）；`SessionContextMenu`/`ProjectContextMenu` 接线；theme-ui `ProjectContextMenuView` 新增 `extraItems` prop（插入 open-in-folder 之后）；`independent` 传递链补齐（project-atoms 必选字段、`!isClaw`/项目内 `false`、Menus 透传）。
  - 归属写入：`openProjectPath` 第二参改选项对象 `{name?, spaceId?}`（合并本地 name 分叉与上游 spaceId）；reopen 已存在（含归档，`projects + archivedProjects` 合并判定）项目 `selectSpace` 跳回既有归属、新登记才 `assignSpace`；用 IPC 解析后 `entry.path`；`handleImport` 归属写入放在 `.ofar` 早退之后；`useNewSessionProjectSelection` 空间过滤 + scope key 含空间 + takenNames 用全量项目（BUG-0037 档位随迁保留）。
  - 过滤器钳制：`useSidebarFilterSelectModel` 非主空间隐藏 batch/claw 选项、值回落但不改写存储。
  - i18n：project.json zh/en 补 `spaces.move`；release fragment `workspace-grouping-sidebar-filter-move.md` 已汇编进 v0.1.5。
- verifier_0525 复查发现并修复的问题：
  - P1 门控缺陷：`SessionContextMenu` 原用 `!("kind" in session)` 判 team，但默认区/项目组会话经 `sidebar-conversation-projection` 后普通会话也带 `kind: "conversation"`，门控在生产形状下恒 false、移动入口整批不可达。已改为按 `kind !== "agent-team"` 判别；wiring 测试 fixture 改成投影形状钉住回归。
  - P3 覆盖缺口：orchestration 主空间用例原本没 seed `batchProjectsAtom`（批量组断言形同虚设），已真实 seed 并断言；projectWrites 补「reopen 仅在归档列表」用例。
- 验证（实际执行）：
  - 定向：spacesFilter.orchestration 9/9、useMoveSpaceMenu 6/6、两个 wiring 各 3/3、useSidebarFilterSelectModel.space 4/4、projectWrites 9/9、projSel 12/12、useAddProjectMenuModel、sidebar-conversation-selection 全部通过。
  - `test:impact`（13 个改动文件影响面）desktop 282 文件 1481/1481 通过、theme-ui 41 文件 282/282 通过，零失败；门控修复后增量重跑修复文件影响面同样通过。
  - `bun run check` 全绿；`check-test-assertion-depth.mjs` ok（新测试用 mock.calls 捕获值断言）。
  - verifier_0525 静态复查 partial/fail → P1/P2 已修复并重跑定向测试通过，P3 缺口已补齐；复查已核通过项：clearConversation 空间语义、过滤与钳制、菜单接线、independent 传递链、归属写入、档位随迁。
- 未执行：Desktop 实机验证（无授权）；破坏性移除档与全局搜索空间标注（按合同属 TASK-0526）。
