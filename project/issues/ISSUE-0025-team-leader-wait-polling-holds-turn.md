---
id: ISSUE-0025
type: issue
status: verifying
priority: P2
owner: packages/agent-team + apps/desktop + plugins/preset-agent
related_requirement: []
related_plan: [PLAN-0013]
source: 开发团队实测会话（91c32cf7，E:\demo 数据中台任务）日志全量分析
created: 2026-09-26
updated: 2026-09-27
related_tasks: [TASK-0122, TASK-0125]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 团队主控以 team_wait_tasks 轮询挂起回合，未让出回合由完成通知唤醒

## 背景

实测「开发团队」执行数据中台任务（读 xlsx → 抽取 → 建页 → 审计 → 修复），总时长 44.9 分钟。
主控回合 95 次工具调用中 **38 次为 `team_wait_tasks`（34 次返回 timeout）**，约 89% 的回合时间
花在「wait 阻塞 ~60s → 模型思考『还在跑』→ 再 wait」的轮询循环上；用户侧仅看到持续 45 分钟的
「正在努力工作…」，对话流里则出现大量结构化 timeout 载荷，观感像故障。

事件机制其实已存在：任务完成会产生 `agent-team.task-completed.v1` 上下文记录并以
`triggerTurn` 投递唤醒发起者（`team-task-notification.ts`），通知经 journal 持久化、回合忙时顺延
——本次三条完成通知全部在主控回合结束后作为新回合输入正确消费（`turn.completed` 后 0.1min
的收尾回合即「消费通知 → DONE」）。**缺口不在机制，在主控回合不让出**：模型选择用阻塞式
wait 把单个回合挂起 45 分钟，唤醒路径完全没有被用到。

## 已知事实

- `team_wait_tasks`（`packages/agent-team/src/task-runtime-tools.ts`）单次阻塞上限 60s、默认 30s，
  上限合理（Codex 曾有 wait_agent 7.5h 不返回的事故，openai/codex#24951），timeout 语义也正确
  声明「不构成任务失败」。
- 但每次 timeout 返回完整 workItem JSON（含 objective 全文，实测单次 ~7-8KB），38 次累计向
  上下文回灌 ~300KB 重复载荷；主控累计新输入 503,860 tokens，高于任何干活成员
  （检索员 138K / 审计员 174K / 开发员 230K），等待是主控成本的主要构成。
- 队首提示词（`preset-agent/agent/prompts/master.md`）已写「Completion notifications may wake
  you after a delegated task finishes」，但没有引导「分派完毕即结束回合」；工具描述
  「use team_wait_tasks or team_get_task to observe all of them」反而鼓励就地观察。
- 上游同方向改动：`887017560 perf(agent-teams): 优先准备队长与首轮响应`（本轮未合入，领先 218
  提交之一）提到「用模型请求事件驱动等待提示」，覆盖的是启动侧而非轮询回合。
- 同赛道参照：Codex 社区对同类问题的共识方向是「唤醒由 runtime 拥有、非模型轮询发现」
  （openai/codex#15723：完成通知作为持久去重会话事件、空闲时合并触发一次续跑）；
  「Orchestrator's Tax」（martinfowler.com）指出轮询开销可超过子代理本身。
- DSH 对「载荷回灌」的系统级答案：`agent/pre-step` 在派生请求前处理上下文压力，
  **工具结果剪枝先于摘要**执行——timeout 载荷瘦身（方案 B）与该思路同构，佐证它不是
  单点补丁而是被验证过的上下文治理层。

## 未决问题

1. 主控回合「分派后应否主动结束」的语义边界：结束回合会向团队会话发布一条中间消息
   （如「已分派，等待结果」），这对用户是更好的进度可见性还是噪音？
2. wait 循环是否应设上限/退避，还是交给提示词约束？连续 N 次 timeout 后由运行时注入
   「建议结束回合等待唤醒」提示是否可行？
3. timeout 返回载荷能否瘦身（仅 taskId/state/revision，不含 objective 全文）？
4. 上游 `887017560` 合入后是否已部分缓解（等待提示事件驱动），需要 rebase 后复测量化。

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 提示词引导让出：master.md 改为「分派后结束回合，由完成通知唤醒；wait 仅用于短轮询/快照」 | 零机制改动，立即砍掉大部分空转 | 依赖模型遵守；语义边界需明确 | 模型仍可能轮询；回合数变多但每回合廉价 |
| B 工具瘦身+提示：timeout 返回精简状态，连续 timeout 附带「考虑结束回合」指导 | 每次空转成本立降；对现有流程兼容 | 改工具输出合同，需合同测试 | 不解决回合挂起本身 |
| C 运行时自动挂起：协调器检测到「仅剩等待中工作」时自动挂起发起者回合、通知到达时再续跑 | 不依赖模型自觉，收益确定 | 回合生命周期改动大；UI 需呈现挂起态 | 与 turn 准入/取消语义交互复杂（262d88b38 刚重构过此路径） |
| D 等上游合并后复测 | 零投入 | 不确定覆盖度 | 问题持续存在 |

## 推荐

A+B 组合先行（提示词修正引导 + wait 载荷瘦身），成本低、可立刻落地；C 作为结构性解法列入
后续 Task 评估，rebase 上游 `887017560` 后复测量化收益再决定是否推进。

## 决策触发条件

- 实测主控等待类调用占比 >30% 或长任务（>10min）下回合数不可接受时优先落地 A+B。
- 若要让「结束回合=发布中间消息」成为常态，需要先确认团队会话的中间消息展示语义。

## 后续 Task

- （待立）master.md 与 team_wait_tasks 描述的让出引导 + timeout 载荷瘦身（含合同测试）。
- （待立）rebase 后回归实测：同一任务复跑，对比等待调用数、主控 input tokens、总时长。
