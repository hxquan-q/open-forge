---

type: bug
status: verifying
priority: P2
owner: apps/desktop agent-teams + runtime-core
requirement:
plan:
source: 用户 dev 运行日志（C:\Users\Chenxuhua\.openforge-dev\desktop-app\logs，2026-10-13 13:33）+ 源码静态追踪
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087, BUG-0092, BUG-0100]
created: 2026-10-14
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->
# 删除 runtime 未加载的 team 会话：SESSION_NOT_FOUND 抛穿 + 渲染端无 catch 成 unhandled rejection

## 用户流程

- Given：一个 team 会话其 runtime session 不在共享 runtime 的内存目录中（常见成因：上一会话崩溃重启后未再打开该会话；或 coordination 文档因跨实例文件锁/损坏读不出，见 BUG-0100/BUG-0087）。用户侧栏该会话可能显示为可删除项。
- When：用户先「停止」再「删除」该 team 会话（本次日志 13:33:05 stop、13:33:10 delete；两操作相隔约 5 秒，是独立路径，停止本身不会提前删除会话）。
- Then：期望删除静默成功（会话不存在则幂等无操作）或给出可读错误提示；实际：主进程 `delete-session` IPC handler 抛 `SESSION_NOT_FOUND`，渲染进程以 `Uncaught (in promise)` 报 unhandled rejection，用户侧无反馈。

## 实际行为

日志序列（2026-10-13 13:33，team `173a276d-36a3-bbce-0b86-4c075d375a09`，session `a3709dba-dedd-4855-8e8e-c245d1ab4d3a`）：

```text
[13:33:05.969] [warn ] [agent-team-tasks] Team work items could not be cancelled on stop   { errorName: 'UnknownError' }
[13:33:05.972] [info ] [agent-team-runtime] Team session stopped        { teamId: '…', sessionId: 'a3709dba-…' }
[13:33:10.975] [error] [console] Error occurred in handler for 'vetta:agent-teams:delete-session'
                { code: 'SESSION_NOT_FOUND', message: 'Session not found: a3709dba-…', retryable: false }
[13:33:10.978] [error] [renderer] Uncaught (in promise) Error: Error invoking remote method 'vetta:agent-teams:delete-session'
```

## 期望行为

1. `deleteSession` 对「runtime 目录中不存在该 session」视为幂等成功（no-op + 日志），不抛 `SESSION_NOT_FOUND`。
2. 渲染端删除入口对 IPC rejection 有统一 catch，给出 toast/日志，不产生 unhandled rejection。
3. `stopTeam` 的 work-item 取消失败日志带上真实 `errorMessage`（当前 `UnknownError` 掩盖了真实原因）。

## 最小复现

1. 打开一个 team 会话后强制重启应用（或制造 coordination 文档不可读：跨实例持锁 BUG-0100，或文档损坏）。
2. 不重新打开该会话（runtime 未加载），在侧栏/已归档页停止并删除它。
3. 观察 `SESSION_NOT_FOUND` + unhandled rejection（旧实现）。

注意：本次事故中该会话的 session-workspace 目录（`…/agent-teams/allstar-流水线--6f852191af/session-workspaces/0b677852-…/`）存在但为空，coordination 文档不在——与「文档不可读/已被清理」假设一致；`~/.openforge-dev/conversation` 目录已被用户手动清空，历史佐证不可用，归属待进一步取证。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例）与 `~/.openforge`（prod 实例）并存（两实例共存为已知风险，见 BUG-0087/BUG-0100）。
- 代码链路：
  - 抛点：`packages/runtime-core/src/runtime-host/runtime-host-session-directory.ts#resolveSessionKey`（`SESSION_NOT_FOUND`，retryable: false）。
  - 主进程：`apps/desktop/src/main/agent-teams/team-session-service.ts#deleteSession` —— BUG-0087 降级删除（TASK-0226）已绕过 `read` 失败继续清理磁盘，但严格路径仍会透传 runtime 的 `SESSION_NOT_FOUND`。
  - stop 侧：`team-task-control-service.ts#stopTeam` → `team-collaboration-store.ts#cancelForTeamStop` 读不到 coordination conversation 时失败，被 catch 后以 `UnknownError` 记 warn（`UnknownError` 是 catch 块对非 Error 抛值的兜底名，真实错误细节丢失，同 BUG-0092 的序列化问题）。
  - 渲染端无 catch 的两处：
    - `apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts#deletePanelSession`（`void …deleteSession(…).then(…)` 无 `.catch`）
    - `apps/desktop/src/renderer/domains/settings/components/useArchivedSessionsSettingsModel.ts#deleteSession`（同模式）

