---
id: TASK-0014
type: task
status: in_progress
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
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

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
