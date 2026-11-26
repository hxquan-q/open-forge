---
id: TASK-0527
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0510]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ad8e99c0c
read_paths: []
write_paths:
  - packages/plugins/plugin-sdk/src/ui.ts
  - packages/plugins/plugin-sdk/src/index.ts
  - packages/plugins/plugin-sdk/CHANGELOG.md
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-ui-context.ts
  - apps/desktop/src/renderer/domains/plugins/components/PluginGlobalSlotHost.tsx
  - apps/desktop/src/renderer/shared/store/plugin-atoms.ts
  - apps/desktop/src/renderer/domains/activity-panel/registry/
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useActivityPanelModel.ts
  - apps/desktop/src/renderer/domains/activity-panel/components/ActivityPanel.plugin-tabs.test.tsx
  - docs/plugin/ui-slots.md
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: [TASK-0510]
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 活动面板插件 useMeta 按工作空间声明可用性与固定上栏

## 合同

- 来源与目标：PLAN-0032 P9 工作空间主线收尾——上游 `62b2749f8` 与本地 `6c9e717ea`（MetaHost 按 definition.id 键控 fold 层）的合并设计。本地 MetaHost/useMeta 管道早已存在且与上游同构，本次补的是插件侧 `useMeta({ cwd })` 与 `pinned` 语义；`plugin-api-version.ts` 注释已预告「活动面板插件 `useMeta` 由 PLAN-0032 P9 登记」。
- 做（本任务）：
  - **SDK**（`packages/plugins/plugin-sdk/src/ui.ts`）：移植上游 `PluginActivityTabScope`/`PluginActivityTabMeta`/`PluginActivityTabMetaResult` 类型与 `PluginActivityTabContribution.useMeta` 字段（含 hook 约束注释）；`index.ts` 导出三类型；CHANGELOG 按上游条目改写，版本号改本地口径 `^2.15.0`。
  - **版本登记**：`plugin-api-version.ts` 升 2.15.0——活动面板标签卡自报这一帧的 meta（`registerActivityTab` 的 `useMeta`，含按工作空间固定上栏），注明对应上游 `62b2749f8`。
  - **宿主注册链**：`plugin-ui-context.ts` 校验 `useMeta` 必须是函数并透传（上游同位置）；`plugin-atoms.ts` `RegisteredActivityTab` 补 `useMeta` 字段。
  - **解析链**：`registry/types.ts` `ActivityTabMeta` 补 `pinned?`；`useActivityTabDefinitions.tsx` 移植上游 `usePluginTabMeta`——`useMeta` 经面板 cwd（`useActivityPanelCwd`）解析，dynamic 覆盖 label/icon/badge 并透传 pinned，返回 null 即本帧不参与候选；`resolve-activity-tabs.ts` 两处——`toResolved` 中 `meta.pinned === true` 时 `removable` 恒 false，主循环中 `item.removable === false` 的条目直接上栏不走可见性记录。
  - **面板模型**：`useActivityPanelModel.ts` 按上游把 `definitionById` 换成 `removableById`（来源 `resolved.candidates`），`onRemoveTab` 只查 `removableById`；删除 `NON_HIDEABLE_TABS`（本地 file/knowledge-history 定义早已声明 `removable: false`，守卫冗余）。
  - **文档**：`docs/plugin/ui-slots.md` 补 useMeta/pinned 小节（对照上游 diff 改写，版本号本地口径）；release fragment 一份。
  - 测试：移植上游 `resolve-activity-tabs` 两例（pinned 忽略减号记录、非 pinned 可 detach）；`useActivityTabDefinitions.test.ts` → `.tsx` 重写（上游三例：retention 保留、useMeta 拿到面板 cwd、返回 null 不参与候选），适配本地 `createActivityWorkspace` 签名（含 runtimeLabels 第三参可选）；`ActivityPanel.plugin-tabs.test.tsx` 移植三例（pinned 忽略 detach 记录上栏、useMeta null 隐藏、project 场景插件 tab 在 project 场景出现），适配本地测试骨架。
