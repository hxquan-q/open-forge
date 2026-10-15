---
id: TASK-0107
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0010
source: RESEARCH-0013 M6+M8（VS Code 进程拆分+bounded restart+unresponsive 栈采样对照本仓各自为政现状）
related_requirement: [REQ-0002]
related_plan: [PLAN-0010, PLAN-0002]
related_tasks: []
related_issues: [ISSUE-0020]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/app-monitor/, apps/desktop/src/main/diagnostics.ts, apps/desktop/src/main/speech-input/, apps/desktop/src/main/conversations/session-search-worker-client.ts, apps/desktop/src/main/uiohook-supervisor.ts, apps/desktop/src/main/im-host/sidecar-manager.ts, apps/desktop/src/main/browser-automation/browser-process-runner.ts]
write_paths: [apps/desktop/src/main/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0105, TASK-0108]
integration_status: pending
created: 2026-09-24
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 后台进程统一健康/重启/记账契约 + unresponsive 栈采样

## 目标

VS Code 的后台进程（sharedProcess、fileWatcher、ptyHost、extensionHost）各自独立但有**统一的崩溃治理形状**：崩溃只回本进程错误、重启有界（remote ext host 5 分钟 3 次封顶转手动提示）、unresponsive 时 `collectJavaScriptCallStack()` 采栈、进程树内存按 role 归因。Open Forge 已有多个后台执行体（speech-input `utilityProcess`、session-search Worker、uiohook、quickpanel trigger、im-host Go sidecar、browser-process-runner、plugins spawned-process），但 crash 处理、重启预算、内存归因**各自实现**。本任务建立统一契约：per-role 健康记账 + bounded restart + unresponsive 栈采样，全部挂进既有 `PerfMonitorService`。

## 范围

### 并发评估

- 结论：不支持并发——与 TASK-0105（启动相位）、TASK-0108（Disposable）同在主进程初始化与生命周期面写。
- 执行方式：serial，主工作区。
- 可并行 Task：PLAN-0011、PLAN-0012、TASK-0103/0104/0109。
- 前置依赖：无；但与 TASK-0105 同域，建议在其后或协调窗口期。
- 冲突文件/独占路径：`src/main/app-monitor/`、`diagnostics.ts`、各 worker/sidecar 的 supervisor 文件。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0010 阶段 B 内，TASK-0105 之后。

### 做

- 定义 `ProcessRoleContract`（或等价物）：每个后台进程注册 role 名、启动方式（utilityProcess/Worker/child_process/sidecar）、崩溃→重启预算（如「X 分钟内 Y 次，超限转提示」）、内存归因标签；
- 统一记账：各 role 的 `workingSetKb`/`privateKb` 与 crash/restart 计数挂进 `PerfMonitorService` 快照，诊断包按 role 归组；
- `unresponsive`/`render-process-gone` 时尝试 `webContents.mainFrame.collectJavaScriptCallStack()`（或本仓等价手段）采样 JS 栈进诊断；
- 收敛现有各进程的错误处理到同一形状：watcher 崩不拖垮 UI、sidecar 崩有界重试、worker 崩回报不静默。

### 不做

- 不拆新进程（本任务是治理契约，不是新增拆分面）；
- 不给全部进程加统一堆上限（VS Code 也不设 `--max-old-space-size`，靠隔离+预算）；
- 不改各进程的业务语义（speech-input 听写、search worker 索引等逻辑不动）。

## Given / When / Then

- Given：任一后台进程（如 session-search Worker）崩溃或持续不响应；
- When：supervisor 检测到；
- Then：按 role 契约记账（crash 计数+1、内存归因进快照）、有界重启或转人工提示、unresponsive 场景产出 JS 栈采样到诊断包；UI 不被拖垮、主进程不退出。

## 必须保持

- 既有进程的业务功能与生命周期语义不变（只加治理壳）；
- `PerfMonitorService` 快照格式向后兼容（新字段可加，旧字段不删不改语义）；
- 崩溃恢复中不得丢失用户数据（如 search worker 正在建的索引可弃，但 session 数据不动）。

## 测试与验证

- 定向测试：role 契约注册表单测、重启预算计数器、栈采样触发路径（可注入 fake webContents）；
- 用户流程：kill 一个 sidecar/worker 验证重启预算与记账、模拟 unresponsive 验证栈采样产出；
- 质量检查：`bun run check:quick`、`test:impact apps/desktop`、诊断包内容人工核对。

## 交付记录

