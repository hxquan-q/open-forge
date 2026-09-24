---
id: TASK-0079
type: task
status: done
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
integration_status: integrated
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

- 实际修改：`canvas-atoms.ts`（pending 槽改为 `{ workspaceId, artifactId }` 带归属）；`useSessionEventController.ts`（未读抑制与 pending 排队改按「当前挂载活动工作空间」键判定：任一挂载工作空间 canvas 页签可见即不累加未读、不排 pending，仅靠 revision 刷列表；pending 排队时用 `resolveActivityWorkspaceKey` 把 cwd 反查成工作空间键）；`useCanvasTabModel.ts`（消费 pending 前做归属闸门与可见性守卫，不匹配不消费不清槽；未读复位 effect 补计数依赖）；`ArtifactCanvasOpenButton.tsx`（新增 `ChatActivityWorkspaceIdProvider` 上下文，按钮优先取宿主下发的工作空间键写 pending 与切页签，无上下文时退回 activeSession.cwd）；`MessageList.tsx`（最小接线：把 `workspace.id` 经上下文下发给消息块）。
- 实际运行：`useSessionEventController.artifact.test.tsx`（新增 3 例：Team 页签可见不涨幻影未读、不可见排队带归属、Team 视图旧会话产物归属回退 cwd）、`useCanvasTabModel.test.tsx`（新增 4 例：归属匹配消费、归属不匹配不清槽、可见性守卫与切回消费、未读复位依赖计数）均通过；`ArtifactCanvasOpenButton.test.tsx`（更新 3 例，含 Team 上下文键与无来源兜底）、`useSessionEventController.compaction/memory-bounds`、`canvas-atoms.test`、`MessageListView`、`DefaultChatView(.memo)`、`TeamChatView`、`ToolCallPresentation` 回归均通过。desktop 定向 `tsc --noEmit` 过滤本任务文件零错误；`check:quick` Biome 对任务文件无告警。
- 未运行及原因：`verify:ui:*` 未获用户授权；全量 `bun run check` 被并行 WIP 污染（`packages/capability-sdk` catalog 文档 stale 守卫红、`bun.lock` 在途变更导致 theme-ui 双 React 副本使 ThinkingBlock/ToolCallBlockView 等主题组件测试挂 hooks null，均与本任务文件无导入关系，归属他人域不代修）；`CanvasTabPanel.test.tsx` 4 例在其局部 atoms mock 缺 canvas atoms 上失败，属 TASK-0074 既有缺口（HEAD 即红），未列入本任务 write_paths。
- 剩余风险：团队成员 Runtime 的事件经 `agentTeams.subscribe` 独立通道回流，不经本控制器——成员产物的列表刷新依赖主进程 canvas 服务与既有 visibilitychange/重挂路径，本任务未改动该通道；全局 `canvasUnreadCountAtom` 仍是单计数，双面板同时挂载时徽章不区分归属工作空间（与改前一致）；`resolveActivityWorkspaceKey` 按 cwd 反查在多个 Team 工作空间共享同一 cwd 时取最先挂载者，当前产品形态下不存在该形态。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】团队会话的画布页签不再出现幻影未读与打不开的占位条目，「在画布中打开」在团队聊天里生效。
- 集成验收（主线）：定向 3 文件 10/10、回归 11 文件（controller 邻居/canvas-atoms/MessageListView/TeamChatView/ToolCallPresentation/DefaultChatView(.memo)）45/45 复跑通过；Biome 3 个 .ts 零问题、desktop 全量 tsc 对本任务文件零命中。`MessageList.tsx` 不在原 write_paths，但其改动仅为单 Provider 包裹（缩进膨胀致 diff-stat 偏大），系上下文下发的必要接线，验收接受并在此留痕。
