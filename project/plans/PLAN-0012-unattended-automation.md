---
id: PLAN-0012
type: plan
status: in_progress
priority: P1
requirement: []
owner: apps/desktop + packages/coding-agent
source: RESEARCH-0012（babygoton/WorkDaddy 源码取证，commit 06f2af4e87993a182e56a41cfb25eddefcdeb46c，AGPL-3.0——机制参考，实现净室重写）
created: 2026-09-24
updated: 2026-09-24
depends_on: [RESEARCH-0012]
---
<!-- Copyright The Open Forge contributors. -->

# 无人值守会话与自动化产品化（WorkDaddy 借鉴）

## 背景与目标

`RESEARCH-0012` 对 WorkDaddy（WorkBuddy 桌面端的 CDP 注入式增强层）取证。其注入机制本身对本仓库无意义（我们就是宿主），但围绕「宿主不提供 API」约束演化出的**无人值守自动化产品化**与**会话容错处理**手法可直接映射到 Open Forge 的 scheduler/automation/agent-runtime 面。

目标：让定时任务与长会话在用户不在场时也能安全跑完——回复中断自动续接、授权粒度细化到能力分档、自动化任务可打包分享与发现。

**许可证约束**：WorkDaddy 全文 AGPL-3.0，所有条目按机制重写实现，不得复制其代码。

## 当前事实

- 已具备（`RESEARCH-0012` 现场抽查）：turn 内 silent-turn 重跑（`packages/agent`）、cron 调度引擎 + AutomationPage GUI + Agent 任务工具（`apps/desktop/src/main/scheduler/` + `agent-task-tools.ts`）、`executionMode` 三态、entryId 锚定 `forkSession`、会话消息队列 IPC。
- 缺口：无跨会话「中断续接」监视器（silent-turn 只管 turn 内空回复，不管 turn 之后断网/超时/崩溃）；`executionMode` 三档过粗；调度任务只有 prompt+cron，无事件触发、无任务包/发现/导入导出链路；会话导出只有渲染视图、无可迁移归档格式。

## 候选方案与取舍

- **监视器放主进程、判定层抽纯函数（采纳）**：WorkDaddy 把 `classifySessionHealth`/`classifyAutoContinueReply` 刻意抽成纯函数做 ~130 个 `node:test` 回归；本仓照此形状——判定层纯逻辑进 `packages/*`，副作用与巡检调度留 `apps/desktop` 主进程。
- **续接判定复用同一分类函数做绑定闸门（采纳）**：「允许绑定的会话」与「会被续跑的会话」永远一致，避免规则错位。
- **自动续接全量放开（否决）**：仅 error/networkFailure/truncated 三因触发；manualStop 与输入框非空一票否决；`suspected` 态只提示不自动发。
- **照搬 WorkDaddy 自动化步骤 DSL（否决）**：其 `dom.*`/`session.*` 60 op 面向驱动别人 UI；本仓自动化应面向自有 agent/session API，只借任务包格式与发现链路。
- **「全部开启免打扰」全局开关（否决）**：落为定时任务粒度的授权分档，不做全局豁免，避免与 ADR-0123 双闸门冲突。

## 阶段

- 阶段 A（可靠性）：`TASK-0115` 会话级中断续接监视器、`TASK-0116` 无人值守授权分档。
- 阶段 B（生态）：`TASK-0117` 自动化任务包 schema + 导入导出 + 远端发现、`TASK-0118` 事件触发维度、`TASK-0119` 会话归档迁移格式。
- 条件触发项（不立 Task）：防休眠三模式（P3，等定时任务挂机诉求坐实）；watchdog loopback 锁端口（等引入外部常驻 helper）；修复 agent `require-sent` 上报闸（等遥测链路立项）。

## 不做什么

- 不做 WorkDaddy 式 CDP 注入/宿主增强层——我们就是宿主；
- 不做账号备份/切换体系（lite 版无账号概念）；
- 任务包远端发现在本阶段只读 GitHub 公开仓，不做私有源与自动更新（远端内容永不自动执行、导入默认停用是硬约束）；
- 不改变 `executionMode` 既有三态的语义，细化是**新增维度**而非替换。

## 验证与回滚

- 续接监视器：fake 会话流覆盖触发三因/否决五因/置信度分级，人工操作路径（手动停、输入框有草稿）零误触发；上线默认保守（先仅提示模式跑一轮遥测观察，再开自动续）。
- 授权分档：每档开关键的越权用例必须被权限面拦下（合同测试）；默认档行为与现状逐比特一致。
- 任务包：URL 校验/重定向/大小上界/schema 不兼容拒绝的单测矩阵；导入即停用为硬断言。
- 各项独立可回滚；任务包链路出问题可整体退回「仅本地任务」。

## 升级信号

- 定时任务因「回复中断无人点继续」被投诉 → `TASK-0115` 升 P0；
- 用户要求「挂机跑批量任务」→ `TASK-0116` + 防休眠项合并评估；
- 插件市场体系成熟后 → `TASK-0117` 的 marketplace 同源复用重估。

## 需要的 ADR

`TASK-0116` 改变权限粒度模型（executionMode 细化），落地前补一篇 ADR 说明与 ADR-0123 双闸门的关系；其余不需要。
