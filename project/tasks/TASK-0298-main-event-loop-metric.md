---
id: TASK-0298
type: task
status: done
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002, PLAN-0010]
related_tasks: [TASK-0107]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 03acc9df4
read_paths:
  - apps/desktop/src/main/app-monitor/
write_paths:
  - apps/desktop/src/main/app-monitor/main-event-loop-monitor.ts
  - apps/desktop/src/main/app-monitor/main-event-loop-monitor.test.ts
  - apps/desktop/src/main/app-monitor/perf-snapshot.ts
  - apps/desktop/src/main/app-monitor/perf-monitor-service.ts
exclusive_paths:
  - apps/desktop/src/main/app-monitor/perf-monitor-service.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# perf 快照补主进程事件循环阻塞指标（BUG-0127 验收配套）

## 目标

BUG-0127 复测清单第 3 步目前只能手工 DevTools Performance 采样主进程长任务。perf 快照（诊断包 `perf-snapshot.json`）缺主进程事件循环阻塞指标——补一个旁路轻量监测器，让复测「导出诊断包即得数」，并为后续回归提供常驻观测。

**机制**：链式 `setTimeout`（缺省 250ms，相对上次调度时间排程避免连续块双计）；回调测量 `now - 预期时刻` 的滞后，≥ 阈值（缺省 500ms）记一次阻塞窗口（次数/最大/最近毫秒数）；> 60s 的窗口视为休眠/系统挂起不计。聚合数字只含毫秒与次数，无用户内容（app-monitor 旁路规则全合规：可失败降级 warn、轻量内存计数、可释放）。

## 范围

### 并发评估

- 结论：不支持并行；serial；app-monitor 模块内切片。

### 做

- 新增 `main-event-loop-monitor.ts`（可注入 now/interval/threshold/maxWindow；`recordWindow` 纯方法可测）+ 单测（超阈计数、休眠窗口忽略、连续块不双计、stop 后停止）。
- `PerfAggregates` 增 `eventLoop` 聚合；服务持有并随采样周期折算；诊断包字段自动带上（`getPerfMonitorReport` 直通）。
- BUG-0127 复测清单第 4 步升级为「导出诊断包即含主进程阻塞计数」。

### 不做

- 不做渲染进程长任务指标（Chromium 侧已有 trace 工具，主进程是盲区才是本片价值）。
- 不改采样节奏与既有聚合语义。

## Given / When / Then

- Given：主进程被同步阻塞 >500ms 的窗口发生，When：读取报告，Then：`aggregates.eventLoop.overruns` 增加、`maxOverrunMs` 反映阻塞时长量级。
- Given：系统休眠后恢复（窗口 >60s），When：读取，Then：不计入阻塞。
- Given：服务 shutdown，When：监测器，Then：定时器释放。

## 必须保持

- app-monitor 旁路规则（失败只 warn、不进业务路径、无用户内容、可释放）。
- 既有 perf 快照字段与采样节奏不变（新增字段为纯增量）。

## 测试与验证

- 定向：monitor 单测 + app-monitor 既有套件；完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（链式调度不双计、休眠滤波）；集成：pending；人工验收：随 BUG-0127 复测一并（导出诊断包回贴 eventLoop 读数）；发布：未授权。

## 功能验收包

- 长任务运行期间导出诊断包，`perf-snapshot.json` 的 `aggregates.eventLoop` 直接给出主进程阻塞窗口计数与量级；无 UI 变化。

## 交付记录

- 实际修改：新增 `main-event-loop-monitor.ts`（链式 250ms 窗口、500ms 阈值、60s 休眠滤波、可注入 now、unref 定时器）与 4 例单测；`PerfAggregates` 增 `eventLoop` 聚合（纯增量字段）；`perf-monitor-service.ts` 持有监测器（initialize 启动 / shutdown 释放 / sample 周期折算，各步 try-catch 降级 warn）。
- 实际运行：app-monitor 目录 6 文件 33 例全绿（含新 4 例：超阈计数含 drift=阻塞−间隔语义、休眠窗口忽略、连续块单窗口归属、stop 停摆）；完整 `bun run check` exit 0（首轮仅导入排序红）。
- 未运行及原因：真实 Desktop 长任务下 eventLoop 读数与 DevTools trace 的交叉对照随 BUG-0127 复测一并（导出诊断包即含新字段）。
- Worktree：未拆出（app-monitor 模块内切片）。
- 剩余风险：drift 含定时器调度噪声（阈值 500ms 远高于噪声量级）；阻塞恰落在窗口边界会被拆成两窗（计数语义为窗口数非任务数，作量级与趋势观测足够）。
