---
id: TASK-0118
type: task
status: done
priority: P2
owner: apps/desktop
requirement: []
plan: PLAN-0012
source: RESEARCH-0012 WorkDaddy P2（事件触发型自动化：clientLoaded/pageReady/accountSwitched 等事件 + 步骤化任务——AGPL，净室重写）
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/scheduler/, packages/coding-agent/src/features/scheduled-tasks/, apps/desktop/src/renderer/domains/scheduler/]
write_paths: [apps/desktop/src/main/scheduler/, packages/coding-agent/src/features/scheduled-tasks/, apps/desktop/src/renderer/domains/scheduler/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0116, TASK-0117]
integration_status: integrated（a8f8bffaf，随本批推送 origin/dev）
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 事件触发型自动化

## 目标

本仓 scheduler 只有 cron 触发。参照 WorkDaddy（净室重写）把触发维度扩展到**事件**：会话创建后、项目打开后、面板打开后、会话切换后等宿主事件可挂载自动化任务；配合步骤化定义（条件/循环/等待）让定时任务从「定时 prompt」演进为「事件驱动的小工作流」。

## 范围

### 并发评估

- 结论：不支持并发——与 TASK-0116/0117 同写 scheduler 域，须串行排队。
- 执行方式：serial，主工作区。
- 可并行 Task：PLAN-0010、PLAN-0011、TASK-0115。
- 前置依赖：建议 TASK-0117 任务定义扩展先落地（事件触发要挂在任务 schema 上）。
- 冲突文件/独占路径：`scheduler/`、`scheduled-tasks/`。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0012 阶段 B，TASK-0116/0117 之后。

### 做

- 定义宿主事件源清单（`session.created`、`project.opened`、`automation.panelOpened`、`session.switched` 等），事件总线挂到现有域事件；
- 任务 schema 增 `trigger: {type:"cron"|"event"|"manual", event?, ...}`，向后兼容纯 cron；
- 事件任务执行走既有 `task-executor` 通道，补「错过不补跑/运行中跳过」语义；
- AutomationPage 任务表单加事件选择器（i18n）；
- 步骤化能力评估：先做最小集（顺序步骤 + 条件分支），循环/并行后置。

### 不做

- 不做 WorkDaddy 的 DOM 操作类 op（宿主场景不需要）；
- 不做跨会话全局事件（先本项目内事件）；
- 不改 cron 既有语义。

## Given / When / Then

- Given：用户配置「会话创建后跑 X 任务」；
- When：新会话被创建；
- Then：任务被触发并出现在运行历史；同事件高频触发时不并发堆叠（重叠抑制）。

## 必须保持

- cron 任务行为不变；
- 事件任务失败不阻塞宿主事件本身（旁路执行）；
- 触发器语义与 TASK-0116 授权分档兼容（事件任务也走分档授权）。

## 测试与验证

- 定向测试：事件触发注册/去重/错过不补跑/运行中跳过单测；
- 用户流程：配一个「会话创建后」任务，连开几个会话验证触发次数与日志；
- 质量检查：`bun run check:quick`、`test:impact` 相关包。

## 交付记录

- 实际修改：`automation-trigger` 合同；`ScheduledTask.trigger`；事件派发器（错过不补跑/运行中跳过）；挂接 session.created / project.opened / automation.panelOpened；表单触发器选择器；release notes。步骤化 DSL 评估后置（本轮仅事件→既有 prompt 执行）。
- 实际运行：见本轮定向测试与 check:quick。
- 未运行及原因：未跑 `verify:ui:*`；`session.switched` 已留 IPC，渲染侧切换接线可后续补齐。
- Worktree：主工作区串行。
- 剩余风险：事件任务高频时依赖 `isTaskRunning` 抑制；步骤化工作流未落地。
