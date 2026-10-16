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
related_tasks: [TASK-0285]
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

日志 excerpt（逐字，2026-10-17 回填自 dev 运行日志 2026-10-16.log）：

```
[2026-10-16T14:01:23.423+08:00] [error] [agent-teams-ipc] team send-message failed { teamSessionId: '148230bf-f867-40b2-9408-ee4e51f66464', requestId: 'f45fa0b3-7b58-47f8-ad0e-ba6381cd4f1a', elapsedMs: 15605738, error: '…{ code: SESSION_NOT_FOUND, message: Session not found: 44826738-aeb8-4bb1-b551-110629032c3b, retryable: false, origin: runtime }…' }
[2026-10-16T14:21:25.473+08:00] [error] [agent-teams-ipc] team send-message failed { teamSessionId: '148230bf-f867-40b2-9408-ee4e51f66464', requestId: '5fe4f7fa-584c-4342-a786-ec96b967c041', elapsedMs: 6146, error: '…SESSION_NOT_FOUND 44826738-…' }
[2026-10-16T14:21:42.493+08:00] [error] [agent-teams-ipc] team send-message failed { teamSessionId: '148230bf-f867-40b2-9408-ee4e51f66464', requestId: '6e5812f8-a53a-4ef6-a833-cd4e91043559', elapsedMs: 3235, error: '…{ code: SESSION_NOT_FOUND, message: Session not found: 44826738-aeb8-4bb1-b551-110629032c3b, retryable: false, origin: runtime }…' }
[2026-10-16T14:21:42.493+08:00] [error] [console] Error occurred in handler for 'vetta:agent-teams:send-message': { code: 'SESSION_NOT_FOUND', message: 'Session not found: 44826738-aeb8-4bb1-b551-110629032c3b', retryable: false, origin: 'runtime', details: undefined }
```

同一 teamSessionId 三个不同 requestId 相隔 20 分钟连续必败，错误 id 恒为成员 runtime session 44826738-…；期间无任何自动重载/恢复动作，只有应用重启可恢复，与「无自愈、send 恒败」的立案描述一致。

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

- 修复：TASK-0285 调查结论——本条的 send 恒败环是 BUG-0115 收尾竞态的连锁（目录失效绑定毒化 `ensureMemberConfiguration` 的重建路径）。`0de675eb1` 幂等化 dispose 后自愈入口解锁：send → 成员 attempt → ensure → dispose no-op → 重建 runtime → 投递成功；重建能力由 `reconfigureTeamMemberRuntime` 既有实现承载。残余错误经 `6bac5db4a` describeError 可读（code/message 不再 `[object Object]`）。
- 验证：`team-runtime-manager.test.ts` 组合回归「失效绑定 → ensure 直接自愈」（`add121c68`，8/8 绿）+ agent-teams 250 例全绿；实机按最小复现走一遍待桌面构建后观察。
