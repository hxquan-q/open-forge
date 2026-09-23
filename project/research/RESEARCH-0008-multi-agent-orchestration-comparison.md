---
id: RESEARCH-0008
type: research
status: done
priority: P1
owner: packages/agent-team/apps/desktop
source: user-request；本仓库源码与 ADR（0099/0103/0105/0106/0109/0111/0115/0125/0127/0044）；调试实例日志（~/.openforge、~/.openforge-dev、~/.vetta，2026-09-22～09-24）；外部一手资料（vastsa/pi-plugin-session-orchestrator README、Cursor 官方多智能体最佳实践检索、Claude Code subagents/teams 机制、Codex CLI 公开资料）
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0006]
related_plan: [PLAN-0008]
related_tasks: [TASK-0069, TASK-0070, TASK-0071]
related_issues: [ISSUE-0012, ISSUE-0013, ISSUE-0014]
related_bugs: [BUG-0002]
depends_on: [RESEARCH-0006]
---
<!-- Copyright The Open Forge contributors. -->

# 多智能体编排协作对照：Cursor / Claude Code / Codex / Pi

## 问题与范围

用户要求对照 cursor agent、Claude Code、codex、pi agent（含 `vastsa/pi-plugin-session-orchestrator` 插件生态）评估本仓库 Agent Team 编排协作的现状，找出值得对齐的差距。本笔记只记录证据与判断，不改代码。

## 事实来源

### 本仓库

- `packages/agent-team/src/`（contracts / collaboration / task-runtime-tools / operating-context / shared-context / extensions / validation 及 14 个测试套件）；
- `apps/desktop/src/main/agent-teams/`（60 文件：turn-coordinator、task-control、member-scheduler、notification-journal、initiator-continuation、publication-workflow、recovery-monitor 等）；
- Renderer：`domains/conversation/connectors/team/`、`domains/activity-panel/`（`runtime-scope.ts`、Todo/任务页签 model）；
- ADR-0099/0103/0105/0106/0109/0111/0115/0125/0127/0044；
- 子代理第二体系：`packages/runtime-subagents`、`packages/coding-agent/src/composition/subagent`（7 工具，被 `filterTeamMemberActiveToolNames` 从成员工具面剥除）。

### 调试实例记录（用户指认）

- `~/.openforge/desktop-app/logs/main/2026-09-22.log`：11:36 起 Team 成员 runtime 因 DeepSeek `response.content_part.added targeted the wrong output item`（`AI_STREAM_PROTOCOL_FAILED`）连锁失败：agent-runtime → member-turns → team-turns → IPC 全链路报错，同一会话重复 2 次、波及 3 个成员会话。**根因与修复即 BUG-0002（done）**：Coding Agent child handle 把终态 `error`/`agent_end` 投影为成员终态失败并携带 errorMessage，配 fake stream fixture。调试记录中未见编排层自身的新缺陷。
- `~/.openforge-dev/.../2026-09-23.log`：`agent presets installed { agents: 6, teams: 2 }`——插件预设档案/团队安装链路正常（开发团队/策划团队 + 6 个预设智能体）。
- 其余高频报错（`models:fetch-remote` 无 handler＝BUG-0007、marketplace sync 失败、`title.generate` 耗尽）均与编排层无关。

### 外部一手资料

- **pi-plugin-session-orchestrator**（vastsa，MIT，PI-Desktop ≥0.14.7）：宿主拥有投递/队列准入/执行状态/结果/完成通知；插件只注册单一 `SessionTask` 工具（spawn/send/models/status/list/result/wait/supervise/accept/cancel）；pull（按 messageId 轮询）默认 + push（notifyOnCompletion 选入）互斥；`idempotencyKey` 重试；工作者上限（每创建者 4 / 每插件 16）且 worker 不可再生 worker；`send` 不改变目标会话的模型/上下文/权限；成功判定只认 `message.status === "completed"`，绝不从助手文本推断；能力目录门禁（`session/collaboration/*`），老宿主显式报错不回退；插件侧状态有界（256 条引用 + 256 条评审备注）。
- **Claude Code**：类型化子代理（自定义 agent 定义含工具/模型约束）+ 后台子代理完成通知 + 跨代理 SendMessage + 空闲订阅 + worktree 隔离 + 确定性 Workflow 脚本编排（pipeline/parallel）。
- **Cursor**（官方多智能体最佳实践 + RESEARCH-0006）：lead 规划 → 派发隔离上下文的 subagent（自包含提示：目标/上下文/交付物/约束）→ 并行执行 → lead 验证产出 → 整合；Agents Window 把各 agent 工作面并列呈现。
- **Codex**：无原生 in-loop 委派；主流范式是外部脚本编排 `codex exec`（确定性管线），多实例并行靠进程级并发。

## 当前结论

**核心可靠性机制已与参照系对齐或领先，差距集中在编排质量（提示词合同）、协作可读性（视图标注）与表达力（成员命名）。**

