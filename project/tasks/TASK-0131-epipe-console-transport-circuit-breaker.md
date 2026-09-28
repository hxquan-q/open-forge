---
id: TASK-0131
type: task
status: in_progress
priority: P1
owner: desktop
requirement:
plan:
source: dev 日志巡检
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0047]
execution: parallel
branch: task/TASK-0131-epipe-console-transport-circuit-breaker
worktree: ../open-forge-wt/task-0131-epipe-console-transport-circuit-breaker
base_commit: cdb15bb905f0eece45e870291a867065d29b0cac
read_paths: [apps/desktop/src/main/diagnostics.ts, apps/desktop/src/main/logger.ts]
write_paths: [apps/desktop/src/main/diagnostics.ts, apps/desktop/src/main/logger.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0131-epipe-console-transport-circuit-breaker.md, project/tasks/README.md, project/bugs/BUG-0047-epipe-uncaught-exception-log-storm.md, project/bugs/README.md]
exclusive_paths: [apps/desktop/src/main/diagnostics.ts]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0130, TASK-0132]
integration_status: pending
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# stdout pipe 断开时 console transport 熔断降级，切断 EPIPE 日志风暴

## 目标

修复 [BUG-0047](../bugs/BUG-0047-epipe-uncaught-exception-log-storm.md)：主进程 stdout/stderr pipe 断开后，`uncaughtException` → 写日志 → 再写 console → 再 EPIPE 的自反馈死循环（实测 14 秒 5069 条）。识别流错误后一次性熔断 console transport，仅保留文件写。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 Worktree）
- 可并行 Task：TASK-0130、TASK-0132（写路径不相交）
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/main/diagnostics.ts`
- Branch：task/TASK-0131-epipe-console-transport-circuit-breaker
- Worktree：`../open-forge-wt/task-0131-epipe-console-transport-circuit-breaker`
- 集成负责人：Coordinator
- 集成顺序：与 TASK-0130 / TASK-0132 任意顺序

### 做

- 在 `diagnostics.ts` 的 `uncaughtException`（必要时含 `unhandledRejection`）处理器中识别 stdout/stderr 流错误（EPIPE、ERR_STREAM_DESTROYED 等写端已毁类错误）：首次命中即把 app logger 的 console transport 关停（`transports.console.level = false`），本条及后续错误只落文件日志，并记录一条「console 镜像已熔断」的单条说明。
- 熔断后不再对同类流错误逐条全量写堆栈（去重/节流），避免文件日志也被风暴灌爆。
- 补回归测试：模拟 console transport 写抛 EPIPE，验证熔断只发生一次、后续错误不再进入 console transport。
- 发布说明写入当前版本 `.github/release-notes/v0.1.3.md`。

### 不做

- 不改变 `patchConsoleToAppLogger` 的同步重入护栏语义；不调整日志文件滚动/归档策略；不处理 renderer 侧日志；不引入外部进程守护。

## Given / When / Then

- Given：dev 模式主进程 stdout 连接终端 pipe，console transport 处于镜像开启状态。
- When：pipe 断开，后续任意日志触发 console 写抛 EPIPE。
- Then：首条 EPIPE 被记录后 console transport 熔断，后续错误仅写文件，日志量有界（不再出现千条级风暴）。

## 必须保持

- 文件日志写入路径与格式不变；非流错误类的 `uncaughtException` 仍全量记录。
- `inLoggerWrite` 同步护栏行为不变。
- 熔断仅影响当前进程的 console 镜像，不影响 ringbuffer/ipc transport 合同。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/diagnostics.test.ts`（新增用例：EPIPE 触发一次熔断；后续错误不进 console transport；非流错误不触发熔断）。
- 用户流程：dev 启动后关闭持有 pipe 的终端，main 日志不再出现 EPIPE 风暴（任务收尾人工确认一次）。
- 质量检查：`bun run check:quick`，收尾 `bun run check`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：未拆出 worktree，改动小且写路径与其他在途任务不相交。
- 剩余风险：
