---
id: TASK-0014
type: task
status: done
priority: P1
owner: packages/agent-team/apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0006 已知风险与后续项第 1 条（Team 子会话结构性常驻）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/agent-team, apps/desktop/src/main/agent-teams, apps/desktop/src/main/conversations]
write_paths: [packages/agent-team, apps/desktop/src/main/agent-teams, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Agent Team 会话驻留与投递回执有界化

## 目标

TASK-0006 遗留：(1) `TeamSessionStateRepository.sessions` 在 team 删除前不释放；(2) 每成员 `deliveredEventIds` 只做并集从不裁剪并随状态持久化（>512 条时旧 schema 直接整会话不可解析）。

## 方案边界（经对抗审查修正）

- **写入侧窗口化**：`windowTeamDeliveredEventIds`（保留最近 256 条）收敛三处写入点；validation 放宽专用 maxItems 4096 并在读侧截断到 256（顺带修复 >512 变砖隐患）；不改投影/checkpoint 指纹（全量保持，指纹翻动会破坏身份）；
- **空闲驻留逐出**：复用 `InteractiveSessionResidencyTracker` 模式，上限 2；逐出 = dispose 全部 runtime session（不删文件）+ detach 订阅 + 移除 sessions Map 条目（保留 coordinationPaths 支持无参重开）；恢复走既有 JSONL 事实源路径；
- **逐出守卫（审查修正后完整集）**：运行中 / `hasPending` / 有订阅 / warming（**三族键形状统一判定**：裸 id、`runtime:${id}`、`runtime:${id}:` 前缀、`warmingMemberRuntimes`）/ **持久化未决工作**（attention-required 等不在内存表的状态——新增 `hasDurableUnsettledWork` 查 collaborationStore workItems 终态与通知日志 pending，不改 `hasPending` 本身）；
- touch 点：readInternal 成功路径、readSnapshot 缓存命中分支、publishRunningChanged、deleteSession forget；
- 渲染端经 `TeamSessionSnapshot.session` 可见 memberRuntime 但仅消费 sessionId，deliveredEventIds 长度变化对 UI 零影响。

## Given / When / Then

- Given 加载了多个 team 会话且其中较早的已空闲、无未决工作
  When 新会话加载使驻留数超上限
  Then 最旧的空闲会话被完整释放（文件保留、可无参重开、恢复后状态深度相等）；带未决工作/订阅/预热中的会话永不入选。

## 测试

`packages/agent-team/test/{context-projector,validation}.test.ts` 扩展（窗口化、旧数据截断）；`apps/desktop/src/main/agent-teams/team-session-residency.test.ts`（选择、保文件、恢复全链路、守卫豁免）；`team-session-concurrency.test.ts` 新增多回合窗口滑动用例 + 既有断言回归。

## 并发结论

条件支持（跨包改动与 TASK-0013 同在 apps/desktop/src/main 但路径无交集）；本任务由主会话串行执行。

## 实施摘要（2026-09-23）

- **写入侧窗口**：`TEAM_DELIVERED_EVENT_ID_WINDOW=256`（contracts）；`windowTeamDeliveredEventIds` 收敛三处写入（`markTeamMemberContextDelivered` 覆盖 attempt-runner 与 publication-workflow，`team-shared-context-service` 的自并集改调同一函数）；validation 放宽 deliveredEventIds 至 maxItems 4096 并在读侧截断到 256（修复 >512 整会话不可加载的旧隐患）；checkpoint 投影与指纹保持全量。
- **空闲驻留逐出**：`AgentTeamSessionService` 新增 `teamResidency`（复用 `InteractiveSessionResidencyTracker`，`snapshot()` 收窄为公开以支持守卫预过滤），上限 2；逐出 = dispose 协调+成员 runtime（文件保留）+ detach 订阅 + `removeCached`（新方法，保留 coordination path 供无参重开）；touch 覆盖 readSnapshot 缓存命中、readInternal 两分支、subscribe、publishRunningChanged、deleteSession forget；触发点 = 运行结束、最后订阅者离开（合并去抖 setTimeout 0）。
- **逐出守卫（审查修正后完整集）**：运行中 / `hasPending` / 有订阅 / warming（三族键形状统一判定 `isWarmingTeamSession`）/ **`hasDurableUnsettledWork`**（TeamTurnCoordinator 新方法：非终态 workItem + 未消费通知；`taskControl.hasPending` 注释同步纠正）；守卫读协调文档失败按受保护处理（安全侧）。
- 与设计的偏差：未新建独立 `team-session-residency.ts` 模块——守卫判定需要 service 内部状态（warming 三族键、coordinator、eventHub），独立模块只会转发常量；上限常量与逻辑内聚在 service。
- 验证：agent-team 包 19/19（窗口化 4 新用例）；`team-session-concurrency` 56/56（新增逐出/持久化未决豁免/订阅豁免 3 例，含无参恢复深度相等断言）；相邻 5 套件 24/24；`tsc -p apps/desktop` 通过；变更文件 `check:quick` 通过（全仓 quick 的 5 个错误属并行会话在途 runtime-core 改动）。环境修复：本克隆 electron 二进制未解压完成，已从缓存 zip 恢复 dist 并补 path.txt。
- 发布说明 v0.5.59「改进」已补条目。
