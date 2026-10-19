---
id: TASK-0294
type: task
status: done
priority: P1
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0290]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 81094404c
read_paths:
  - apps/desktop/src/main/agent-teams/team-session-display-service.ts
  - apps/desktop/src/main/agent-teams/team-conversation-display.ts
write_paths:
  - apps/desktop/src/main/agent-teams/team-session-display-service.ts
  - apps/desktop/src/main/agent-teams/team-session-display-service.test.ts
exclusive_paths:
  - apps/desktop/src/main/agent-teams/team-session-display-service.ts
  - apps/desktop/src/main/agent-teams/team-session-display-service.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队 display 投影成员历史按版本记忆化（BUG-0127 路线 6 帧成本第一片）

## 目标

`displayProjection`（`withDisplayProjection` → 每个 `session-updated`/快照帧调用）对**每个**成员执行 `runtime.getFullHistory()`——O(成员历史) 的投影拷贝，即使该成员本轮完全空闲。长任务期间典型只有 1 个成员在产出，其余成员的历史每帧白白重建并入 IPC 载荷。

在 `TeamSessionDisplayService` 内按 `(runtimeSessionId, journalVersion, revision)` 记忆化成员历史数组：任一版本推进（事件追加推 journalVersion、文档命令推 revision——分支切换/删除/替换均走命令）即失效重读；未变成员跨帧复用同一数组引用（下游只读，渲染端收到的本就是 structured clone）。LRU 上限 32 防逐出会话的历史引用滞留。文件回退路径（runtime 未加载）不缓存。

## 范围

### 并发评估

- 结论：不支持并行；serial，main 串行；单服务文件切片。

### 做

- `TeamSessionDisplayService` 增成员历史缓存（键=runtimeSessionId，值={journalVersion, revision, history}，LRU 32）；`displayProjection` 的 readHistory 包装走缓存。
- 单测：fake runtime 计数 `getFullHistory` 调用——版本未变两次投影只读一次、revision 推进后重读、journalVersion 推进后重读。

### 不做

- 不改 IPC 合同与载荷形状（帧内容不变，只是构建成本下降）。
- 不缓存 coordination 侧 `projectTeamPublicMessages`（coordination 在任务期间持续变化，无收益）。
- 不缓存文件回退读取。

## Given / When / Then

- Given：成员 runtime 的 journalVersion 与 revision 均未变，When：再次 displayProjection，Then：该成员历史复用缓存引用，`getFullHistory` 不被调用。
- Given：任一版本推进，When：displayProjection，Then：重读该成员历史并刷新缓存。
- Given：超过 32 个成员 runtime 缓存，When：继续写入，Then：最旧条目被逐出，无无限增长。

## 必须保持

- 返回的历史数组跨帧共享，下游（tool 执行投影、IPC 序列化）只读不改。
- `session-updated` 帧语义不变（TASK-0290 的合并调度不受影响）。
- 文件回退路径行为不变。

## 测试与验证

- 定向：`team-session-display-service.test.ts`（apps/desktop cwd）+ agent-teams 目录套件；完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（版本键覆盖命令与事件两类变更）；集成：pending；人工验收：随 BUG-0127；发布：未授权。

## 功能验收包

- 长任务期间主进程每帧 display 投影成本从 O(全部成员历史) 降为 O(变更成员)；无可见行为变化。

## 交付记录

- 实际修改：`team-session-display-service.ts` 增 `memberHistoryCache`（LRU 32，键 runtimeSessionId，值 {journalVersion, revision, history}），`displayProjection` 的 readHistory 包装为 `readMemberHistory`（版本二元组命中复用同一数组引用；文件回退不缓存）；两文件补 Modified 声明头；测试增 3 例（版本不变跨帧复用只读一次、journal 推进重读、revision 推进重读）。
- 实际运行：agent-teams 目录 35 文件 243 例全绿（含新 3 例）+ 目标文件复跑 6/6；完整 `bun run check` exit 0（首轮导入排序/双跳转换/声明头红，修复后复跑全绿）。
- 未运行及原因：真实 Desktop 长任务主进程每帧成本对照待用户侧复测（随 BUG-0127 人工验收）。
- Worktree：未拆出（serial 单服务切片）。
- 剩余风险：版本键假设「历史投影只在 journalVersion 或 revision 推进时变化」——事件与文档命令均已覆盖，若存在第三类原地变更路径则成员视图短暂滞后到下一版本推进（自愈）。