- 实际修改：
  - 新增 `apps/desktop/src/main/app-monitor/process-health.ts`：`ProcessRoleContract`（role + 启动方式 + 可选窗口化重启预算）与 `ProcessHealthBook` 记账簿——按 role 记 crash/restart 计数、pid→role 内存归因、窗口化预算裁决（`mayRestart`）；全部 API 走 `registerProcessRole`/`recordProcessCrash` 等旁路包装，失败只降级 warn（遵循 app-monitor「监控不影响业务」约束）。
  - 接线五个后台执行体：session-search Worker（崩溃记账 + 5 分钟内 3 次重启预算由记账簿裁决，预算耗尽后新请求直接回 `search-failed` 终态事件，与崩溃同形状）、uiohook（role 注册 + crash/restart 记账，重启策略仍归其 supervisor）、im-sidecar（role 注册 + pid 归因 + crash/restart 记账，既有 backoff/budget 不变）、speech-input 宿主（utilityProcess：pid 归因 + 崩溃计数，不加自动重启）、browser-cli（短生命周期 child：运行期 pid 归因 + 进程错误计 crash）。
  - `diagnostics.ts`：`sampleJavaScriptCallStack(webContents, reason)` 在 `render-process-gone` 与 `window-manager` 的 `unresponsive` 上触发 `mainFrame.collectJavaScriptCallStack()`，产出截断至 32K 字符进诊断日志，失败仅 warn。
  - `perf-snapshot.ts`：快照新增可选 `background` 字段，按 role 带出 crash/restart/pid/预算耗尽标记；诊断包经既有 `perf-snapshot.json` 自动携带。
- 实际运行：
  - 定向测试：`process-health.test.ts`（契约注册/pid 归因/窗口预算）、`session-search-worker-client.test.ts`（崩溃→重启计数→预算耗尽→终态 `search-failed`）、`diagnostics-call-stack.test.ts`（栈采样成功/失败路径）、`perf-snapshot.test.ts`（background 字段进出）；另覆盖 uiohook、sidecar、speech、browser 域全部既有测试——im-host + browser-automation + session-search 共 27 文件 190 用例、app-monitor 等 7 文件 38 用例，全绿。
  - `bun run check:quick` 绿；`bun run typecheck`（apps/desktop）绿。
- 未运行及原因：`bun run check` 全量与真实 Desktop 冒烟（kill sidecar/worker 观察重启预算与记账、模拟 unresponsive 观察栈采样产出）——前者留待批次集成，后者需真实应用运行窗口，记入剩余风险。
- Worktree：主工作区 serial。
- 剩余风险：
  - speech-input 宿主与 browser-cli 不自动重启是刻意的（前者向调用方报会话级失败，后者短生命周期），与「有界重启或转人工提示」的兜底语义一致，但真实设备上的重启风暴抑制只覆盖了 session-search/uiohook/im-sidecar。
  - `unresponsive` 栈采样依赖 `collectJavaScriptCallStack` 真实可用性（Electron 在 renderer 卡死时仍可能采不出栈），未在真机验证；失败路径仅 warn，不扩大故障面。
  - perf-snapshot `background` 为新增可选字段，旧消费方忽略即可，无兼容性代价。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑本任务交付记录点名的四组定向套件。

| 合同条款 | 本次读数 |
|---|---|
| 按 role 契约记账（crash 计数 +1、内存归因进快照） | `process-health.test.ts`、`perf-snapshot.test.ts`（background 字段进出）通过 |
| 有界重启或转人工提示 | `session-search-worker-client.test.ts`（崩溃 → 重启计数 → 预算耗尽 → 终态 `search-failed`）通过 |
| unresponsive 场景产出 JS 栈采样到诊断包 | `diagnostics-call-stack.test.ts`（栈采样成功/失败路径）通过 |
| 合计 | **4 文件 / 21 例通过，0 失败** |

- **未覆盖**：① 交付记录里更宽的读数（im-host + browser-automation + session-search 共 27 文件 190 例、app-monitor 等 7 文件 38 例）本轮**未整体复跑**，只跑了点名的四组；② **真实崩溃/真实挂起注入**——「UI 不被拖垮、主进程不退出」与「unresponsive 栈采样」在真实挂起下成立与否，本轮未构造（需要在真实进程里制造挂起，属重型且会打断并行的 Debug 实例）。
- **关闭建议**：四组定向套件全绿、三条合同条款逐条对应用例，倾向 `done`；是否要求补一次真实进程崩溃/挂起注入，请用户裁定。
