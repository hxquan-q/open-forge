---
id: BUG-0108
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的实机日志（2026-10-14(2).log，main 9801e62fc）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087]
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 删除团队会话失败：通知日志写入与成员 runtime 释放失败双双掀翻删除

## 用户流程

- Given：一个成员 runtime 已停止、协调会话已被删除（或某成员 runtime 的会话扩展释放失败）的团队会话。
- When：用户在侧栏右键「删除会话」，走 `vetta:agent-teams:delete-session`。
- Then：期望团队会话连同成员 runtime 一起消失；实际 IPC 抛错，会话留在列表里，反复点击反复失败。

## 实际行为

`2026-10-14(2).log` 中同一团队会话 `a3709dba-dedd-4855-8e8e-c245d1ab4d3a` 三次删除均失败，两种签名：

**签名 A（15:03:22、15:05:08）——降级路径**

```
warn [agent-team-sessions] team session could not be loaded during delete; proceeding with degraded cleanup
warn [agent-team-turns] Team member runtime could not be aborted { runtimeSessionId: 'a3709dba-…' }
error Error occurred in handler for 'vetta:agent-teams:delete-session': { code: 'SESSION_NOT_FOUND',
  message: 'Session not found: a3709dba-dedd-4855-8e8e-c245d1ab4d3a', origin: 'runtime' }
```

**签名 B（15:04:20）——严格路径**

```
warn [runtime] runtime agent lifecycle failure { operation: 'session.close', sessionId: '9a222d82-…', errorName: 'AggregateError' }
warn [runtime] runtime host lifecycle failure { operation: 'session.dispose', component: 'sessions', sessionId: '9a222d82-…', errorName: 'AggregateError' }
error Error occurred in handler for 'vetta:agent-teams:delete-session': AggregateError: Failed to dispose one or more session extensions
    at SessionExtensionComposition.dispose (packages/runtime-core/dist/session-extensions/composition.js:154:19)
```

## 期望行为

用户要求删除时以「会话消失」为准：任何单一成员 runtime 的释放失败或协调文档不可达都不得让删除整体失败；失败按 best-effort 记录。只有团队索引三件套（repository / sessionState / residency）写失败才应真实报错。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\vetta\open-forge`），Windows 11，Electron 39.8.10。
- `2026-10-14(2).log`：`delete-session` 失败 3 次（15:03:22 / 15:04:20 / 15:05:08）；团队会话 `a3709dba…`，成员 runtime `9a222d82…`。
- 关键旁证：协调器 `team-turn-coordinator.ts:276` 的 `"team session stopped"` info 日志在两次删除中**均缺失**（全日志仅 09:42:37、15:02:52 出现），说明 `abort()` 未走到 276 行。
- 同一成员会话另有 `Failed to persist context compaction: … is at version 1067, expected 1066`（独立缺陷，见 BUG-0110）。

## 最小复现

1. 建立团队会话并运行成员回合，使成员 runtime 的会话扩展处于「dispose 会抛错」的状态（本例证据为压缩版本冲突后扩展释放失败）。
2. 删除协调会话（或使其文档不可读），让 `read` 走降级路径。
3. 右键删除团队会话 → 签名 A：`notificationJournal.stop` 写 STOP 标记命中 `SESSION_NOT_FOUND` 并冒泡。
4. 若 `read` 成功 → 签名 B：`disposeSession` 抛 AggregateError，删除中断且目录条目保留为僵尸。

## 影响

团队会话删不掉且无自助手段；由于 `disposeSessionHandle` 在 dispose 失败时不注销目录条目，该 key 永久留在目录里，后续每次删除都重复同一失败（`RetryableCleanup` 把失败任务保留在 pending 下轮重试）。

## 根因证据

- **路径 A**：`team-turn-coordinator.ts:270-275` 的 `Promise.all([notificationJournal.stop(session).finally(() => taskControl.stopTeam(session)), abortRuntimes(session)])`。同批另两个操作各自吞错——`abortRuntimes`（`team-turn-coordinator.ts:285`，`Promise.allSettled` + 内层 try/catch）与 `stopTeam`（`team-task-control-service.ts:119-126`，try/catch）——所以唯一会 reject 的操作数就是 `notificationJournal.stop`。其链路：`team-notification-journal.ts:30 stop()` → `team-collaboration-store.ts:148 append()` → `getRuntime().appendSessionMetadataEntry(coordination.sessionId, …)` → `runtime-host-session-directory.ts:69` 抛 `SESSION_NOT_FOUND`。日志里报错 id 就是 teamSessionId，因为协调运行时的 sessionId 与团队会话 id 同源。
- **路径 B**：`runtime-host-catalog-facade.ts:46-51` 的 `deleteSession` 在 `disposeSession` 抛错时不会走到 `deleteSessionArtifacts`；`runtime-host-session-lifecycle.ts:223-238` 的 `disposeSessionHandle` 把 `directory.remove()` 放在 `handle.lifecycle.dispose()` 之后，dispose 失败即 `throw` 且**不注销**。
- **诊断性缺陷**：`session-extensions/composition.ts:204-222` 的 `dispose()` 把各扩展错误收进 `errors` 后抛 `AggregateError(errors, "Failed to dispose one or more session extensions")`，既不携带失败扩展 id 也不带 cause，逐层嵌套消息完全相同——这是日志无法指认元凶的原因。
- 置信度：高（两条路径的日志签名、缺失日志与代码行一一对应）。

## 回归测试

- 路径 A：`team-turn-coordinator` 测试——协调会话写 STOP 标记失败（`SESSION_NOT_FOUND`）时，`abort()` 仍 resolve，且记录 warn；旧实现 reject。
- 路径 B：`runtime-host-catalog-facade` 测试——`disposeSession` 抛错时 `deleteSession` 仍调用 `deleteSessionArtifacts` 并 resolve；所有权/能力冲突仍 reject。`disposeSessionHandle` 测试——dispose 抛错时目录条目仍被移除。
- 诊断性：`session-extensions/composition` 测试——两个扩展 dispose 失败时，AggregateError 的 message/errors 能指认各自 extension id。

## 修复与验证

- 修复：待实施（见 TASK-0260）。
- 测试：待回写。
- 检查：待回写。
- 未运行及原因：待回写。
