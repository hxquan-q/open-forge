---
id: BUG-0191
type: bug
status: investigating
priority: P1
owner: desktop
requirement: []
plan: []
source: user-request / workspace OBS-SESSION-DELETE-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0489, TASK-0226]
related_issues: []
related_bugs: [BUG-0114, BUG-0087]
created: 2026-11-17
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# 普通会话删除失败无反馈且副作用先于删除结果

## 用户流程与实际行为

- Given 用户在左侧"对话"列表对普通会话（含批量任务分支）选择"删除"并确认，When 主进程 `session.delete` 拒绝，Then 当前 `void deleteSession(...)` 无catch：无Toast、无日志、留下unhandled rejection；且导航/清活动会话已先行执行，用户被带离目标。
- 确认入口在删除结果确定前还fire-and-forget清除置顶/归档标记（`useProjectsPanelMenusModel`）：主删除失败后这些标记已经丢失。
- 删除成功后的关联清理（scheduler记录等）失败时，会话行已不可见但部分关联信息残留，反馈无法区分"未删除"与"已删除但清理失败"。

## 期望行为

- 主删除失败：一条错误Toast+日志，保留列表/标记/活动会话/路由，用户可再次从菜单重试；不自动重试。
- 元数据清理与导航只发生在主删除成功之后；删除成功但关联清理失败时仍摘行/导航，并明确提示"会话已删除，部分关联信息未清理"，不回滚不假成功。
- 等待删除期间用户切到其他会话时，旧闭包不得清掉新活动会话或把用户拉回。

## 环境与失败证据

- 基线 `b531220514be862c9af35e5eeffcba7ad902124c`（chenxvhua候选链），Windows/manifest0.1.4。
- 静态证据：`useProjectsPanelModel.ts:284-304`普通/批量分支void后导航；`useProjectsPanelMenusModel.ts:52-56`先清标记；`useProjects.ts:406-432`session.delete拒绝即中断后续清理；`useConfirmDialogModel.ts:23-25`确认框不承接Promise。Team分支`269-281`已有catch+Toast（BUG-0114修复），普通分支无。
- 台账OBS-SESSION-DELETE-001记录的用户实机基础删除成功流程（重启dev后）不受本条影响；本条只处理失败出口与顺序。

## 影响

P1反馈与状态一致性缺陷：删除失败零反馈且标记丢失、被导航带走；清理失败被误报或无提示。不涉及主进程删除能力本身（Team底层BUG-0087已另行修复）、不涉及项目硬删除EBUSY（另题）。

## 修复与验证范围

TASK-0489先红后绿：组件/组合Hook层真实菜单+panel+useProjects装配，仅IPC外部边界fake。覆盖主删除拒绝、延迟成功、非活动目标、等待期切换会话、失败后重试、清理失败部分完成、批量分支、Team保护、取消确认。动态红灯待执行，不冒充已测；实际结果由TASK-0489补记。

## 复核记录（2026-11-18）

复核动机：确认既有「会话删除」修复是否已兼带覆盖本条。结论：**未覆盖**，本条在 `chenxvhua @ 3bf801063` 仍成立，证据与登记时一致。

- 普通分支 `useProjectsPanelModel.ts:303-304`：`void deleteSession(...)` 后立即 `goToProjectDetail`，无 catch/Toast，导航先行。
- 批量分支 `:298-299`：`void deleteBatchTask(...)` 同样无 catch 且先导航。
- `useProjectsPanelMenusModel.ts:54-56`：确认即清 `conversationTags` 与 `archivedSessions` 标记，早于删除结果。
- `useProjects.ts:406-433`：`session.delete` 拒绝直接抛出，后续清理与摘行不执行，`void` 调用无人承接 → unhandled rejection。
- 既有修复边界：`a263429c1`（BUG-0114）仅给 `agent-team` 分支加 catch+Toast，测试只构造团队会话；`4fb65a823`（BUG-0087 / TASK-0226）仅改主进程团队删除服务。普通/批量分支零改动。
- 复用条件：失败文案 `sidebar.dialogs.deleteSessionFailedToast` 已存在（zh/en），修复时无需新增 key。
- 状态不变（`investigating`）：合同与派发均落在 TASK-0489（`ready`，两次派发被宿主中断、零源码改动），实现尚未开始。
