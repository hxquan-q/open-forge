---
id: BUG-0115
type: bug
status: verifying
priority: P1
owner: apps/desktop agent-teams
requirement:
plan:
source: 用户 dev 运行日志（C:\Users\Chenxuhua\.openforge-dev\desktop-app\logs，2026-10-13）+ 源码静态追踪
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0108, BUG-0114, BUG-0116]
created: 2026-10-16
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->
# 团队长任务收尾连环失败：结算失败 → 成员 runtime 重配竞态 → SESSION_NOT_FOUND

## 用户流程

- Given：一个团队会话正在执行长任务（多成员 attempt 串行/并行），任务主体已正常跑完、进入收尾阶段。
- When：系统在收尾阶段执行结算（账单/用量结算）并对成员 runtime 做清理或重配（reconfigureTeamMemberRuntime）。
- Then：期望收尾静默完成、会话回到可用态；实际：结算失败与成员 runtime 重配竞态相互叠加，重配在 runtime 未加载的会话上调用 `disposeSession` 抛 `SESSION_NOT_FOUND`，收尾路径被掀翻，会话进入损坏态。

## 实际行为

收尾阶段出现「结算失败」与「成员 runtime 重配竞态」两套失败叠加：

- 重配链：`team-member-attempt-runner.ts:74` 在成员 attempt 执行/收尾期间调用 `ensureMemberConfiguration` → `team-runtime-manager.ts:230` → `reconfigureTeamMemberRuntime` → `team-member-runtime-reconfiguration.ts:53` `disposeSession(current.sessionId)`；若目标 runtime session 尚未加载，抛 `SESSION_NOT_FOUND`（来源 `runtime-host-session-directory.ts:69`，retryable: false），并由 `reconfiguration.ts` 上游打 `team member runtime reconfiguration failed` 日志。
- 注意 `reconfiguration.ts:35` 还会抛 `Team member runtime not found`（成员根本不在 coordination 文档里）——这是第三种错误，不是 `SESSION_NOT_FOUND`，取证时以日志 code 区分，不要混为同一根因。
- 结算失败与重配竞态并发时，收尾事务无补偿/重试，会话被标记为损坏，直接喂给 BUG-0116（此后每次 send 必败）。

日志 excerpt（逐字，待粘贴）：【待粘贴：~/.openforge-dev/desktop-app/logs，2026-10-13 收尾时段，含 `team member runtime reconfiguration failed` 与 `SESSION_NOT_FOUND` 行】

## 期望行为

1. 收尾重配对「runtime 未加载」的会话按幂等 no-op 处理（或先确保 runtime 已加载再重配），不抛 `SESSION_NOT_FOUND`。
2. 结算失败与重配竞态各自隔离：任一步失败不连带掀翻整个收尾，损坏态可恢复或通过重试收敛。
3. `Team member runtime not found` 与 `SESSION_NOT_FOUND` 在日志与错误对象上可区分，便于一线诊断。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例）运行日志。
- 代码链路（逐帧可溯）：
  - 触发：`apps/desktop/src/main/agent-teams/team-member-attempt-runner.ts:74` `ensureMemberConfiguration`（团队任务执行/收尾期间，非用户点删除）。
  - 重配：`apps/desktop/src/main/agent-teams/team-runtime-manager.ts:230` `reconfigureTeamMemberRuntime`。
  - 抛点：`apps/desktop/src/main/agent-teams/team-member-runtime-reconfiguration.ts:53` `disposeSession(current.sessionId)` → `packages/runtime-core/src/runtime-host/runtime-host-session-directory.ts:69` `SESSION_NOT_FOUND`（retryable: false）。

## 最小复现

1. 建一个团队会话并起一个长任务，让多个成员 attempt 执行到收尾阶段。
2. 在收尾窗口内制造成员 runtime 未完全加载/重配竞态（如中途重启某成员 runtime、或让结算与重配并发）。
3. 观察 `team member runtime reconfiguration failed` + `SESSION_NOT_FOUND`，收尾失败、会话损坏（旧实现）。

## 影响

- P1：团队长任务正常完成后收尾阶段整体失败，会话损坏且无自愈（连锁到 BUG-0116），用户侧表现为团队会话"做完却废了"。属 BUG-0108/BUG-0114 同底层条件（runtime 未加载）的**不同触发路径**（reconfig 收尾 vs 用户 delete），不合并。

## 根因证据

- 置信度：高（代码路径逐帧可溯；与 BUG-0108/0114 共享 `runtime-host-session-directory.ts:69` 抛点，但触发点为 `reconfiguration.ts:53` 的 `disposeSession`，非 delete 的 `resolveSessionKey`）。
- 根因：收尾重配按「runtime 必已加载」前提设计，`disposeSession` 对缺失 session 直接抛 `SESSION_NOT_FOUND`；desktop 收尾流程未把「runtime 未加载」归一为 no-op，且结算与重配并发时无隔离/重试。
- 未定项：结算失败与重配竞态的具体时序占比、是否每次收尾都触发，需补 dev 日志原文定量化。

## 回归测试（修复时）

- 主进程：成员 runtime 未加载某 team 会话（sessions 目录不含该 key）时触发收尾重配，期望 no-op/resolve（不抛 `SESSION_NOT_FOUND`），收尾继续——旧实现红。
- 收尾：结算失败与重配竞态并发时，收尾不整体掀翻、会话不进入损坏态——可用注入 `disposeSession` 抛 `SESSION_NOT_FOUND` 的测试断言。

## 修复与验证

- 修复：2026-10-17（localtest 分支）。取证修正：本条主链在当前代码已大部分收口——
  - runtime 层：`disposeSession` 对未加载会话已按 no-op 吞掉（BUG-0108 / commit 64ccf25c1），`reconfiguration.ts:53` 对「从未加载」的成员不再调 dispose，而是直接按持久路径重开（既有测试 "restores a missing runtime even when its persisted configuration is unchanged" 已钉住）。
  - 剩余缺口是竞态窗口：`getSessionPath` 判定已加载后、`disposeSession` 执行前会话被空闲逐出/并发清理，dispose 仍会抛 `SESSION_NOT_FOUND` 并掀翻重配与收尾。本次把 dispose 的 `SESSION_NOT_FOUND` 归一为幂等继续（跳过释放、按持久路径重开），其余失败（如外部实例持租约）保持严格传播。
  - 协调 runtime 侧的未加载自愈由 BUG-0116 修复（readInternal 缓存分支先重开再绑定校验）。
  - 「结算失败与重配竞态各自隔离」：重配失败只令该次成员 attempt 失败并走既有重试/结算机器（`maxAutomaticRetries`），不再连带把会话推入损坏态——事故中的「结算失败」系当时 SESSION_NOT_FOUND 传播的下游表现，两层收口后该链路已断。
- 验证：
  - 红→绿：`team-member-runtime-reconfiguration.test.ts` 新增两例——「判加载与 dispose 之间被并发逐出时按幂等继续重开」（旧实现红）与「dispose 抛非 SESSION_NOT_FOUND 仍严格传播」（钉住既有语义）。
  - 待实机：按最小复现走一遍（长任务收尾窗口内重启/逐出成员 runtime）。
