---
id: TASK-0004
type: task
status: done
priority: P0
owner: apps/desktop/packages/runtime-core
requirement: REQ-0002
plan: PLAN-0002
source_issue: ISSUE-0003
execution: parallel
branch: forge/dev
worktree: unassigned（直接在 forge/dev 主工作区执行）
base_commit: forge/dev
read_paths: [apps/desktop, packages/runtime-core]
write_paths: [apps/desktop, packages/runtime-core]
exclusive_paths: []
depends_on: [TASK-0003]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-22
---

# Desktop Runtime 性能快照

## 目标

建立隐私安全、非阻塞的性能快照，能够区分 Main/Renderer/GPU/Heap、Provider、Tool、Compaction、EventBuffer、Queue 和 IPC 延迟。

## 必须保持

- 监控失败不能改变业务结果；
- 不保存 Prompt、文件内容、凭据或可重建私有数据；
- 空闲时低开销，活跃任务和异常时提高采样频率。

## 验收

可以用 Session/Turn 关联一次长任务，并回答主要 CPU/GPU/内存/等待瓶颈。

## 实施摘要（2026-09-22）

- `SessionInputQueue` 条目与快照新增可选 `enqueuedAt`（构造注入 `now`，旧持久化快照缺省时
  以恢复时刻回填）；`takeById` 返回完整条目，`requeue` 保留原 id 与入队时间——回滚不是新排队。
- 新增 `app-monitor/perf-snapshot.ts`（纯归约）：`SessionPerfTracker` 把 SessionEvent 流折算为
  Turn 记录（模型调用/首个 delta/工具/压缩/排队等待时长、endReason、inFlight 峰值），
  `buildPerfSnapshot` 按 Electron ProcessMetric 归类 Main/Renderer/GPU/Utility + 堆指标。
- 新增 `app-monitor/perf-monitor-service.ts`：旁路采样器随 app-monitor 生命周期启动，
  活跃 2s/空闲 30s 自适应间隔，ring buffer 180 样本 + 64 条 Turn 记录 + 累计聚合
  （含按 origin 的错误计数与事件投递滞后）；订阅与 `monitorRuntimeSession` 同生命周期，
  任何环节失败只 warn。
- 诊断导出包新增 `perf-snapshot.json`（`getPerfMonitorReport()`），采集失败不影响打包。
- 不采集进程名/窗口标题/URL/消息正文；快照只含数字与稳定 id。

### 验证

- `test/kernel/session-input-queue.test.ts`：新增注入时钟、`enqueuedAt` 快照/恢复/遗留回填、
  `requeue` 身份保留用例（连同管理测试 42/42 通过）。
- `src/main/app-monitor/perf-snapshot.test.ts`：8 用例覆盖完整 Turn 归约、aborted/error
  endReason、排队等待出队计量、activity 快照、进程归类合计与事件级聚合。
- `check:quick`、`tsgo --noEmit`（root）、`tsc --noEmit -p apps/desktop/tsconfig.json` 通过。
- 未运行：全量 `bun run check`、E2E（无 UI 变更；采样节律依赖真实运行观察）。

