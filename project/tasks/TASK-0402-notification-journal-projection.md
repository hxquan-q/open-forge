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

工程验证：通过；技术审查：未执行独立审查（自审 + 变异/差分测试）；集成 pending；内部行为保持型优化人工验收不适用；发布未授权。

## 交付记录

### 实际修改

`apps/desktop/src/main/agent-teams/team-notification-journal.ts`：

- 新增实例级 `WeakMap<ConversationDocument, {revision, length, firstId, lastId, index}>`，一次遍历同时得出 stop 标记、通知表（后写覆盖 + 首次插入顺序）与 `entriesById` 结果条目索引。
- `isStopped` / `pending` / `contexts` / 私有 `read` 全部改用该索引；`pending` 的 workItems 关联改为 Map 查找（原为每条通知一次 `find`）。
- 失效签名与 TASK-0395 的 Store 缓存一致：对象身份 + revision + entries 长度 + 首末 id，覆盖整对象替换、恢复 replaceDocument 与测试内的原地 push。

`apps/desktop/src/main/agent-teams/team-notification-journal.test.ts`：新增 4 例（stop→resume 失效、异快照隔离、cancelled 过滤、已接收通知剔除），并保留原有 3 例。

### 实际运行

- 定向：`team-notification-journal.test.ts` 7 例通过。
- `bun run test:impact -- apps/desktop/src/main/agent-teams/team-notification-journal.ts`：related 13 文件 **159 例通过**。
- 完整 `bun run check`：lint / types(root,cli,desktop,docs,mobile) / guards / mobile lint 全绿，ratchet new=0。
- 交错 A/B（`.auto/ab.mjs`，同一 512 任务文档，60 次排空循环，预热点，6 轮交错取中位）：
  - 旧实现 160.26ms → 新实现 29.21ms（5.49×）；
  - 复跑一轮 357.41 → 56.33（6.35×，机器负载偏高，比值稳定）；
  - 单进程探针（`.auto/journal-probe.mjs`）：493.6ms → 26.9–27.9ms（long 场景 60 循环）。

### 未运行及原因

真实 Provider / Desktop UI 未授权；跨平台未跑；未做独立技术审查（本片为同一模式的第二次应用，已用差分用例与交错 A/B 自证）。

### 已知限制

与 TASK-0395 相同：若宿主原地改写中间条目且 revision 与首末 id 均不变，缓存返回旧值；生产写路径不存在该形态。`entriesById` 会为快照保留一份条目索引，内存与文档同阶、随旧文档回收。

### Worktree

CLI 从 main@1584b54df 创建 `../open-forge-wt/task-0402-notification-journal-projection`，独立 frozen-lockfile 安装；目标 `worktree:check` 通过。此前误把四个 README 平铺复制到 `project/README.md`，已用 `git checkout -- project/README.md` 恢复，并移除误带入的 PLAN-0022/0023 索引行。

### 剩余风险

基准是合成状态读取，不代表端到端任务加速；收益与“同一快照被多次查询”的频次成正比。
