---
id: BUG-0047
type: bug
status: done
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
updated: 2026-10-07
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

- 修复：见 [TASK-0131](../tasks/TASK-0131-epipe-console-transport-circuit-breaker.md)（集成提交 `66c7ee464`，merge `ebb973433`）。`diagnostics.ts` 识别 EPIPE/ERR_STREAM_DESTROYED/ERR_STREAM_WRITE_AFTER_END，首条即熔断 console 镜像（`disableConsoleLogMirroring()`），后续同类错误按每 500 条汇总；非流错误路径不变。
- 测试：`diagnostics.test.ts`（新增 4 例）——首条 EPIPE 熔断且错误仍落文件、后续流错误有界汇总、非流错误不熔断、unhandledRejection 同路径。
- 检查：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/diagnostics.test.ts`（4 passed）；批次 `test:changed --base origin/dev` 与 `check` 由 Coordinator 统一执行。
- 未运行及原因：「关闭持有 pipe 的终端」人工冒烟未执行，保持 verifying。

### 人工复现与验收（2026-10-07）

按上文「最小复现」实跑一次，但用一次性 VETTA_HOME 起临时 dev 形态实例，把主进程 stdout 接进 `| head -c 1200`（读端读满即关，等价于终端被关掉），避免动隔离 Debug profile 与用户 dev 目录：

- 断管后 1.5 秒写下**首条**（也是全程唯一一条）`[error] [diagnostics] uncaughtException Error: EPIPE: broken pipe, write`，堆栈与修复前一致（`console.value → writeFn → Logger.processMessage → Socket._write`）。
- **1 毫秒后**写下 `[warn] [diagnostics] stdio stream write failed; console log mirror disabled for this process`，此后主进程继续正常启动（`[window] create`、技能 102 条、runtimes applied），**没有退出**。
- 量级：整份 main 日志 **392 行**（对照修复前 14 秒 5069 条），`uncaughtException` 1 条、`EPIPE` 1 条；熔断后仍有 180 行业务日志照常落文件，这 180 次镜像未再触发任何 EPIPE 或 uncaughtException——风暴回路确已切断。
- 复现时的环境提示：harness 的 `verify:ui:start` 会把主进程 stdout 接进日志**文件**（且中间有 `concurrently` 中转），照常启动**永远等不到**本例；必须自己起实例、自己接管道。证据留存 `<artifactDir>\0131-epipe-main-log-2026-10-07.log`。
