---
id: ISSUE-0014
type: issue
status: draft
priority: P2
owner: packages/agent-team/apps/desktop
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008（Cursor 独立终端 / Claude Code worktree 隔离对照；ADR-0105 L60 明确留白）
created: 2026-09-24
updated: 2026-09-24
related_tasks: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 多成员共享 cwd 的并发写防护

## 背景与已知事实

- Team 会话的协调与全部成员 runtime 共享同一 `cwd`（ADR-0105），成员并行执行时对同一文件的写入**没有事务或串行化**，现状依赖 leader 把任务拆成互不重叠的路径——纯提示词约束，无机械保证。
- 参照系都用结构手段：Claude Code 子代理按 worktree 隔离（改动在独立工作树，集成时合并）；Cursor subagent 各自独立终端与上下文；pi worker 是独立会话（同项目但任务天然离散）。
- 已知风险路径：两个成员同时编辑同一文件后写互相覆盖（后写赢）；成员 A 读到成员 B 的半成品写；`team_delegate_task` 的 objective 未被机械校验路径互斥。

## 未决问题

1. 防护层级：检测（写前查他人正在写/已写同路径并告警）、串行化（同路径写排队）还是隔离（每成员独立工作区，leader 负责合并）？
2. 隔离方案的合并成本由谁承担：leader 成员自动合并，还是产出 patch 由用户/leader 审阅？
3. 检测的最小形态是否够用：在 `team_delegate_task` 准入时对 objective 内出现的路径做软冲突提示（不阻断），成员工具执行层对同路径并发写做硬排队？
4. 远程（SSH）项目的工作区隔离是否可行（ssh-helper 场景下 per-member worktree 成本）？

## 候选方案及取舍

- **A 检测 + 提示**（最轻）：运行时跟踪各成员最近写路径，委派与执行时对重叠路径告警/软提示。不阻断、不合并，解决「不知道撞了」；解决不了「撞了之后谁赢」。
- **B 同路径写串行化**：以路径为键的跨成员写队列。保证不互相覆盖，但排队语义对非原子多文件编辑（改 A 必须同步改 B）仍不完整，且引入跨 lane 等待，与每成员串行 lane 模型有张力。
- **C per-member 工作区隔离**（对齐 Claude Code）：彻底消除冲突，代价是合并复杂度、磁盘成本、远程项目适配，且改变「团队共享一个项目现场」的现行产品心智。

## 推荐方案

先 A（检测与提示，投入小、立刻把静默覆盖变成可见冲突），B 仅对「同路径并发写在同一秒窗口」的窄场景做排队兜底；C 在用户确认愿意接受合并心智前不动。

## 决策触发条件

用户确认产品上接受哪种心智（可见冲突 vs 排队 vs 隔离合并）；或调试/用户数据里出现真实的互相覆盖案例（届时先立 BUG 再决策）。

## 后续可能拆出

- Task（A）：成员写路径观测（复用 observability 事件）+ 委派准入软冲突提示 + 聚合视图冲突徽标；
- Plan（C，若裁决）：per-member 工作区合同（ADR 必写）。
