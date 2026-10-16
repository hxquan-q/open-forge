---
id: BUG-0117
type: bug
status: verifying
priority: P2
owner: apps/desktop agent-teams + runtime-core
requirement:
plan:
source: 用户 dev 运行日志（C:\Users\Chenxuhua\.openforge-dev\desktop-app\logs，2026-10-13）+ 源码静态追踪
related_requirement: [REQ-0001]
related_plan: []
related_tasks: [TASK-0286]
related_issues: []
related_bugs: [BUG-0092]
created: 2026-10-16
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->
# SessionError 裸对象跨 IPC：team 链渲染端只见 [object Object]（单聊链有翻译层，team 链缺）

## 用户流程

- Given：一个团队会话发生运行时错误（如 BUG-0115/0116 的 `SESSION_NOT_FOUND`、或成员 runtime 启动失败）。
- When：该错误经 IPC 从主进程抛到渲染端（reject），渲染端记录/展示它。
- Then：期望渲染端看到结构化的可读错误（含 code/message）；实际：team 链渲染端只见 `[object Object]`，原因错误是普通对象、IPC 原样 throw、Electron `String()` 序列化为 `[object Object]`。

## 实际行为

- 主进程侧：`SessionError`（普通对象，非 `Error` 实例）被 IPC 层原样 `throw`/`reject`。
- 跨 IPC：Electron 对 rejection 值调用 `String()`，普通对象得到 `[object Object]`。
- 渲染端：team 链的 IPC 消费路径**缺少翻译层**，直接把 `[object Object]` 记进日志/console；对比单聊链已有 `describeError(error)` 翻译层（见 BUG-0092 的 TASK-0236 修复已进 `session-interrupt-monitor.ts:98-100`），team 链未接同一翻译。
- 这与 BUG-0092 是姊妹条：0092 的验证边界明文「renderer 侧 `[agent-team] send attempted [object Object]` 走另一条 console 路径，未覆盖」——0092 修的是序列化/翻译层，但 team 链 IPC rejection 的渲染端呈现仍是 `[object Object]`，0092 未触碰。

日志 excerpt（逐字，2026-10-17 回填自 dev 运行日志 2026-10-16.log 与 2026-10-14(2).log）：

```
[2026-10-16T14:01:23.403+08:00] [error] [agent-team-runtime-manager] team member runtime reconfiguration failed { teamSessionId: '148230bf-…', memberId: '02a59a80-…', …, error: '[object Object]' }
[2026-10-16T14:21:42.492+08:00] [error] [agent-team-turns] team message failed { teamSessionId: '148230bf-…', requestId: '6e5812f8-…', elapsedMs: 3230, error: '[object Object]' }
[2026-10-14T15:03:22.331+08:00] [warn] [agent-team-sessions] team session could not be loaded during delete; proceeding with degraded cleanup { teamSessionId: 'a3709dba-…', error: '[object Object]' }
[2026-10-16T14:21:42.493+08:00] [error] [console] Error occurred in handler for 'vetta:agent-teams:send-message': { code: 'SESSION_NOT_FOUND', … }
```

10-16 日志中 reconfiguration failed 3 处、team message failed 2 处的 error 字段均为 `[object Object]`；10-14(2) delete 降级清理 2 处同样；而同一失败的 console handler 行因 Electron 顶层打印完整对象反而可读——主进程日志的 error 字段全部丢失 code/message，一线诊断信息被吞。

## 期望行为

1. team 链 IPC rejection 也走 `describeError` 翻译层，渲染端看到结构化错误（code/message/errorName），而非 `[object Object]`。
2. 跨 IPC 的错误对象统一序列化为可读结构（参考 BUG-0092 的 TASK-0236 修法延伸到 team 链）。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例）。
- mock 即可复现：构造一个普通对象 `SessionError` 经 team 链 IPC reject，渲染端 console 必见 `[object Object]`。
- 代码锚：单聊链 `describeError` 翻译层（`session-interrupt-monitor.ts:98-100` 已用）；team 链 IPC 消费路径缺同层。

## 最小复现

1. 在 team 链构造一个普通对象 `SessionError`（非 `Error` 实例）。
2. 经 IPC reject 到渲染端。
3. 观察渲染端 console/日志为 `[object Object]`（旧实现）。

## 影响

- P2：team 链错误在渲染端不可读，一线诊断信息全丢（与 BUG-0092 同类问题，不同路径）；与 0115/0116 叠加时，损坏会话的错误呈现仍是 `[object Object]`，加剧排查难度。

## 根因证据

- 置信度：高（mock 可复现；单聊链有翻译层、team 链缺，源码可溯；与 BUG-0092 姊妹关系成立）。
- 根因：team 链 IPC 消费路径未接入 `describeError` 翻译层，错误对象跨 IPC 被 `String()` 成 `[object Object]`。
- 未定项：team 链具体哪一处 IPC 消费缺翻译（send vs 其他入口），修复 Task 时定位。

## 回归测试（修复时）

- team 链 IPC rejection 一个普通对象 `SessionError`，渲染端经 `describeError` 后得到结构化错误（非 `[object Object]`）——可用 mock IPC reject 断言 console/日志不含 `[object Object]`。

## 修复与验证

- 修复：待实施（立项后建 Task）。建议修法：team 链 IPC 消费路径接入 `describeError`（复用 BUG-0092 的 TASK-0236 翻译层）。
- 验证：上述回归测试 + 0092 套件延伸；实机触发一次 team 错误确认渲染端可读。
