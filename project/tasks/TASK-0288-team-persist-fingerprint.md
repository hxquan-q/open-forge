---
id: TASK-0288
type: task
status: done
priority: P1
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0283]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: b5ab0979d
read_paths:
  - apps/desktop/src/main/agent-teams/team-session-state-repository.ts
  - packages/agent-team/src/contracts.ts
write_paths:
  - apps/desktop/src/main/agent-teams/team-session-state-repository.ts
  - apps/desktop/src/main/agent-teams/team-session-state-repository.test.ts
exclusive_paths:
  - apps/desktop/src/main/agent-teams/team-session-state-repository.ts
  - apps/desktop/src/main/agent-teams/team-session-state-repository.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队 persist() 比较降本：指纹缓存消除双重全量序列化（BUG-0127 修复路线 4）

## 目标

`TeamSessionStateRepository.persist()` 在团队长任务期间被高频调用（`team-session-service.ts` 十余处 + 成员调度/迁移/发布流）。当前每次调用对整份 `TeamSessionDocument` 做双重 `JSON.stringify` 全量比较（`:70`），并 O(entries) 反向扫描找最新状态条目。TASK-0283 已让读路径缓存化后，这是 persist 链路上剩余的主要 CPU/分配热点（BUG-0127 报告 §5 路线 4）。

引入按 coordination 会话的指纹缓存：记住本仓库最后追加（或核对）成功的状态条目对应的协调文档 `revision` 与当时的序列化串。revision 未变 ⇒ 磁盘最新状态条目仍是我们写的那条 ⇒ 只需序列化当前 session 一次与缓存串比较，未变则跳过追加（也免去 O(entries) 扫描）；revision 变化（外部/其他 custom.append）回退既有双序列化精确比较。语义与旧实现逐场景等价，热路径序列化次数 2→1、扫描 O(n)→O(1)。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无（TASK-0283 已合入是收益前提，非正确性前提）
- 冲突文件/独占路径：`team-session-state-repository.ts` 及其新测试
- Branch：`main`
- Worktree：不拆出（单文件切片，无并行写者）
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- `persist()` 指纹快路径 + 冷路径回退（完整保留旧比较逻辑）。
- `remove()` / `removeCached()` 同步丢弃指纹。
- 新增 `team-session-state-repository.test.ts`：未变跳过追加、变化追加、revision 变化回退精确比较、removeCached 后重走冷路径、热路径单次序列化（旧实现红：2 次）。

### 不做

- 不依赖 `TeamSessionDocument.revision`/`updatedAt` 字段做判等（无法约束所有变更方递增）。
- 不改 `appendSessionMetadataEntry` 合同（仍 `Promise<void>`）。
- 不动 BUG-0127 路线 3（命令谓词索引化）、路线 5（渲染投影）、路线 6（IPC 序列化）。

## Given / When / Then

- Given：本仓库上次 persist 后协调文档 revision 未变，When：persist 同一 session，Then：不追加条目，且只发生一次 `JSON.stringify`（旧实现两次）。
- Given：同上但 session 内容变化，When：persist，Then：追加 `agent-team.session-state.v1` 条目并刷新指纹（含新 revision）。
- Given：revision 已被其他 custom.append 推进（外部状态条目或其他自定义条目），When：persist，Then：回退对最新条目的双序列化精确比较，行为与旧实现一致（相同则不追加，不同则追加）。
- Given：`removeCached`/`remove` 后再次 persist，When：session 与磁盘最新条目相同，Then：冷路径核对后不追加。

## 必须保持

- 追加决策与旧实现逐场景等价：指纹仅是「磁盘最新状态条目 = 我们写入的那条」的保守判定（custom.append 必然推进 document revision），任何不确定性回退精确比较。
- `persist()` 末尾 `registerOwnership` + `this.set(session)` 顺序与语义不变。
- 协调会话不可用时抛错语义不变；数据源仍为内存投影（与旧实现一致，不新增磁盘读）。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/agent-teams/team-session-state-repository.test.ts`。
- 质量检查：agent-teams 相关套件 + 完整 `bun run check`。

## 验收分层

- 工程验证：通过；定向 5/5（含热路径单序列化断言，红基线先行验证：旧实现下「expected 1, got 2 times」）；agent-teams 全目录 235 例通过（`plugin-agent-presets` 收集期红为 cwd 依赖的既有夹具问题，从 `apps/desktop` 目录复跑 21/21 绿，与本改动无关）；完整 `bun run check` 见下方回填。
- 技术评审：自审；指纹失效路径逐场景复核（revision 推进 ⇒ 冷路径；remove/removeCached ⇒ 丢指纹；追加后重读精确 revision 不预测）。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：随 BUG-0127 用户侧长任务复测一并覆盖。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：桌面端团队会话正常运行（persist 被 20+ 调用点高频触发）。
- 预期行为：无可见行为变化；CPU 采样中 persist 链路的双重 stringify 热点消失。
- 不通过表现与已知限制：指纹仅覆盖本进程写入；跨进程并发写状态条目回退冷路径（正确但少收益）。

## 交付记录

- 实际修改：`team-session-state-repository.ts` 增 `persistedFingerprints`（session id → {coordinationRevision, serializedSession}）；`persist()` 拆热/冷路径（热路径单次序列化 + 跳过 O(entries) 扫描，冷路径保留旧精确比较，追加后重读投影记录精确 revision）；`remove()`/`removeCached()` 同步丢弃指纹；新增 `team-session-state-repository.test.ts` 5 例。
- 实际运行：定向 5/5 绿；旧实现红基线确认（热路径 stringify 断言 expected 1 got 2）；agent-teams 目录 235 例绿 + `plugin-agent-presets` 从包目录复跑 21/21 绿（收集期红为该测试 cwd 依赖，非本改动）；完整 `bun run check` exit 0（lint、五路 typecheck、全部 guards 含 project-indexes 与发布说明校验）。
- 未运行及原因：真实 Desktop 长任务 CPU 采样前后对照待用户侧复测（随 BUG-0127 人工验收一并覆盖）。
- Worktree：未拆出（serial 小切片，无并行写者）。
- 剩余风险：指纹仅覆盖本进程写入；跨进程并发写状态条目回退冷路径（正确但收益少）；热路径跳过扫描依赖「custom.append 必然推进 document revision」这一内核不变量。
