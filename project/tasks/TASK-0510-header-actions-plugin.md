---
id: TASK-0510
type: task
status: verifying
priority: P2
owner: apps/desktop + packages/theme-ui + packages/plugin-sdk
requirement: REQ-0008
plan: PLAN-0032
source: upstream 7e0a8b130 + b669f73ae + 234885a88 + 8efa385a8 + ffe0d5e90 + 25c43ece2（参照重写，PLAN-0032 P7）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0510-header-actions-plugin
worktree: unassigned（已集成，待推送后清理）
base_commit: 16bc1ccd6ca0beb2043d73ec51a729919dfe5706
read_paths:
  - apps/desktop/src/renderer/domains/conversation/components/chat-view/ChatHeaderActionsView.tsx
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - apps/desktop/src/main/plugins/
  - packages/plugins/plugin-sdk/
  - packages/theme-ui/src/
write_paths:
  - apps/desktop/src/renderer/domains/abilities/lib/plugin-permission-labels.ts
  - apps/desktop/src/renderer/domains/conversation/components/NewSessionPage.tsx
  - apps/desktop/src/renderer/domains/conversation/components/new-session/NewSessionHeaderActions.tsx
  - apps/desktop/src/renderer/domains/conversation/components/agent-controls.test.tsx
  - apps/desktop/src/renderer/domains/plugins/components/PluginGlobalSlotHost.tsx
  - apps/desktop/src/renderer/domains/plugins/components/plugin-header-action-publication.ts
  - apps/desktop/src/renderer/domains/plugins/components/WorkspaceViewHeaderSlot.tsx
  - apps/desktop/src/renderer/domains/plugins/components/plugin-workspace-view-publication.test.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-header-action.test.tsx
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-local-contributions.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-ui-context.ts
  - apps/desktop/src/renderer/shared/store/plugin-atoms.ts
  - apps/desktop/src/renderer/domains/header-actions/
  - apps/desktop/src/renderer/domains/conversation/components/chat-view/ChatHeaderActionsView.tsx
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - apps/desktop/src/main/plugins/
  - apps/desktop/src/shared/i18n/locales/en/
  - apps/desktop/src/shared/i18n/locales/zh/
  - packages/plugins/plugin-sdk/
  - packages/theme-ui/src/
  - docs/plugin/
  - bun.lock
  - apps/docs-site/content/docs/plugins/extension-points.mdx
  - apps/docs-site/content/docs/plugins/manifest-and-permissions.mdx
  - apps/docs-site/content/docs/en/plugins/extension-points.mdx
  - apps/docs-site/content/docs/en/plugins/manifest-and-permissions.mdx
  - project/tasks/TASK-0510-header-actions-plugin.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/header-actions/
depends_on: [TASK-0505]
conflicts_with: [TASK-0509, TASK-0197]
integration_status: integrated
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 顶栏按钮组（registerHeaderAction + 收纳/拖动排序/更多菜单）（PLAN-0032 P7）

## 目标

参照上游 `7e0a8b130` 重写本地顶栏：

- 新增 `apps/desktop/src/renderer/domains/header-actions/` 与 theme-ui 顶栏视图组件；替换 `ChatHeaderActionsView.tsx` 的固定按钮。
- 插件可在普通会话和新会话页声明 `ui.slot.header-action` 动作（最小集合权限声明，与宿主授权取交集）。
- 扩展字段（`b669f73ae`）、收纳与调整模式（`234885a88` / `8efa385a8` / `ffe0d5e90`）、过窄收进更多菜单（`25c43ece2`）。
- Plugin API 按 D3 拍板**升 2.14.0**，登记新增的 `registerHeaderAction` 能力。`useMeta` 由 PLAN-0032 P9 交付。
- 排序持久化键名用本仓品牌前缀（Open Forge / `forge`），不用上游 `vetta`。

## 范围

### 并发评估

- 结论：条件支持
- 执行方式：parallel（独立 worktree `task/TASK-0510-header-actions-plugin`）
- 可并行 Task：TASK-0506、TASK-0507、TASK-0508
- 前置依赖：D3 已拍板
- 冲突文件/独占路径：`header-actions/` 独占；`plugin-api-version.ts`、i18n 公共文件、theme-ui 与 TASK-0509 共享 → **conflicts_with TASK-0509**，集成顺序由 Coordinator 排
- Branch：`task/TASK-0510-header-actions-plugin`
- Worktree：由 Coordinator 派工时 `bun run worktree:create --task TASK-0510`

### 做

- `header-actions/` 域：注册中心、渲染器、拖拽排序、过窄收进更多菜单。
- theme-ui 顶栏视图：纯渲染组件，使用 `ButtonGroup` + `VettaKbd`。
- 替换 `ChatHeaderActionsView.tsx` 的现有固定按钮（保持现有功能等价：模型切换、分享、设置等）。
- `plugin-api-version.ts` 升 2.14.0，写明对应上游能力集。
- `plugin-sdk` 暴露 `registerHeaderAction` 类型与运行时；`ui.slot.header-action` 权限声明。
- 排序持久化：键名 `forge.headerActions.order`（或本仓品牌前缀的等价形式），不沿用上游 `vetta.*`。
- i18n：所有用户可见文案（含 aria/title）。

### 不做

- 不动 `ChatHeaderActionsView` 之外的会话头部其他区。
- 不改会话协议、Agent 状态机。
- 不重排其他 Plugin API 历史版本号。

## Given / When / Then

- Given：用户打开普通会话
- When：查看会话顶栏 / 拖动动作排序 / 收窄窗口
- Then：动作以统一按钮组呈现；可拖动排序、跨重启保持；过窄时溢出动作进「更多」菜单；插件能通过 SDK 注册新动作

## 必须保持

- 现有固定按钮（模型、分享、设置等）的功能等价。
- 权限最小集合：只声明 `ui.slot.header-action`。
- 排序持久化键品牌前缀正确（非 vetta）。

## 测试与验证

- 定向测试：`header-actions/`、`plugin-sdk/`、`ChatHeaderActionsView` 相关
- 用户流程：拖动排序、重启、收窄窗口、第三方插件注册动作
- 质量检查：`bun run test:impact`、`bun run check`、`plugin-protocol-contract.test.ts` 同步

## 验收分层

- 工程验证：`bun run check` 全绿（含 desktop typecheck / lint / 全部 guards）；`header-actions/` 定向 37/37 通过；`plugin-sdk` / `theme-ui`（含 `header-crowding`、`header-action-narrow`）定向通过；`bun run test:impact` 44 个包通过，`ssh-transport` / `cli-host` / `desktop` 失败已实证为 main 分支预存在的真 shell / SSH 回环 / 远程项目环境失败，与本任务无关（main 分支同样失败）。
- 技术评审：独立评审
- 集成：integrated；Worker 提交 `d05a9d897` + `7590b25c0`（task/TASK-0510-header-actions-plugin），由 Coordinator 于 2026-11-25 合入本地 main。
- 人工功能验收：待验收（用户实机拖动、收窄窗口验证）
- 发布：未授权

## 功能验收包

- 入口：Desktop → 普通会话
- 用例 1：默认动作按钮组排列整齐，键帽正确显示快捷键
- 用例 2：拖动改变顺序，关闭并重开 Desktop 顺序保持
- 用例 3：把窗口拖到很窄，溢出动作出现在「更多」菜单中
- 用例 4：测试插件注册一个新的 header action，能在顶栏出现
