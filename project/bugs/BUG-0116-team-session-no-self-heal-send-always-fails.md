---
id: BUG-0116
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
related_bugs: [BUG-0091, BUG-0115]
created: 2026-10-16
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->
# 团队会话 runtime 损坏后无自愈：此后每次 send 必败 SESSION_NOT_FOUND，仅重启可恢复

## 用户流程

- Given：一个团队会话已因收尾/清理竞态（见 BUG-0115）或 runtime 加载失败而进入损坏态（runtime session 不在共享内存目录）。
- When：用户在该会话继续发消息（send）。
- Then：期望 send 能触发恢复或给出可读错误；实际：每次 send 都因 `SESSION_NOT_FOUND` 失败，会话永久不可用，唯一恢复手段是重启应用。

## 实际行为

一旦团队会话 runtime 进入损坏态，后续所有 send 必败：

- 渲染端 send → 主进程解析 runtime session key 抛 `SESSION_NOT_FOUND`（`runtime-host-session-directory.ts:69`），与 BUG-0114 同源抛点但触发路径为「用户 send」而非「用户 delete」。
- 无任何自愈/重试/恢复入口：会话不自动重载 runtime，send 不尝试重建会话，错误不引导用户恢复。
- 用户侧表现为"团队会话死了，只能重启"——与 BUG-0091（Turn 终态持久化失败一次后 `recovery_required` 无恢复手段）同构，但错误类型不同（0091 为 `recovery_required` KernelError，本条为 `SESSION_NOT_FOUND`）。

日志 excerpt（逐字，待粘贴）：【待粘贴：~/.openforge-dev/desktop-app/logs，2026-10-13 损坏会话后每次 send 的 `SESSION_NOT_FOUND` 行】

## 期望行为

1. 团队会话 runtime 损坏后，send 路径应能尝试重载/重建 runtime session，或将错误归一为可读提示（含"重启可恢复"的明确指引）。
2. 提供轻量自愈入口（如会话重载），避免"只能重启"。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例）。
- 复现路径明确（坏会话 + send），无需额外日志即可构造最小复现；代码抛点与 BUG-0114 同源（`runtime-host-session-directory.ts:69`）。

## 最小复现

1. 让一个团队会话进入 runtime 损坏态（触发 BUG-0115 收尾竞态，或制造 coordination 文档不可读，见 BUG-0087/0100）。
2. 不重启应用，在该会话发一条消息。
3. 观察 `SESSION_NOT_FOUND` 反复出现，send 恒败（旧实现）。

## 影响

- P1：团队会话一旦损坏即永久不可用，严重影响可用性；与 BUG-0115 因果相连（0115 收尾竞态使会话损坏 → 本条 send 必败）。

## 根因证据

- 置信度：高（复现路径明确，与 BUG-0114 同源抛点；自愈缺失属设计边界）。
- 根因：send 路径对「runtime 未加载」无恢复分支，错误直接透传；会话层无自愈/重载机制。
- 未定项：是否应在 send 时自动重载 runtime（vs 仅提示），留待修复 Task 定。

## 回归测试（修复时）

- 团队会话 runtime 损坏态下调用 send，期望触发恢复或返回可读错误（含恢复指引），不恒败、不 unhandled——注入 `resolveSessionKey` 抛 `SESSION_NOT_FOUND` 断言。

## 修复与验证

- 修复：2026-10-17（localtest 分支）。取证修正：当前代码里 send 的首个炸点不在 `runtime-host-session-directory.ts:69`（该路径已被 BUG-0108 收口），而在 `team-session-service.readInternal` 的**缓存命中分支**——缓存里的会话其 coordination runtime 已卸载时，绑定校验（`ensureTeamConversationBinding`）按 id `readSessionDocument` 即抛裸 `SESSION_NOT_FOUND`，该分支无任何恢复/兜底。
- 修法：`readInternal` 缓存命中后先走 `ensureCoordinationRuntimeLoaded`——协调 runtime 已加载则幂等返回；已卸载则按持久路径原 id 重开（复用 `TeamRuntimeManager.ensureCoordinationRuntime`，含身份/路径校验与状态再持久化），并补 `setExecutionMode`；重开失败归一为可读错误（含原始 cause 与「重启应用可恢复」指引）。send/readSnapshot 等所有走 `read()` 的入口统一受益。成员 runtime 的重开既有链路（`reconfigureTeamMemberRuntime` 幂等重开 + `waitForMemberRuntimeWarmup`）不变。
- 验证：
  - 红→绿：`team-session-service.test.ts` 新增两例——「协调 runtime 已卸载时按持久路径原 id 重开再派发」（断言 createSession 收到原 id+原路径）与「重开失败返回带重启指引的可读错误」；stash 回退旧实现两例均红。
  - 待实机：按最小复现走一遍（触发损坏后不重启直接 send）。
