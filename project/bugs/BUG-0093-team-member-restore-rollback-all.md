---
id: BUG-0093
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检第二轮（main 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: [TASK-0226]
related_issues: []
related_bugs: [BUG-0087, BUG-0091]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 单个成员 runtime 恢复失败回滚全部已恢复成员，team 会话整体打不开

## 用户流程

- Given：team 会话持久化的 `memberRuntime` 中有多个成员，应用重启/冷加载后 `readInternal` → `restoreMembers` 逐个恢复成员 runtime。
- When：其中**一个**成员的会话文件锁被占用（如另一安装实例正在流式写入同一 `~/.openforge` 数据目录），`createSession` 抛 `Timed out acquiring conversation file lock`。
- Then：期望该成员单独降级、会话仍可打开；实际 `Promise.allSettled` 收集后遇首个 rejection 即整体 `throw`，已恢复的成员 runtime 也被 `disposeSession` 回滚，会话加载失败。

## 实际行为

`temp/log/main/2026-10-10.log`：team 会话 `55809d85-4773-4dd6-9e5d-3f6247be3997` 反复出现

```
[agent-team-runtime-manager] team session runtime restore rolled back
  error: 'Timed out acquiring conversation file lock: c52b3043-…'  restoredMemberCount: 1
[agent-team-sessions] failed to warm team session after bootstrap
```

约 1 分钟内同一会话回滚 3 次：每次都有成员恢复成功（`restoredMemberCount: 1`），随后被锁超时成员掀翻、连同成功的成员一起 dispose；后续 `get-session`/`send-message` 连环失败，bootstrap warm 无退避重试刷错误日志。

## 期望行为

成员级失败只影响该成员：已恢复的成员保留，失败成员保留旧 `memberRuntime` 条目（与重启后尚未恢复的条目同语义），会话正常加载；该成员后续 turn 单独失败，下次冷加载自动重试恢复。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\OpenForge\OpenForge\versions\0.1.3`），Windows；该机同时存活 0.1.1 安装（`C:\Users\Chenxuhua\AppData\Local\Programs\vetta`），两实例共享 `C:\Users\Chenxuhua\.openforge`。
- `temp/log/main/2026-10-10.log`：`runtime restore rolled back` ×3，`error: 'Timed out acquiring conversation file lock: c52b3043-550b-44d4-bb65-c7d40ec4ed4c'`；随后 `failed to warm team session after bootstrap` 与 `team get-session` 失败成对出现。

## 最小复现

1. 实例 A 打开某 team 会话并保持成员会话流式写入。
2. 实例 B（同一 `~/.openforge`）冷加载同一 team 会话，`restoreMembers` 命中该成员会话文件锁。
3. 1 秒锁预算（`FILE_LOCK_RETRY_COUNT=100` × `FILE_LOCK_RETRY_DELAY_MS=10`）耗尽 → 成员恢复抛错 → 整体回滚 → `Team session could not be loaded`。

## 影响

跨实例/并发写入竞争下，任一成员的瞬时锁超时都会让整会话打不开；双安装/崩溃残留锁文件场景用户无自救手段（BUG-0087 的删除降级只解决会话清理，不解决打开）。

## 根因证据

- [`team-runtime-restorer.ts`](../../apps/desktop/src/main/agent-teams/team-runtime-restorer.ts) 90-105 行：`Promise.allSettled` 收集成员结果后 `if (rejected) throw rejected.reason`，catch 内 `disposeSession` 回滚全部 `createdSessionIds`——成员间没有失败隔离。
- [`conversation-file-lock.ts`](../../packages/runtime-node/src/conversation/conversation-file-lock.ts)：锁重试预算约 1 秒，对跨实例持锁偏紧（诱因，不在本 bug 修复范围）。
- `assertTeamSessionInvariants`（`packages/agent-team/src/validation.ts:407`）要求 `memberRuntime` 与 `activeMemberIds` 数量一致（除非 `runtimeStatus` 为 `preparing`/`failed`）——降级只能保留旧条目，不能删条目。
- 置信度：高（代码路径与日志签名一一对应）。

## 回归测试

`apps/desktop/src/main/agent-teams/team-runtime-restorer.test.ts`：成员 B `createSession` 抛锁超时、成员 A 恢复成功时，旧实现整体 reject 且 dispose 已恢复成员（红基线）；新实现 resolve，A 保留新 sessionId、B 保留旧条目、B 的失败成员自身半途创建的 runtime 被 dispose、记成员级 error 日志。

## 修复与验证

- 修复：见 [TASK-0228](../tasks/TASK-0228-team-member-restore-isolation.md)。`restoreTeamMemberRuntimes` 改成员级失败隔离：成功成员写回、失败成员保留旧 `memberRuntime` 条目、该成员半途创建的 runtime 由本分支 `disposeSession` 回收（替代全局回滚），全部失败时 resolve 原文档不再抛错；成员级 error 日志保留现场。
- 测试：`team-runtime-restorer.test.ts` 6/6 过（隔离、半成品回收、全失败三例新增/改写；旧实现下 3 例红基线）；desktop impact 190 例过（4 个套件因 `window-manager.ts` `process.resourcesPath` 既有问题红，与本改动无关）。
- 检查：desktop `typecheck:incremental` 绿；改动文件 biome 绿；`check:quick` 仍被 `.ua/` 既有 guard 残留阻断（非本改动）。
- 验证边界：协调 runtime 恢复失败仍整体失败（协调会话是消息脊柱，有意不降级）；跨实例锁竞争诱因属环境（双安装共享 `~/.openforge`），锁预算本身未调整；失败成员的本会话期内 turn 仍单独失败，冷加载自愈属人工验收面。
