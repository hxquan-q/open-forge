---
id: TASK-0395
type: task
status: done
priority: P1
owner: apps/desktop/agent-teams
requirement: REQ-0002
plan: PLAN-0024
source: user-request / TeamCollaborationStore.readFromDocument
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0396, TASK-0397]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0395-team-state-projection-performance
worktree: unassigned（已集成，待推送后清理）
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [packages/runtime-core/, packages/agent-team/, apps/desktop/src/main/agent-teams/, project/]
write_paths: [apps/desktop/src/main/agent-teams/team-collaboration-store.ts, apps/desktop/src/main/agent-teams/team-collaboration-projection.ts, apps/desktop/src/main/agent-teams/team-collaboration-projection.test.ts, apps/desktop/src/main/agent-teams/team-collaboration-store.test.ts, apps/desktop/scripts/team-state-projection.bench.mjs, apps/desktop/scripts/team-state-projection.bench.ts]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-collaboration-store.ts]
depends_on: []
conflicts_with: [TASK-0396, TASK-0154]
integration_status: integrated
created: 2026-10-23
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Team 协作状态投影性能

## 目标

降低同一协调文档被调度/上下文/通知重复读取时的全量重放成本；先锁定混合基准和全量 oracle，再做最小缓存或必要投影接缝。属于 Upstreamable 内部优化，不改变持久化/公开模型语义。

## 范围

### 并发评估

条件支持：本 Task 独立 Worktree 由 Coordinator 单写，与只读研究并行；TASK-0396/0397 生产修改串行。基线为已提交 main，主检出他人修改不拷贝。共享 Project/发布说明由 Coordinator 维护并随交付带入候选，不交给 Worker 并写。

- Branch：`task/TASK-0395-team-state-projection-performance`
- Worktree：`../open-forge-wt/task-0395-team-state-projection-performance`
- 集成次序：研究证据回收 → 0395 → 0396 → 0397；main 脏则保留分支不强行集成。

### 做

- 通过正常 Store 方法和文档投影入口构造合成工作负载：混合历史、重复热读、追加修订、冷恢复；独立留出规模/种子。
- 保留基线全量结果 oracle；测量后比较弱键文档缓存与增量索引，首选最小可证明正确方案。
- 覆盖文档替换、相同 revision 不同对象、内容追加、各类记录去重、畸形输入校验和旧返回值稳定性；生命周期不新增强全局缓存。
- 最终覆盖既有 enqueue→begin→settle→retry/cancel 与通知/共享上下文用户流程。

### 不做

不改校验/持久格式/稳定 ID、不截断记录，不动 Prompt/模型/并发窗口，不新增依赖，不声明 Fake Provider 能证明真实模型质量。

## Given / When / Then

- Given 已有多成员任务与长历史，When 查询/分派/结算/续跑后继续查询，Then 返回值逐字段与全量重放一致，热读成本下降。
- Given 文档替换/恢复或相同 revision 不同内容，When 再投影，Then 不返回其他快照/会话缓存。
- Given 消费者保留旧结果，When 后续记录追加，Then 旧返回值不被新投影修改。

## 必须保持

Conversation 唯一事实源；边界结构校验、最新同 ID 覆盖与迭代顺序、任务乐观修订、通知幂等、权限/取消/usage/stop 全不变。缓存不能无限持有历史文档。

## 测试与验证

- 定向：新差分测试、team-collaboration-store、team-notification-journal、team-session-concurrency、team-member-context。
- 基准：`apps/desktop/scripts/team-state-projection.bench.mjs`，先生成固定混合负载、正确性门槛与留出集；输出 METRIC，主指标 `team_state_ms`，lower；分项冷读/热读/追加与噪声同时报告。
- 验证：`bun scripts/quality/run-vitest.mjs --run <tests>`、`bun run test:impact -- <files>`、`bun run check:quick -- <files>`、最终 `bun run check`。
- 自动实验只在干净隔离 Task 工作树使用 run_experiment/log_experiment；改 benchmark 语义即重置基线，禁止只为改善分数调权重。

## 验收分层

工程验证：通过（投影合同 14 例 + 相关 44 例 + impact related 177 例 + 完整 check + 失效规则变异测试）；新上下文只读技术审查：已完成（无 P1/P2，3 项 P3 已处理/记录）；集成：pending（主检出脏，候选分支保留）；内部行为保持型性能任务人工验收不适用；真实体感/模型收益未测；发布未授权。

## 功能验收包