| 参照能力 | 本仓库现状 | 判断 |
| --- | --- | --- |
| 持久任务 + 结果判定不靠文本推断 | `TeamWorkItem` 7 态 + attempt 终态分类（10 类 issue × 4 档），发布走幂等 publication workflow | 已对齐 |
| 幂等重试（idempotencyKey） | `requestId`：同 key 同内容直接返回原任务 | 已对齐 |
| pull + push 双模式结果获取 | `team_wait_tasks`/`team_get_task`（≤8 任务 ≤60s，超时不取消）+ 完成通知持久化并自动唤醒发起者续跑 | 已对齐 |
| 恢复与熔断 | 每任务恢复预算（默认 2，0-10）+ `TEAM_RECOVERY_EXHAUSTED` + 30s 巡检 + 外部条件唤醒 | 超出参照 |
| worker 不可再生 worker / 环形等待 | 成员不可转移委派 + 工具面剥除全部 subagent 工具 + wait 图 `reaches()` 拒绝环形等待 | 已对齐（更严） |
| 共享上下文 | 不可变 checkpoint + 增量压缩 + 每成员回执 + 授权分页读取 | 超出参照 |
| 插件生态参与编排 | 插件提供档案/团队预设（blueprint + pinnedPlugins + 语言包 key）；`TeamOrchestrationPolicy`/`TeamContextProjectionPolicy` 扩展点 | 同层不同物：pi 插件提供编排工具，本仓库插件提供编排素材，各有取舍 |
| 资源边界 | 空闲会话 LRU=2、回执窗口 256、子进程 V8 上限、renderer LRU | 已对齐 |
| **结构化委派交接** | `objective` 为自由文本，工具描述未要求自包含（目标/上下文/交付物/约束），leader 编排回路（拆分→并行→等待→验证→整合）未写入团队纪律 | **差距 → TASK-0069** |
| **聚合视图成员标注** | ADR-0111 决策 2 已让行级携带归属 Runtime 并按行路由，但 `collectRuntimeItems` 在 model 层丢弃归属，UI 不显示成员身份 | **差距 → TASK-0070** |
| **成员团队内角色化命名** | ADR-0109 留白：handle 仅入团时确定，想差异化只能 copy 分叉 | **差距 → TASK-0071** |
| pi `spawn` 动态增员 / Claude Code 成员可用子代理 | 固定名册 + 成员工具面剥除 subagent 工具（ADR-0103 正交契约） | 架构决策 → ISSUE-0013 |
| Claude Code 子代理工具收窄（tools 约束） | 能力只能在本体上增，团队内不可只减不加（ADR-0109 明确等交互定案） | 交互决策 → ISSUE-0012 |
| Cursor/Claude Code 工作区隔离（worktree/独立终端） | 共享 cwd 无事务/串行化（ADR-0105 L60），依赖 leader 拆互斥任务 | 方案决策 → ISSUE-0014 |

### 事实修正：ADR-0115 的「待投递通知只在内存」已过时

`team-notification-journal.ts` 把通知作为 `agent-team.task-notification.v1` custom entry 持久化，`pending()` 从存储读出并以接收方 `notificationIds` 为持久回执；`undeliveredTeamNotifications` 覆盖「崩溃后不重复导入」。ADR-0125 已落地该能力，ADR-0115 后果段该条不再是事实。以源码为准。

## 被否决的方案

- **给 Team 成员放开 subagent 工具或做动态增员**：破坏 ADR-0103「subagent 永远不是 Team 成员」与 ADR-0109 名册契约，属架构变更，未经用户裁决不实施（转 ISSUE-0013）。
- **把工具族合并为 pi 式单一 `SessionTask`**：本仓库 9 工具按职责拆分且各带防误用描述（等待≠轮询、通知≠任务 ID、恢复预算熔断），合并是倒退。
- **给 `objective` 加 schema 化结构字段（deliverable/constraints…）**：当前瓶颈是模型没有被要求写自包含任务书，提示词合同即可解决；schema 化会过早固化任务书形态并连累兼容，暂不做。
- **照搬 Codex 外部脚本编排**：已有 in-loop 编排（工具 + 策略扩展点），第二套外部编排只会制造并行事实源。
- **为成员标注新建跨会话任务总览面板**：价值真实但属新产品面，先做行级标注（数据已在），总览留待后续评估。

## 代码锚点

| 主题 | 锚点 |
| --- | --- |
| 委派工具合同 | `packages/agent-team/src/task-runtime-tools.ts:60-80`（`team_delegate_task` 描述与 `objective` schema） |
| 团队协作纪律 | `packages/agent-team/src/operating-context.ts:19-28`（9 条规则，入 `rosterFingerprint`） |
| 归属 Runtime 被丢弃 | `apps/desktop/src/renderer/domains/activity-panel/services/runtime-scope.ts:23`（`collectRuntimeItems` map 掉 `runtimeId`）；`useTodoTabPanelModel.ts:19-22`、`useTaskPanelModel.ts:65-80` |
| handle 合同 | `packages/agent-team/src/contracts.ts:71-76`（`TeamMember.handle`）、`validation.ts:150`（CreateTeamInputSchema）、ADR-0109 L53 |
| 通知持久化（事实修正） | `apps/desktop/src/main/agent-teams/team-notification-journal.ts:46-76,160-187` |

## 失效条件与置信度

- 对照结论锚定 2026-09-24 工作树与当时的外部资料；Cursor/pi 机制演进后需复核。
- TASK-0069/0070/0071 合入后「差距」三行失效；ISSUE-0012/0013/0014 裁决后对应行转入新 Task。
- 「已对齐」判断基于源码与测试阅读，未做实机多成员并发验收（未获 `verify:ui:*` 授权）。

## 下一步触发信号

- ISSUE-0012（能力收窄交互）/ ISSUE-0013（动态增员与子代理边界）/ ISSUE-0014（共享 cwd 写防护）任一裁决后，按 PLAN-0008 后续阶段拆 Task；
- 用户反馈委派质量或聚合视图可读性仍不达标时，优先复核提示词合同与标注信息密度，而不是先加新机制。
