---
id: BUG-0121
type: bug
status: verifying
priority: P1
owner: ssh-transport
requirement:
plan:
source: RESEARCH-0027; 全局 uncaughtException 与 ssh2 源码路径核对
related_requirement: []
related_plan: []
related_tasks: [TASK-0278]
related_issues: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# SSH 握手失败后的清理窗口让 error 逃逸为全局未捕获异常

## 用户流程

- Given：用户对一个新主机发起 SSH 连接，且首个认证方法失败（例如 ssh-agent 不可用）。
- When：连接器换下一个认证方法，并销毁这次未完成握手的 Client。
- Then：期望失败被局部处理并按既有语义换方法或上抛；实际销毁过程产生的 `error` 事件无人监听，冒成进程级 `uncaughtException`。

## 实际行为

`tryConnect` 在 `ready`/`error` 两个一次性监听里用 `cleanup()` 同时摘掉两者，随后 `catch` 中 `client.destroy()`。失败连接不会进入 `installClient`（只有它才挂常驻 `error` 监听）。ssh2 在 socket `end`/`close` 时若 `wasConnected && !sawHeader` 会 `emit('error', 'Connection lost before handshake')`，此刻监听已被摘除，Node 因无 `error` 监听而抛出全局未捕获异常。

## 期望行为

失败连接的任何迟到事件都被局部吸收（记日志或丢弃），不逃逸到全局异常处理；换方法与上抛语义保持不变。

## 环境与失败证据

- Windows，源码 HEAD `a4ccf2938`；`dev/main/2026-10-16.log:569`、`:581`（09:35:51）。
- 时序：`:568`（09:35:51.548）`ssh2 38.34.4.113: agent unavailable, trying next method` → 12 ms 后 `[diagnostics] uncaughtException Error: Connection lost before handshake`。
- 栈：`makeError (ssh2/lib/protocol/utils.js:142)` ← `ssh2/lib/client.js:753` ← `Socket.<anonymous> (ssh2/lib/client.js:815)` ← `Socket.emit` ← `TCP.<anonymous> (net:346)`。
- ssh2 侧证据：`node_modules/.bun/ssh2@1.17.0/node_modules/ssh2/lib/client.js:744-753` 的 `onDone()` 在 socket `end`（`:805`）/`close`（`:809`）时于 `wasConnected && !sawHeader` 分支 `this.emit('error', ...)`。
- 源码锚点：`packages/ssh-transport/src/ssh2-runner.ts:553-574`（`cleanup` 在 `:555-558`，`client.destroy()` 在 `:572`），`installClient` 的常驻监听在 `:387-389`。
- 现有测试无法拦：`ssh2-runner.test.ts` 的 `FakeClient.emitError` 在无监听时自动补 no-op，掩盖真实 Client 语义。

## 最小复现

1. 用真实 `ssh2.Client` + 受控 socket：TCP 连接成功但握手完成前触发 socket `close`（对端 RST 或直接 `destroy`）。
2. 断言进程不产生 `uncaughtException`。

## 影响与根因证据

P1：`uncaughtException` 属于全局逃逸，可能触发宿主异常策略并掩盖真实失败原因；且同一空窗可能影响所有失败连接的销毁路径（含跳机 Client）。置信度：高（源码链路 + 日志时序 + ssh2 源码三处互证），尚缺隔离复现。

## 回归测试

以真实 `ssh2.Client`/忠实替身覆盖「握手前失败 → 销毁 → 迟到 error」不产生全局未捕获异常；并保留「agent 不可用换下一认证方法」「认证失败换方法」既有语义。

## 修复与验证

- 修复：待实施（见 TASK-0278）。
- 验证：待回写。
- 未运行及原因：待回写。