入口：团队已有任务继续委派、查看状态、等待结果并恢复会话。预期：结果与顺序一致，长历史下软件开销下降（实测比值约 9–12×）。失败：陈旧状态、丢任务、重复通知或取消后复活。基准不代表端到端模型加速。

## 交付记录

- 实际修改：隔离 Worktree 已有固定基准与投影合同测试；生产代码改动为同一文档快照的七类投影缓存（每次仍返回新数组）。
- 实际运行：既有 Store/journal 15 例通过；投影合同+Store 19 例通过（缓存前）；最终投影合同 13 例 + 相关 5 文件 42 例，`test:impact` 直接 12 例、related 14 文件 175 例通过；完整 `bun run check` 通过。原生研究 actor `6c5db759-f91f-483` 负责 TASK-0394，内核只读调查 actor `f4532216-fafe-4c9` 负责 TASK-0397 输入；二者不写本 Task 代码。
- Worktree：CLI 已创建，目标 `worktree:check` 通过；独立 `bun install --frozen-lockfile` 安装成功。全量 worktree:check 发现基线 TASK-0344–0347 缺日期（非本任务）、历史 worktree 缺失及与已集成 TASK-0154 的保守范围重叠；已登记 0154 关系，历史严格日期准入见 WAIVER-0006，目标 Task 门禁必须通过。
- 阻断：主检出 `.auto/config.json` 在本会话调查期间被其他会话切为 `task-0392-browser-agent-tabs`，当前工具没有 per-call workingDir；自动 keep/discard 会碰错分支，未覆盖该指针、未调用实验工具。需从本 Task Worktree 启动实验会话，或明确协调占用者停止后再切换。用户要求“继续”未被解释为授权覆盖其他 Agent 工作。
- 已核实：RuntimeSessionProjection.apply/replaceDocument 替换文档身份、readDocument 返回同快照；readonly 不等于深冻结，未来缓存需保护输入/旧返回值隔离，并测试同 revision 不同对象。
- 性能读数（手工交错 A/B，本树内直跑，未使用共享实验工具；baseline = 提交 fc272b5b8 的 Store，candidate = 本次缓存）：主场景 6 轮交错，baseline 中位 210.65ms / candidate 中位 23.56ms（约 8.9×）；分项 short 1.79→0.35、mixed 34.42→3.63、long 166.57→19.62。留出集 4 轮：339.30→27.32ms（约 12.4×）。基线复测漂移 172–264ms（同一机器负载差异），故只报比值与区间，不当绝对 SLA。最终 candidate 单跑 28.8–34.2ms。
- 独立审查（actor `cf8dec9d-9e59-4f0`，新上下文只读）：无 P1/P2 阻断，确认生产写路径均新建文档并递增 revision；指出 3 项 P3：(a) 一处 `not.toBe` 恒真断言已删除并换成“把限制写成合同”的用例，(b) `cloneState` 只浅拷数组、元素仍是持久记录引用，调用方改元素属性会污染缓存（与优化前语义相同，已写入合同），(c) WeakMap 键为活跃文档，旧文档可回收，无历史无限增长；接受建议保留读取方只读约束。
- 变异验证：临时去掉 revision/长度/首末 id 校验后投影+Store 26 例中 2 例失败（“同对象原地追加”与“revision 推进的中间改写”），恢复后 14/44/177 例全绿——证明失效规则真的被测试保护，而非恒真断言。
- 最终实测：投影合同 14 例、相关 5 文件 44 例、`test:impact` related 14 文件 177 例全部通过；完整 `bun run check`（lint/types/guards/mobile）全绿。
- 收益边界：增益与“同一快照被重复读取”次数成正比；每快照只读一次时收益接近冷投影开销。基准只证明状态读取，不代表端到端模型任务加速。
- 失效规则：按文档对象身份 + revision + 条目数 + 首末 id 校验；测试覆盖同对象原地追加、替换文档、无效尾记录、旧结果隔离。已知限制：若宿主**原地改中间条目且不推进 revision 或首末 id**，缓存会返回旧值；当前生产写入路径（`applyStoredEventToConversationDocument`）每次新建文档并递增 revision，未发现该写法。
- 阻断解除：共享实验指针问题不再影响本片——改用手工交错 A/B（脚本在 `.auto/ab/`，不进仓库）。本树 `bun run check` 与 `test:impact` 全绿，可交付评审。
- 剩余风险：合成状态读取基准，不代表端到端 Agent 加速；cold 读无回归但样本少；未跑跨平台与真实 Desktop；未集成到脏 main；通知 journal 的重复扫描未纳入本片。

### 集成记录（2026-10-24）

集成提交 62359876f；test:impact related 177 例通过，完整 check 全绿。
