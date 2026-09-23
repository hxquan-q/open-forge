---
id: TASK-0079
type: task
status: in_progress
priority: P1
owner: apps/desktop renderer/conversation + activity-panel
requirement: REQ-0006
plan: PLAN-0006
source: code review 修复批（4 个 finder 独立命中；修复 TASK-0074 canvas 接线在 Team 视图的断裂）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts, apps/desktop/src/renderer/domains/activity-panel/hooks/useCanvasTabModel.ts, apps/desktop/src/renderer/shared/store/canvas-atoms.ts, apps/desktop/src/renderer/domains/conversation/components/blocks/ArtifactCanvasOpenButton.tsx, apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts]
write_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts, apps/desktop/src/renderer/domains/activity-panel/hooks/useCanvasTabModel.ts, apps/desktop/src/renderer/shared/store/canvas-atoms.ts, apps/desktop/src/renderer/domains/conversation/components/blocks/ArtifactCanvasOpenButton.tsx, apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.artifact.test.tsx, apps/desktop/src/renderer/domains/activity-panel/hooks/useCanvasTabModel.test.tsx]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts, apps/desktop/src/renderer/shared/store/canvas-atoms.ts]
depends_on: [TASK-0074]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# canvas 管线统一以 workspace id 为键

## 根因（finder 交叉确认）

`activityPanelTabByProjectAtom` 以 **workspace id** 注册（Team 视图为 `agent-team:<feedKey>`、cwd 为 null——workspace id 口径见 `useTeamChatModel` 的 `session?.workspaceId ?? agent-team 前缀拼 feedKey`），而新 canvas 接线全部按 **session cwd** 读写：

1. **幻影未读**（`useSessionEventController.ts:594`）：未读抑制查 `.get(cwd)` → Team 视图 undefined → Canvas 页签开着仍累加；复位 effect 只在可见性翻转时跑，徽章挂死。
2. **Open-in-Canvas 在团队会话失效**（`ArtifactCanvasOpenButton.tsx:13`）：按钮把 tab 写进 `map[cwd]`，团队面板读 `agent-team:<feedKey>` 键，面板永不切页签；排队的 pendingId 被错配 workspace 的模型消费，`canvas.get` 失败渲染假「文件缺失」条目（标题为原始 artifactId）。
3. **全局单槽竞态与选区劫持**（`canvas-atoms.ts:8`）：`pendingCanvasArtifactIdAtom` 全局单 id，每个挂载的 canvas 模型都 `open(pendingId); setPendingId(null)`；写入无 canvas 可见性守卫——用户正在阅读的选区与划选摘录被每次 artifact 更新清一次。

## 做

1. **统一键**：未读抑制与 Open-in-Canvas 都以当前挂载的 activity workspace id 读写 tab map（渲染侧来源可与 conversation connector 下发口径对齐；Team 场景必须命中 `agent-team:<feedKey>`）。
2. **pending 槽带归属**：`pendingCanvasArtifactIdAtom` 改为 `{ workspaceId, artifactId }`；消费方 workspace 不匹配则忽略，不清全局槽——多面板竞态随之消失。
3. **可见性守卫**：canvas 可见时不排 pending（依赖既有 revision 刷新列表），不可见时才排；未读复位 effect 依赖补计数变化（增量发生且可见时立即归零）。

## Given / When / Then

- Given Team 聊天且 Canvas 页签已打开，When 成员产出 artifact，Then 不涨幻影未读、不劫持选区、列表刷新。
- Given 团队会话里点击「在画布中打开」，Then 团队面板切到 Canvas 页签并打开正确 artifact。
- Given 两个已挂载面板（聊天视图 + 另一项目详情），When 任一 workspace 产出 artifact，Then 只有归属 workspace 的模型消费 pending，另一面板无假 missing 条目。

## 测试与验证

- `useSessionEventController.artifact.test.tsx`（新增 hook 测试，参照同目录 compaction/memory-bounds 测试的装配方式）与 `useCanvasTabModel.test.tsx`；AGENTS.md §9 要求事件→atom 接线必须有 hook 测试。
- 命令：`cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run <file>`；tsc 定向。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】团队会话的画布页签不再出现幻影未读与打不开的占位条目，「在画布中打开」在团队聊天里生效。
