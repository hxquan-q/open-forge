---
id: ISSUE-0028
type: issue
status: in_progress
priority: P3
owner: apps/desktop
related_requirement: []
related_plan: [PLAN-0013]
source: 开发团队实测会话（91c32cf7）耗时拆解 + DSH goal 子系统 + multica 门禁升级规则
created: 2026-09-26
updated: 2026-09-27
related_tasks: [TASK-0125, TASK-0126]
related_issues: [ISSUE-0025, ISSUE-0027]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话无会话级预算与可路由的阻塞/升级态：靠主控自觉收敛

## 背景

实测会话 91c32cf7 跑了约 44.9 分钟、38 次 `team_wait_tasks`、Leader 单回合输入 50 万
token。这次收敛成功了——但**收敛完全依赖主控模型的自觉**。如果委派-审计回路卡死（成员
反复返工、审计员与开发员循环互不退让），运行时没有任何会话级的上限能拦住它：没有回合
数上限、没有墙钟上限、没有「返工 N 次后必须升级人类」的规则。

当前唯一的预算型字段是 `maxAutomaticRetries`，作用于**单个委派任务的自动重试**——与
会话级回路是两回事。45 分钟里两次任务 timeout 由它兜住，但「整个会话要不要继续烧」
没有任何机制可判。

## 已知事实

- 行业对照里会话级预算是标准件：
  - **DSH goal 子系统**：持久生命周期 `active/paused/blocked/complete` + `maxGoalRounds`
    回合上限 + CAS 修订号；`blocked` 是持久阶段且携带**机器可路由的稳定 code**
    + 人读消息，`GoalActivation` 进程本地续跑权可 `disarm`。
  - **Pi rolebox**：每节点预算（`maxOutputs`/`maxTokens`）+ 循环上限 + 审批门。
  - **multica**：门禁阶梯里「返工超 2 次 / 安全或发布风险 / 证据矛盾 → 统一升级人类」
    是写进流程的升级规则，不是可选项。
  - **pi-subagents（tintinweb）**：**两阶段限额**——agent 逼近回合上限时先收「wrap up」
    警告产出干净的部分结果，再硬中止；FleetView 还把每个 agent 的 `↻回合 · 工具数 ·
    token · context 窗口占比（≥85% 标红）· ⇊压缩次数` 常驻渲染。预算先「可见+软警告」
    再「硬熔断」的梯度，比一刀切的 blocked 更平滑。
  - **Claude Code teams**：靠显式提示词（`export CLAUDE_CODE_TEAM_JOIN...`）之外，
    官方也只承诺「会消耗显著更多 token」，未见运行时硬顶——我们此处不落后。
- 我们已有部分积木：`workItem` 持久化、retry 预算计数、task control pending 状态、
  会话停止（`stopped`）态。缺的是**会话级聚合预算**与**超限后的可路由终态**。
- 与 ISSUE-0025 的区别：0025 是「回合内不该轮询空转」，本条是「整个会话烧到什么时候
  必须停/必须问人」——前者是效率，后者是熔断。

## 未决问题

1. 预算维度取舍：墙钟时间、主控回合数、委派总次数、累计 token、还是多轴任一触发？
   （token 轴成本最真实但事前不可估；回合轴最好测但粒度粗）
2. 超限后的终态语义：是 DSH 式 `blocked` 持久阶段（可人工 resume），还是直接把会话
   标为失败？blocked 需要配套「升级原因 code」契约（`rework-limit`/`budget-exhausted`/
   `evidence-conflict` 之类），才能让 UI 与续跑者正确路由。
3. 「返工」如何机器可判：同一下游门禁重复 FAIL、同一任务多次 timeout 重试、还是审计-
   修复回路的轮次计数？multica 用「同一角色退回超 2 次」，我们目前没有门禁编号概念。
4. 用户可干预面：超限触达时给用户什么（继续/停止/降级的三选一）？进度 UI
   （ISSUE-0027 方案 D / TASK-0124）是不是承载它的自然位置？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 会话级回合+墙钟双上限，超限置 blocked 持久态可恢复 | 硬熔断，最防失控 | 新持久字段与生命周期迁移 | 上限值定错会误杀长任务 |
| A' A 的两段式变体：先注入「wrap up」警告给主控收尾机会，再超限熔断（pi-subagents 形态） | 保留硬熔断且减少半途切断的脏结果 | 软警告依赖模型配合，需实测 | 警告被无视时仍靠硬顶 |
| B 仅返工/重试回路计数超限升级用户 | 直击「审计-修复死循环」最危险场景 | 需要先定义可机器的「返工」 | 定义不好会漏判真实卡死 |
| C 只做预算显示不做熔断（把已耗 token/回合显示给用户决策） | 零行为风险，用户保留全权 | 依赖用户盯屏，无人值守时无效 | 熔断缺口仍在 |
| D 维持现状 | 零成本 | 失控会话烧光额度无兜底 | 已实测有 45min/87 万 token 的先例 |

## 推荐

先把 A 的持久形态想清楚（blocked 阶段 + 可路由 code + resume 路径），C 可以搭
TASK-0124 阶段化进度便车先做；B 依赖 0027 的门禁概念，后置。纯软熔断（到点只提示
不打断）价值有限——实测里主控正是靠「还能继续」一路烧下去的。

## 决策触发条件

- 出现第二次「会话跑超过 30min 且未收敛」或「成员返工回路 >3 轮」的实测时，A/B
  至少一项应立为 Task。
- 若产品方向确认「团队会话允许无人值守长跑」，则 A 升级为必选——无人值守没有
  「用户盯屏」这条退路。

## 后续 Task

- （待立）会话级预算与 blocked 终态；取决于 0025 复测（TASK-0125）是否仍观测到
  失控前兆。
