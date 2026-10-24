---
id: TASK-0402
type: task
status: verifying
priority: P1
owner: apps/desktop/agent-teams
requirement: REQ-0002
plan: PLAN-0024
source: TASK-0395 probe / TeamNotificationJournal 全量扫描
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0395, TASK-0396]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0402-notification-journal-projection
worktree: ../open-forge-wt/task-0402-notification-journal-projection
base_commit: 1584b54dfd6db56ee49d070d652b886705355e4d
read_paths: [apps/desktop/src/main/agent-teams/, packages/agent-team/]
write_paths: [apps/desktop/src/main/agent-teams/team-notification-journal.ts, apps/desktop/src/main/agent-teams/team-notification-journal.test.ts]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-notification-journal.ts]
depends_on: []
conflicts_with: [TASK-0395, TASK-0396, TASK-0154]
integration_status: pending
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Team 通知 journal 的重复全历史扫描

## 目标

`TeamNotificationJournal` 每次 `isStopped/pending/contexts/record` 都遍历协调文档全部 entries 重建通知表，且 `contexts` 还为每条通知再全量 `find` 一次结果条目。TASK-0395 的 Store 投影缓存不覆盖这条路径。目标：让一次排空循环的全历史扫描次数从 4 次以上降到 1 次，不改通知语义。

## 范围

条件支持并行（独立 Worktree、单写者），与 0395/0396 有写范围邻接，串行集成。输入为既有协调文档与 journal 公共方法；输出为等价的 journal 结果与有界扫描次数。

做：为同一文档快照按对象身份 + revision + entries 长度/首末 id 记忆化“通知表”与“结果条目索引”，供 isStopped/pending/contexts/record 共享；保持 `read()` 的“后写覆盖 + 首次插入顺序”。

不做：不改 journal 记录格式、notificationId 语义、stop 标记语义、恢复扫描间隔；不改 Store 的投影缓存；不引入跨 session 缓存。

## Given / When / Then

- Given 长历史协调文档（512 任务），When 一次排空循环执行 isStopped→pending→contexts，Then 全量 entries 遍历 ≤1 次且结果与旧实现逐字段一致。
- Given 同一文档被原地追加并推进 revision，When 再次查询，Then 看到新通知，不返回陈旧列表。
- Given 停止标记与 cancelled 通知，When pending/contexts，Then 过滤结果与旧实现一致。

## 必须保持

notificationIds 是持久准入凭据；`pending` 对 workItems 当前 revision/归属的校验；`contexts` 的文本结果与 notificationId 注入；stop 后不复活；`record` 的去重与 cancelled 追加语义。

## 测试与验证

新增等价差分测试（同一 fixture 对比缓存前后路径，逐字段）；覆盖追加、替换、原地改写、停止/恢复、cancelled 过滤、缺失结果条目。定向 `run-vitest`（desktop agent-teams）、`test:impact`、完整 `bun run check`。基准 `.auto/journal-probe.mjs`（本 Task 内、不入库）报告扫描次数与耗时。

## 已知基线（TASK-0395 探针，2026-10-24）

`.auto/journal-probe.mjs`：60 次排空循环，short(16 任务) 3.26ms、mixed(128) 37.3ms、long(512) **493.6ms**。当前实现每循环至少 4 次全量 entries 扫描 + 每条通知一次结果条目全量 find。未做交错 A/B，仅定位。

## 验收分层

工程验证待执行；技术审查待执行；集成 pending；内部行为保持型优化人工验收不适用；发布未授权。

## 交付记录

- 实际修改：Task 合同先行。
- 实际运行：仅 grep 与探针测量，未改生产代码。
- Worktree：待创建。
- 剩余风险：缓存键必须覆盖“同 revision 不同内容”，否则会返回陈旧通知。
