---
id: TASK-0042
type: task
status: verifying
priority: P2
owner: apps/desktop
source: RESEARCH-0004 P1-8; TASK-0196 批次
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0196]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/main, apps/desktop/src/main/conversations, apps/desktop/src/main/agent-teams]
write_paths: [apps/desktop/src/main, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0196]
integration_status: pending
created: 2026-09-23
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# powerMonitor 定向清理：suspend/lock-screen 免费收缩点

## 目标

powerMonitor 目前只用 resume 信号（auth/updater/pet-idle-guard）。suspend/lock-screen 是「用户必然无感」的免费清理点：对非热窗口做主动收缩——idle 会话降级驱逐、此刻一次性 working-set trim（唯二被认可的 trim 时机），resume 时懒回填。

## 范围

### 并发评估

- 结论：支持——主进程生命周期 + 驻留管理，与其他任务无写路径交集；P2 防御性收益，排队即可。

### 做

- suspend/lock-screen 事件 → 非热驻留收缩（idle resident 降级、隐藏 webview/窗口内容驱逐）；
- 仅在此刻允许一次性 working-set trim（RESEARCH-0004 否决项的唯一例外窗口）；
- resume → 懒回填，不在 resume 路径做同步重建；
- suspend/唤醒前后 PerfMonitor 快照记录峰谷差。

### 不做

- 不做定时/空闲主动 `EmptyWorkingSet`（伪优化，仅在 suspend/lock 事件点例外）；
- 不改磁盘持久化与驻留上限参数；
- resume 后不阻塞首帧。

## Given / When / Then

- Given：应用开着多个会话与隐藏窗口
  When：系统 suspend 或锁屏后解锁
  Then：锁屏期间非热驻留被收缩，resume 后按需懒回填；用户无感、无数据丢失、无交互卡顿

## 必须保持

- 收缩只释放热驻留/隐藏进程，不动持久化；
- resume 路径懒加载，不引入同步重建停顿；
- 驱逐对象均可透明重建（URL/状态已在 atom 或磁盘）。

## 测试与验证

- 定向测试：模拟 suspend/lock-screen 事件后驻留计数与进程计数断言；
- 用户流程：多会话+浏览器页签开着→锁屏→解锁→继续操作无感；
- 质量检查：`check:quick`；PerfMonitor suspend 前后快照对比。

## 交付记录

### 2026-10-03 范围核对（TASK-0196 批次开工前）

对照现行实现调整三项范围，依据为源码事实而非状态标签：

- **idle 会话降级驱逐已由架构默认实现**：`packages/runtime-desktop/src/backend-pool.ts` 的 `releaseAssembly` 在 `liveAssemblies` 归零时即时销毁 composition 与 MCP scope；非运行会话不驻留后端，无需新增驱逐路径（retain 既有行为）。
- **隐藏 webview/窗口内容驱逐**：浏览器页签（WebContentsView）当前没有卸载/驱逐 API；该能力属 TASK-0039（面板收起卸载）与浏览器域，不在本任务新增。
- **本任务落地核心**：suspend/lock-screen 事件点对主进程自身做一次性 working-set trim（win32，经 koffi 调 `EmptyWorkingSet`，非 Windows 跳过），前后记录主进程 workingSet 峰谷差；resume/unlock 仅观测不重建。与 RESEARCH-0003/0004 的「唯二认可 trim 时机」一致，不做任何定时/空闲 trim。

- 实际修改：
  - 新增 `apps/desktop/src/main/app-monitor/power-trim-service.ts`：依赖注入电源事件源/读数/trim 的旁路服务；`suspend`/`lock-screen` 在 win32 经 koffi（`psapi.dll!EmptyWorkingSet` + `kernel32.dll!GetCurrentProcess`，懒加载、失败缓存并仅告警一次）裁剪自身工作集并记录 `beforeKb/afterKb/deltaKb`；`resume`/`unlock-screen` 仅观测；同一事件源幂等 start，`dispose()` 摘除全部监听。
  - `apps/desktop/src/main/main.ts`：app ready 后接线 `startPowerTrimService(powerMonitor)`（与 App Monitor 同段，纯旁路）。
  - `.github/release-notes/v0.1.3.md` 追加一条。
- 实际运行：
  - 红测先行：新模块缺失时 `apps/desktop` 定向 7 例失败于模块解析（目标行为失败源）。
  - `bun run --cwd apps/desktop test -- src/main/app-monitor/power-trim-service.test.ts`：7/7 通过。
  - `bun run check:quick -- <三个变更文件>`：通过（Biome 修正两处换行后）。
  - `bun run test:impact -- <三个变更文件>`：直接 7/7 + desktop related 7/7，通过。
- 未运行及原因：
  - 真实 suspend/锁屏的实机峰谷差与 koffi 调用：未启动真实 Desktop（本批不做视觉/实机验证，模型无视觉）；以日志字段合同与单测覆盖，实机数值待用户验收。
  - `verify:ui:*`：未授权且不适用（无 UI 变化）。
- 剩余风险：
  - `EmptyWorkingSet` 只减工作集不减 commit（RESEARCH-0003 结论），收益是驻留数字与换出时机，不是容量释放；实机效果未量化。
  - 事件点与 pet-idle-guard 等其他 powerMonitor 订阅方互不影响（各自独立监听）；若未来 Electron 改事件语义需复跑本测试。
