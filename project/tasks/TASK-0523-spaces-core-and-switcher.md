---
id: TASK-0523
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 4f2fbd5ff
read_paths: []
write_paths:
  - apps/desktop/src/renderer/shared/store/spaces.ts
  - apps/desktop/src/renderer/shared/store/spaces.test.ts
  - apps/desktop/src/renderer/shared/store/session-input-draft-logic.ts
  - apps/desktop/src/renderer/domains/project/lib/space-activity.ts
  - apps/desktop/src/renderer/domains/project/lib/space-activity.test.ts
  - apps/desktop/src/renderer/domains/project/store/space-activity-atom.ts
  - apps/desktop/src/renderer/domains/project/hooks/useSpaceNavigation.ts
  - apps/desktop/src/renderer/domains/project/hooks/useSpaceNavigation.test.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/SpaceSwitcher.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/SpaceSwitcher.test.tsx
  - apps/desktop/src/renderer/domains/project/components/sidebar/SidebarBottomBar.tsx
  - apps/desktop/src/renderer/domains/project/components/SpaceEditorDialog.tsx
  - apps/desktop/src/renderer/domains/project/components/SpaceEditorDialog.test.tsx
  - apps/desktop/src/renderer/domains/conversation/components/new-session/useNewSessionPageModel.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts
  - apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts
  - apps/desktop/src/shared/shortcuts.ts
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - apps/desktop/src/shared/i18n/locales/zh/settings.json
  - apps/desktop/src/shared/i18n/locales/en/settings.json
  - packages/theme-ui/src/sidebar/WaitingPulseBadge.tsx
  - packages/theme-ui/src/sidebar/index.ts
  - packages/theme-ui/src/shared/platform.ts
  - packages/theme-ui/src/settings/SpaceEditorDialogView.tsx
  - packages/theme-ui/src/settings/index.ts
  - .github/release-notes/fragments/v0.1.5/
  - docs/adr/0156-desktop-sidebar-workspace-grouping.md
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 工作空间分组切片①：空间状态核心 + 归因 + 底栏切换器 + 快捷键

## 合同

- 来源与目标：PLAN-0032 P9 工作空间分组第一切片；决策见 [ADR-0156](../../docs/adr/0156-desktop-sidebar-workspace-grouping.md)（本任务首个原子提交一并入库）。上游参照：`upstream/dev` `d6f9906c4`（`shared/store/spaces.ts`、`domains/project/hooks/useSpaceNavigation.ts`、`domains/project/components/sidebar/SpaceSwitcher.tsx`、`domains/project/components/SpaceEditorDialog.tsx`、`domains/project/lib/space-activity.ts`、`domains/project/store/space-activity-atom.ts`、`shared/shortcuts.ts` 的 `SPACE_SHORTCUT_ACTIONS`）。
- 做（本切片）：
  - 移植上游 `spaces.ts` 存储核心（`atomWithStorage` `vetta.desktop-spaces.v1`、readSpaces 校验收窄、assignSpace/selectSpace/reorderSpace/forgetSpace、spaceEditorAtom），**删除 team 归属分支**（ADR-0156 决策 2：`SpaceLocation` 只留 project/conversation）。
  - 移植 `useSpaceNavigation`：切换空间恢复「最近打开」、`rememberSpaceLocation` 归因记录、`moveSpaceItem` 归属迁移（move 函数本切片无 UI 消费方，但属核心语义且编辑对话框使用，一并移植并测试）；删除 team 导航分支；import 路径适配本地 project-atoms/chat-atoms 拆分。
  - 移植 `space-activity` 归因纯函数 + atom：删除 team placement 归因（本地团队会话属 Allstar 版块，不入空间计数）。
  - `SpaceSwitcher` 底栏按钮组：ResizeObserver 槽位、拖拽排序、「更多」弹层（**本切片不设「工作空间设置」入口**——设置页属切片②，弹层底部只留「新建」）、新建按钮经 `spaceEditorAtom` 打开编辑对话框；挂载进 `SidebarBottomBar` 左侧。
  - `SpaceEditorDialog` 新建/编辑空间（名称 + solar 图标选择）：移植 theme-ui `SpaceEditorDialogView` 原语，根布局挂载。
  - theme-ui 缺失原语补齐：`WaitingPulseBadge`（琥珀色等待角标）、`shared/platform.ts` `chromeButtonGroupVariant`（Windows ghost / 其余 glass）。
  - `Ctrl+1..9` 进可配置 keybinding（硬边界）：`SPACE_SHORTCUT_ACTIONS` 并入 `SHORTCUT_ACTIONS`、settings.json 增 `shortcutSpace{1..9}Label`/`shortcutSpaceDesc` 键、root layout handler 按顺序解析（index 0 = 主空间，其余按自定义空间顺序）。
  - `session-input-draft` 键加空间维度：非主空间新会话草稿键 `new-space:<id>:<cwd>`，useNewSessionPageModel/useSessionOpener 生产消费对齐；草稿本就仅内存，无持久化迁移。
  - i18n：project.json `spaces.*` 键（zh/en 键集一致），只含本切片消费键 + icons 全集；settings.json 快捷键键。
