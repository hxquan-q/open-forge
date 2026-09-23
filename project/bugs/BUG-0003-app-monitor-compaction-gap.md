---
id: BUG-0003
type: bug
status: done
priority: P1
owner: apps/desktop/app-monitor
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\app-monitor\summary.json and desktop logs
created: 2026-09-22
updated: 2026-09-22
---
<!-- Copyright The Open Forge contributors. -->

# App Monitor 漏记 Compaction

## 实际行为

主日志存在多次 Context Compaction 和一次失败，但 App Monitor 汇总中的 compaction started/succeeded/failed 都为 0。

## 期望行为

主流程事件与聚合统计应可解释地一致；如果采集不覆盖 Team/某 Runtime 路径，应明确标记覆盖边界。

## 根因

`compactions` 计数挂在 `monitorRuntimeSession()` 的逐会话 `runtime.subscribe` 路径上
（`apps/desktop/src/main/app-monitor/app-monitor-service.ts` 的 `recordSessionEvent`），
而 Agent Team 成员/协调会话由 `TeamRuntimeManager` / `TeamRuntimeRestorer` 直接走
`RuntimeHost.createSession`，从不调用 `monitorRuntimeSession`——这些会话的压缩只进了
`sessionCompactionObserver` 驱动的结构化日志，没有进汇总。同一事件存在「会话订阅」与
「宿主观察口」两套覆盖口径，前者必然漏记非监控会话。

## 修复

- `recordRuntimeCompaction(event)` 新增为压缩计数入口，由 RuntimeHost 的
  `sessionCompactionObserver` 驱动（`apps/desktop/.../agent-runtime/composition.ts` 中
  与 `createRuntimeSessionCompactionLogger` 组合：先计数后日志，relay 级异常隔离不变）。
- `recordSessionEvent` 会话订阅路径删除 `compaction.start` / `compaction.end` 两个
  case，同一事件不再双算。
- 覆盖边界：宿主观察口对所有 `createSession` 产生的已挂载会话生效（交互、批量、定时、
  Agent Team 成员/协调）；其余指标（sessions/turns/tools/usage/errors）仍依赖
  `monitorRuntimeSession` 入口，Team 会话不覆盖这些项属于既有边界，不在本 Bug 范围。

## 回归测试

`apps/desktop/src/main/app-monitor/app-monitor-service.test.ts`（fake store + fake
Runtime subscribe）：

- 未经 `monitorRuntimeSession` 的会话（Team 路径复现）start/success/failure 正确累计；
- 同一事件流经会话订阅与宿主 observer 时不双算（旧实现会失败）；
- `errorMessage` 等压缩载荷不进入监控数据（不落用户内容）；
- `shutdown` flush 后持久化 summary 与导出快照一致，`normalize` 重载后计数不丢，
  月度日桶之和与汇总相等（聚合、重启恢复、诊断导出同口径）。

## 验证记录

- 新增测试 4/4 通过；`app-monitor-data` / `perf-snapshot` / `composition-boundary` /
  `desktop-conversation-service` / `running-changed-reason` 等相关测试共 43 项通过。
- `tsc --noEmit -p apps/desktop/tsconfig.json` 对本改动文件零诊断（仅并行工作区
  `packages/coding-agent/.../child-handle.ts` 的 WIP 报错 2 项，与本修复无关）。
- `check:quick` 对本改动文件通过；仓库全量 `test:impact`/`check` 在验证时被同一处
  并行 WIP（BUG-0002 子代理终态改造）阻塞构建，待其完成后重跑。
- `runtime-host-capabilities` 与 `cli-runtime-canary` 在本环境缺 Electron 二进制无法
  收集，属环境限制，非本次回归。
