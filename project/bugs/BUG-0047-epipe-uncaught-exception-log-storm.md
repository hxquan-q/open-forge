---
id: BUG-0047
type: bug
status: investigating
priority: P1
owner: desktop
requirement:
plan:
source: dev 日志巡检（~/.openforge-dev main log 2026-09-28）
related_requirement: []
related_plan: []
related_tasks: [TASK-0131]
related_issues: []
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# 主进程 stdout pipe 断开后 uncaughtException 日志自反馈风暴

## 用户流程

- Given：dev 模式运行的 Desktop 主进程，stdout/stderr 连接到终端 pipe。
- When：终端关闭或 pipe 断开（dev 重启、终端被杀等）。
- Then：主进程应安静降级为只写日志文件；实际约 14 秒内产生 5069 条 `uncaughtException Error: EPIPE: broken pipe, write`，单日 main 日志冲到 4.7MB。

## 实际行为

electron-log console transport 写已断开的 stdout 抛 EPIPE（异步 error 事件）→ `uncaughtException` 处理器再写日志 → 再次触发 console 写 → 再次 EPIPE，形成自反馈死循环，直到进程退出或 pipe 恢复。

## 期望行为

识别到 stdout/stderr 流错误后一次性降级（禁用 console transport，仅保留文件写），日志量有界，不淹没真实诊断信息。

## 环境与失败证据

- Open Forge dev（main @ `aaf85f02e`）/ Windows 11。
- `~/.openforge-dev/desktop-app/logs/main/2026-09-28.log` 07:59:59.164 → 08:00:13.151 共 5069 条相同堆栈：`console.value → y.writeFn (main bundle) → Logger.processMessage`。
- 当日 `[error]` 级日志 5096 条中 5069 条来自该风暴，真实错误被稀释。

## 最小复现

1. dev 启动 Desktop（stdout 接管在终端 pipe 上）。
2. 主进程存活期间关闭持有 pipe 的终端/父进程。
3. 观察 main 日志 `uncaughtException EPIPE` 呈风暴式增长。

## 影响

日志磁盘占用暴涨（单日 4.7MB）、真实错误被稀释、诊断包体积膨胀；长时间挂机 dev 场景持续发生。

## 根因证据

[`diagnostics.ts`](../../apps/desktop/src/main/diagnostics.ts) `process.on("uncaughtException")` 无条件 `diagnosticsLog.error(...)`。[`logger.ts`](../../apps/desktop/src/main/logger.ts) `patchConsoleToAppLogger` 的 `inLoggerWrite` 护栏只挡同步重入；EPIPE 是底层 Socket 的异步 error 事件，在护栏外的新 tick 抛出，每轮都重新进入日志管线，循环不被切断。

## 回归测试

旧实现下：模拟 console transport 写入抛 EPIPE 后再次记录 error，日志管线被再次触发（风暴延续）；修复后首条 EPIPE 即降级 console transport，后续错误只落文件。

## 修复与验证

- 修复：见 [TASK-0131](../tasks/TASK-0131-epipe-console-transport-circuit-breaker.md)。
- 测试：
- 检查：
- 未运行及原因：
