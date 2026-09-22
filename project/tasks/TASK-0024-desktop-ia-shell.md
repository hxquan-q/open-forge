---
id: TASK-0024
type: task
status: draft
priority: P2
owner: apps-desktop
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
depends_on: [TASK-0017, TASK-0023]
conflicts_with: [TASK-0018, TASK-0019]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

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
- 前置依赖：TASK-0017（Runtime/Profile 侧 mode 存在）、TASK-0023（设计定稿）
- 冲突文件或独占路径：`renderer/root-layout`、设置/路由注册表、
  Activity Panel 容器；与 0018/0019 的面板挂载点存在装配冲突，需按
  coordinator 顺序集成
- 集成顺序：0017 → 0023 → 0024 → 0018/0019 的面板填充
- 集成负责人：coordinator

### 做

1. Shell 顶栏/侧栏中的 Mode Switcher（work ↔ coding），切换持久化到会话
   或项目维度（按 TASK-0023 定稿），切换不丢失进行中的会话；
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
- 1px 线条、无阴影卡片、token 颜色、`<Button>` variant 纪律。

## 测试与验证

- 定向：模式切换状态/持久化单元测试；布局容器与空态组件测试；
  路由/深链组件测试；
- 用户流程：开项目 → 切模式 → 面板插槽与空态正确 → 重启保持；
- 质量检查：`bun run check:quick`、desktop 组件测试、desktop tsc；
- 设计检测：改动完成后跑一次 impeccable `detect`（MANUAL_DETECTOR_REQUIRED）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