- 不做：Git 等插件侧改用 useMeta（上游 `d753d869f` 另立 Task）；底部面板 useMeta（上游明确没有——bottom-panel 多实例语义不同）；`setActivityTabVisible` 既有路径不动（与 useMeta 并存，上游同口径）。
- 保留本地分叉：`6c9e717ea` MetaHost 键控 fold 与热追踪；`hardIsolation`/`scope_use`/`pluginScenario` 过滤链；团队会话 runtimeLabels。
- 本地先行修复（偏离上游，已复查确认）：上游 `62b2749f8` 自身遗漏——`PluginGlobalSlotHost` 发布 `pluginActivityTabsAtom` 时逐字段重建对象但未透传 `useMeta`，导致 pinned/按工作空间可用性在生产链路完全不生效（上游 HEAD 同缺陷，现有测试全部直接播种 atom 故测不出）。本任务在发布层补一行 `useMeta: tab.useMeta` 透传，否则后续 Git 面板 `useGitTabMeta`（上游 `d753d869f`）端到端不可用。
- Given / When / Then：
  - 插件声明 `useMeta` 返回 `{ pinned: true }` → 该 tab 恒在栏上、无减号入口，用户早先的 detach 记录（`-plugin:tab`）不再生效。
  - `useMeta` 返回 null → 本帧既不上栏也不进「+」可添加池。
  - `useMeta` 收到的 `cwd` 与面板工作空间 cwd 一致（项目详情页是项目根，不是会话或全局状态）。
  - 未声明 `useMeta` 的插件行为与现状完全一致（静态 label/icon、按上栏记录显隐）。
- 验证：`resolve-activity-tabs` 定向、`useActivityTabDefinitions` 定向、`ActivityPanel.plugin-tabs` 定向；`bun run test:impact --` 改动源文件；`bun run check`（含插件协议合同测试与断言深度基线）；plugin-sdk 包自身测试。
- 人工验收：实机挂一个声明 `useMeta` 的插件（或后续 Git 面板任务）观察固定上栏与不可移除；本任务交付时插件侧尚未有消费者，人工验收可并入后续 Task。

## 交付

- 实际修改：按合同全部落地——SDK `PluginActivityTabScope/Meta/MetaResult` 与 `useMeta` 字段（api 2.15.0）、`plugin-ui-context`/`plugin-atoms`/`PluginGlobalSlotHost` 发布链透传（含本地先行修复）、`useActivityTabDefinitions`/`resolve-activity-tabs`/`useActivityPanelModel` 消费链（pinned 恒上栏不可移除、`NON_HIDEABLE_TABS` 删除）、`docs/plugin/ui-slots.md` useMeta 小节、release fragment `activity-tab-usemeta-workspace.md`。
- 验证结果：
  - 定向：`resolve-activity-tabs` + `useActivityTabDefinitions` + `ActivityPanel.plugin-tabs` 共 25/25 通过（含一致性头补齐后重跑）。
  - `bun run test:impact`（本任务文件清单）：6842/6874 通过；14 个失败全部为既有 loopback SSH 环境问题（Windows 回环 SSH 路径 `/c/Users/...` 不可达），隔离重跑可复现且涉及域（file-protocol/filesystem/media-protocol/command-spawner/skills 远端路径）与本次改动无交集——`weknoraExport` 一例为大批量并行下超时，隔离重跑 10/10 通过。
  - `bun run check`：lint/types/guards/mobile-lint 全部通过（声明头与 release-notes 一致性修复后复跑确认）。
  - 独立复查（verifier）：partial→发现上游自身 P1（PluginGlobalSlotHost 未透传 useMeta，生产链路功能不通）已在本任务内修复并回归；P3 hooks 顺序边缘场景为上游同构继承风险，知晓不处理。
- 未运行：`verify:ui:*` 与实机 Desktop 验收（需用户授权）；人工验收按合同并入 TASK-0528 的消费者落地后一并进行。