- 不做（后续切片）：侧栏过滤、右键「移动到工作空间」菜单、设置页工作空间标签页、移除流程与主进程删除模式、全局搜索空间标注（切片②③）；team 归属维度（ADR D5 已否决）；上游 `space-activity` 的团队会话 placement 归因。
- 归隐说明：切片①完成后用户可创建/切换空间、空间记住各自最近打开项、草稿分空间隔离、活动角标可见；但侧栏内容尚未按空间过滤（切片②），项目/会话也没有移动入口——手动验证仅依赖 Ctrl+数字与切换器。
- Given / When / Then：
  - 新建空间「设计」→ 底栏出现图标且自动切入 → 右侧落新会话页（该空间无最近打开项）。
  - 在主空间打开项目 A → 切到「设计」再切回主空间 → 回到项目 A；「设计」记住自己最后打开的内容。
  - 在「设计」新会话页输入草稿未发送 → 切回主空间再切回 → 草稿仍在；两个空间同 cwd 的新会话草稿互不相串。
  - 会话在跑/等用户时 → 所属空间图标出现运行点/等待角标；收纳进「更多」的空间有活动时「更多」按钮点灯。
  - 按 Ctrl+2 → 切到侧栏顺序第 2 个工作空间；设置 → 快捷键里可见并可改绑。
  - localStorage `vetta.desktop-spaces.v1` 被写入脏数据（未知空间 id、非法图标）→ 启动后回落合法状态，不崩溃。
- 验证：spaces 纯函数测试（readSpaces 收窄、assign/select/reorder/forget、emoji 图标校验）+ space-activity 归因测试 + useSpaceNavigation 测试（参照上游适配）+ SpaceSwitcher/SpaceEditorDialog 组件测试（参照上游适配）；`bun run test:impact`；`bun run check`。
- 人工验收：创建/切换空间、切换恢复最近打开项、Ctrl+数字切换、草稿分空间隔离、活动角标、脏数据自愈。

## 交付

### 工程验证（2026-11-26，base 4f2fbd5ff）

- `bun run check` 全绿：lint（5368 文件）、types（root/cli/desktop/mobile/docs）、guards（package-boundaries、conflict-markers、autonomy、release-notes 一致性等）全部通过。
- 定向测试 31/31：spaces（14）+ space-activity + useSpaceNavigation（3）+ SpaceEditorDialog（2）+ SpaceSwitcher（7）等五个文件全绿；插件快捷键目录测试更新后 1/1。
- `bun run test:impact`（因 ui 包无直接测试入口按政策回退 desktop 全量）：6773 通过 / 14 失败 / 18 跳过。14 个失败逐案核对均与本切片无关、属 HEAD 既有问题：
  - `DetailDrawer.test.tsx` 套件级崩溃：`@vetta-org/ui` mock 缺 `cn`，经 overlays barrel → CommandMenuView → VettaKbd 模块级 `cn` 调用；链上全部文件（overlays/、VettaKbd、kbd-keys、ui/utils、button-group 消费方）均不在本 diff 且与 HEAD 逐字节一致，HEAD 上确定性复现。
  - 六个 `src/main/**` 远程测试（file/media-protocol、filesystem-remote-flow、command-spawner/remote-command-runner、skill-presentation-read）：SSH loopback `SshRemoteCommandError exit 2`、404 等环境性失败；该层不 import 任何本次改动文件（renderer 侧全部改动），本机环境复现与改动无关。
  - `useSessionManager.session-switch` 一例在全量并行负载下超时抖动，单独运行通过。
- verifier 独立复查（15 项合同逐条，含上游 `git show upstream/dev` 对照）：全部通过、未发现缺陷；测试断言深度门禁 `check-test-assertion-depth` 退出码 0。
- 修复过程中的 lint 修正：`useNewSessionPageModel` effect 依赖数组去掉已被 draftKey 吸收的 decodedCwd；4 个文件 biome 格式化；2 个文件 organizeImports。

### 用户验收包（verifying，待人工）

- 入口：侧栏底栏左侧新增工作空间图标组（主空间 + 自建空间 + 「更多」收纳 + 「新建」）。
- 可验证行为：新建空间自动切入并落新会话页；切换空间恢复各自最近打开的项目/会话；Ctrl+1..9 快速切换（设置 → 快捷键可见可改绑）；新会话草稿按空间隔离（同 cwd 不同空间互不串）；会话运行/等待输入时空间图标亮圆点/琥珀角标，收进「更多」的空间有活动时「更多」按钮点灯；localStorage 脏数据启动自愈。
- 已知边界（合同内不做项）：侧栏内容尚未按空间过滤（切片②）；项目/会话无「移动到空间」入口（切片②）；无设置页工作空间标签页与移除流程（切片②③）；底栏 SpaceSwitcher 占满左侧宽度、Settings 菜单收缩显示昵称——与上游 iconOnly 形态不同，系本地保留分叉。

### 记录

- 发布片段：`.github/release-notes/fragments/v0.1.5/workspace-grouping-switcher.md` 已装配进 v0.1.5.md「新增」。
- ADR-0156 随本任务原子提交一并入库。
- 未运行项：`verify:ui:*` 实机验证（需用户授权）；人工验收待用户操作。