## 影响

- P2：删除失败时用户无可见反馈（会话可能残留），控制台 unhandled rejection；数据无损（磁盘清理在 runtime 步骤之前已完成或走降级路径完成）。属既有 BUG-0087 修复的边界外：协调文档可读但 runtime 未加载时仍会命中。

## 根因证据

- 置信度：高（代码路径逐帧可溯，日志 code 与 throw 点字面一致）。
- 根因 A（主）：runtime 删除按「必须已加载」前提设计，`resolveSessionKey` 对缺失 key 直接抛错；desktop 删除流程未把「runtime 中无此 session」归一为 no-op。
- 根因 B（渲染）：两处删除入口的 promise 链缺 `.catch`，IPC rejection 升级为 unhandled rejection。
- 根因 C（观测）：`stopTeam` catch 块只保留 `errorName`，真实 `errorMessage` 未落日志，stop 失败原因不可诊断。
- 未定项：该会话空 workspace 目录的确切成因（崩溃残留 vs 双实例竞争 vs 文档被清），不影响 A/B 修复，留待取证。

## 回归测试（修复时）

- 主进程：runtime 未加载某 team 会话（sessions 目录不含该 key）时调用 `deleteSession`，期望 resolve（不抛）、磁盘产物仍被清理——旧实现红（抛 `SESSION_NOT_FOUND`）。
- 渲染端：`deletePanelSession` / 归档页 `deleteSession` 在 IPC reject 时走 catch（打日志/toast），无 unhandled rejection——可用 `vi.spyOn(window.vetta.agentTeams, "deleteSession").mockRejectedValue` 断言。
- stop：`cancelForTeamStop` 失败时 warn 日志含 `errorMessage` 字段。

## 修复与验证

- 修复：2026-10-17（localtest 分支）。
  - A：`team-session-service.deleteSession` 的 per-path runtime 删除统一 try/catch——`SESSION_NOT_FOUND` 形态（普通对象或挂 code 的 Error）记 warn 后继续，视为幂等成功；其余失败仅降级路径吞掉，非降级路径保持严格传播（BUG-0087 严格语义测试保持绿）。
  - B：`useProjectsPanelModel.deletePanelSession`（团队分支）与 `useArchivedSessionsSettingsModel.deleteSession` 的 promise 链补 `.catch`——console.error + `showToast`（error），新增 i18n key `project:sidebar.dialogs.deleteSessionFailedToast` / `settings:deleteArchivedSessionFailedToast`（zh+en）。
  - C：`team-task-control-service.stopTeam` catch 日志补 `errorMessage` 字段。
- 验证：
  - 主进程红→绿：`team-session-delete.test.ts` 新增「read 成功但 runtime 报 SESSION_NOT_FOUND 时按幂等成功处理」（旧实现红）。
  - 渲染端红→绿：`useArchivedSessionsSettingsModel.test.tsx` 新增删除失败用例（错误日志 + toast + 行保留）；新增 `useProjectsPanelModel.deleteSession.test.tsx` 覆盖成功通知与失败 catch。两文件在 stash 掉修复的旧实现下 2 例红。
  - 待实机：按最小复现走一遍（重启后不重开团队会话直接停止+删除）。
