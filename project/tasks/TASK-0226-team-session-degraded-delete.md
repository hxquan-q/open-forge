---
id: TASK-0226
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0087（team 会话 coordination 文档损坏/丢失后 delete-session 同样失败，僵尸会话无法清理）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087]
execution: serial
branch:
worktree:
base_commit: 254796d87
read_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts, apps/desktop/src/main/agent-teams/team-session-repository.ts, apps/desktop/src/main/agent-teams/team-session-state-repository.ts, apps/desktop/src/main/conversations/conversation-ownership-catalog.ts]
write_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts, apps/desktop/src/main/agent-teams/team-session-delete.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0087-team-session-delete-unloadable.md, project/tasks/TASK-0226-team-session-degraded-delete.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# team 会话降级删除：coordination 文档读不出时仍清理索引、运行时与状态

## 目标

`deleteSession` 第一步 `await this.read(...)` 失败即整体放弃——用户面对一条永远打不开的僵尸会话没有任何自助清除手段（日志实证 `Conversation not found` 后删除被拒）。改为：`read` 失败时降级为尽力清理——`abort`（内存态，本就容忍未载会话）→ 从 `sessionState` 缓存 / `repository.read`（legacy 索引 JSON，协调文件丢失时往往仍在）兜底枚举 member/coordination runtime 路径 → per-path `runtime.deleteSession` 各自 best-effort（外部实例持租约的单条不阻断其余）→ `eventHub.detach` → `repository.delete`（rm -f，天生容忍缺文件）→ `ownershipCatalog.removeByTeamSession`（teamId 可解析时）→ `sessionState.remove` + `teamResidency.forget`。正常路径语义不变。

## 范围

### 并发评估

- 结论：支持（service 单方法改动，main 工作区串行）。
- 执行方式：serial
- 冲突文件/独占路径：`team-session-service.ts` 独占。
- 集成顺序：定向测试 + impact + check:quick 通过后随批集成

### 做

- `team-session-service.ts` `deleteSession`：`read` 包 try/catch；失败时记 `log.warn`（含 sessionId 与原错误）并按上顺序降级清理；fallback 文档来源依次为 `sessionState.get` → `repository.read`；两者都没有时仍执行索引三件套清理。
- 新增 `team-session-delete.test.ts`（或并入既有 service 测试文件，按目录习惯）：构造 read 必败 + repository.read 可回的场景，断言删除完成且各清理点被调用；先红后绿。
- 发布说明：`v0.1.3.md`「修复」一条。

### 不做

- 不改变正常路径（read 成功）的严格语义：member 删除仍串行传播错误——外部实例持租约时阻断删除是既有设计。
- 不改 `ownershipCatalog` 端口形状；teamId 无法解析时所有权记录可能残留（如实记 warn，不编造 teamId）。
- 不动 IPC/preload 层。

## Given / When / Then

- Given coordination 会话文件损坏（read 抛 `Team session could not be loaded`），`repository.read` 能返回含 teamId/memberRuntime 的文档；When `deleteSession(id)`；Then 返回成功：member runtime 路径逐个尝试删除、`repository.delete`、`removeByTeamSession`、`sessionState.remove`、`teamResidency.forget` 全执行，不再抛错。
- Given read 失败且两个文档来源都缺；When `deleteSession(id)`；Then 仍完成 `repository.delete`/`sessionState.remove`/`teamResidency.forget`/`abort`，删除在 UI 层生效。
- Given read 失败、某 member 路径删除抛 `ConversationOwnershipConflict`；When 降级删除；Then 该路径记 warn 跳过，其余清理照常。

## 必须保持

- read 成功路径与现状逐行一致（abort→per-path 严格删除→detach→索引清理）。
- `repository.delete`/`sessionState.remove`/`teamResidency.forget` 在两条路径都必达。
- 降级路径内任何单步失败不阻断后续清理（Promise.allSettled 语义），但都要留 warn 日志。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/agent-teams/team-session-delete.test.ts`（按实际文件名）。
- 用户流程：损坏 team 会话在侧栏右键删除 → 条目消失且不再复活。
- 质量检查：`bun run test:impact -- apps/desktop/src/main/agent-teams/team-session-service.ts` + `bun run check:quick`。

## 验收分层

- 工程验证：通过（红基线 3 例同款报错 → 定向 4/4 绿 + impact 182 例 + types/lint 全绿）。
- 技术评审：自审。
- 集成：待集成。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：存在一条 coordination 文件缺失/损坏的 team 会话。
- 操作步骤：侧栏对该会话执行删除。
- 预期行为：删除成功，会话从列表消失；日志留降级 warn；member runtime 能删尽删。
- 不通过表现：删除被拒且会话永驻（旧行为）。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：`team-session-service.ts` `deleteSession`：`read` 包 try/catch，失败记 warn 并进入降级路径；文档来源 `sessionState.get` → `repository.read` 兜底；`degraded` 模式下 coordination+member 路径 per-path best-effort 删除（单条失败 warn 不阻断）；`abort`/`detach`/`repository.delete`/`removeByTeamSession`（有文档时）/`sessionState.remove`/`teamResidency.forget` 无条件执行；`degraded === false` 时保持原有严格串行删除。新增 `team-session-delete.test.ts` 4 例。
- 实际运行：
  - 红基线：3 例报 `Team session could not be loaded`（日志同款）；第 4 例经 fixture 修正（roster 对齐避免误入降级、`appendSessionMetadataEntry` 补齐）后覆盖严格路径。
  - 定向：`run-vitest team-session-delete.test.ts` → 4/4 绿（两轮复验，含 format 后）。
  - impact：desktop 侧 182 例过（4 套件因 `window-manager.ts` `process.resourcesPath` 既有问题红，非本改动）。
  - `bun run check:types` 全绿；`bun run check:lint` 全绿。
- 未运行及原因：`bun run check:quick`/`bun run check` 被 `.ua/` 既有 guard 失败阻断（非本改动）；UI 实机验证未授权未跑。
- Worktree：未拆出（serial，main 工作区串行集成）
- 剩余风险：teamId 不可解析时 ownership 记录残留（极端损坏场景，已留 warn；后续可用 list() 兜底另议）。
