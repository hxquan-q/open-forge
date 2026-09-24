---
id: TASK-0024
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer, apps/desktop/DESIGN.md]
write_paths: [apps/desktop/src/renderer, apps/desktop/src/preload, apps/desktop/src/main]
exclusive_paths: [apps/desktop/src/renderer/root-layout]
depends_on: [TASK-0023]
conflicts_with: [TASK-0018, TASK-0019]
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 双模式 IA 骨架落地（Shell / Mode Switcher / 面板容器）

## 目标

按 TASK-0023 定稿实现 IA §1 总体骨架：Mode Switcher、work/coding 双布局
容器、面板路由与挂载点、空/错/取消态框架。本任务只负责「面住在哪、长什么
样子、怎么切」；面板的数据接线仍归 TASK-0015~0019 各阶段任务。

## 范围

### 并发评估

- 结论：不支持并发（root-layout 与面板注册表是独占路径，0018/0019 的 UI
  落点都依赖本任务定下的容器与路由）
- 并发方式：共享工作区串行
- 前置依赖：TASK-0023（设计定稿）；Profile/AgentMode 绑定由后续任务独立负责
- 冲突文件或独占路径：`renderer/root-layout`、设置/路由注册表、
  Activity Panel 容器；与 0018/0019 的面板挂载点存在装配冲突，需按
  coordinator 顺序集成
- 集成顺序：0023 → 0024 → 0017 的 Profile 绑定 → 0018/0019/0028 的面板填充
- 集成负责人：coordinator

### 做

1. Shell 中的项目级 `WorkspaceMode` Switcher（work ↔ coding），按 TASK-0023 的 project cwd 规则持久化；它只切布局，不改写当前 Session 的 `agentMode`、Prompt 或 Tool permissions；
2. work / coding 两套布局容器（左中右栏骨架、面板插槽、可折叠规则）；
3. 面板注册与路由：Activity Panel 的 Task/Approval/Artifact 面板插槽就位，
   数据为空时渲染定稿的空态；
4. 模式相关的设置入口与深链（如 `/settings` 内 mode 相关项）适配；
5. 全部按 IA §7 IPC 分层与 §8 UI 不变量实现；全部文案 i18n；
6. 快捷键（若有模式切换快捷键）进入可配置 keybinding。

### 不做

- 不接 Task/Artifact/Approval 的真实数据源（属 TASK-0015/0016）；
- 不实现 work 四个入口的业务面板内容（属 TASK-0017/0018）；
- 不实现 coding 面板内容（属 TASK-0019）；
- 不改 DESIGN.md 规范、不引入新视觉语言。

## Given / When / Then

- Given：用户在 Desktop 中打开任意项目；
- When：在 work 与 coding 模式间切换；
- Then：布局按定稿切换、面板插槽就位（空态可见）、进行中的会话不被重置、
  重启后模式选择保持。

## 必须保持

- Renderer 不持有 Task/Approval 最终状态；面板只消费 projection；
- 关闭/切换面板不取消任何执行中对象；
- 现有 coding 主界面能力不回退（文件树、聊天、审批、Git 面板全部可达）；
- `WorkspaceMode` 只改变项目布局，不重建现有 Session 或改写该 Session 的 `agentMode`、Agent Profile 与 Tool Policy；
- 1px 线条、无阴影卡片、token 颜色、`<Button>` variant 纪律。

## 测试与验证

- 定向：模式切换状态/持久化单元测试；布局容器与空态组件测试；
  路由/深链组件测试；
- 用户流程：开项目 → 切模式 → 面板插槽与空态正确 → 重启保持；
- 质量检查：`bun run check:quick`、desktop 组件测试、desktop tsc；
- 设计检测：改动完成后跑一次 impeccable `detect`（MANUAL_DETECTOR_REQUIRED）。

## 交付记录

- 实际修改：
  - `shared/store/workspace-mode-atoms.ts`：WorkspaceMode 类型 + cwd→mode 持久化 atom（localStorage `vetta-workspace-mode`，默认模式不落盘）；
  - `domains/workspace-mode/`：Mode Switcher（SegmentedControl，cwd 缺失时不渲染）、WorkWorkspacePanel（`WorkPanelSection` 组合式插槽：plan/sources/artifacts/review 四节默认出骨架，dataset 预留 id；每节带 solar 图标空态与 error/retry/cancelled 占位态）、`isWorkspaceModePath` 路由门控、`useWorkspaceMode`（path param > search > activeSession 的 cwd 解析，`decodeURIComponent` 失败回退原值）；
  - `usePageHeaderModel.ts`：工作区路由（`/`、`/new-session*`、`/project/*`）的 leftSlot 末尾追加切换器；插件接管页头时不追加；
  - `DefaultChatView` 新增 `workspaceMode` prop：work 且无显式 activity 配置时右栏默认 WorkWorkspacePanel，但 `activityPanelOpenAtom` 打开（文件预览、浏览器、插件 tab）时仍渲染 `CurrentScenarioActivityPanel`——work 面板是右栏默认内容而非预览能力的替代；`ChatView` 传入当前 cwd 的模式；
  - `WorkWorkspacePanel` 窄屏（<640px，与侧边栏悬浮阈值同源）隐藏，不挤压聊天列；
  - `theme-ui SegmentedControl` 补 `aria-pressed`（选中态不再只靠颜色）；
  - i18n：`chat:workspace.*` zh/en；
- 实际运行：5 个测试文件 28 用例全绿（atoms 持久化/路由门控/切换器 aria-pressed 交互/work 面板空态+error/retry/cancelled/DefaultChatView 模式切换与活动面板让位）；desktop `tsc --noEmit` 干净；biome 干净；impeccable `detect` 零发现；
- 未运行及原因：`verify:ui:*` 需用户明确要求未跑；work 面板宽度拖曳未做（骨架固定 340px，0017 接入时再议）；「settings 内 mode 设置项」不存在故无需适配深链；
- 剩余风险：Team 会话等带显式 activity 的宿主不受模式影响（刻意）；模式与 Runtime Profile 的绑定属 TASK-0017；work 面板窄屏无底部抽屉兜底（coding 活动面板有），骨架阶段直接隐藏属定稿取舍。
