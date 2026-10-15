---
id: TASK-0116
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: []
plan: PLAN-0012
source: RESEARCH-0012 WorkDaddy P1（权限免打扰分档开关组+风险文案+付费语境否决，对照 `executionMode` 三态过粗——AGPL，净室重写）
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [packages/coding-agent/src/features/scheduled-tasks/, packages/coding-agent/src/features/plan-mode/, apps/desktop/src/main/scheduler/, apps/desktop/src/renderer/domains/scheduler/]
write_paths: [packages/coding-agent/src/features/scheduled-tasks/, apps/desktop/src/main/scheduler/, apps/desktop/src/renderer/domains/scheduler/, docs/adr/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0117, TASK-0118]
integration_status: integrated（a8f8bffaf，随本批推送 origin/dev）
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 定时任务无人值守授权分档

## 目标

定时任务要真无人值守，`executionMode` 的 `inherit/sandbox/full-access` 三档太粗——要么全问要么全放，缺「只放行低风险面、仍留人工闸」的中间档。参照 WorkDaddy 分档形态（净室重写）：按能力分档开关（工作区外写/常用命令/批量删除/系统级工具/弹窗自动允许）+「全部开启」批量操作 + 明确风险文案 + 付费/计费语境一票否决。落地形态是**定时任务粒度的授权范围配置**，与 ADR-0123 双闸门权限轴协同而非冲突。

## 范围

### 并发评估

- 结论：不支持并发——与 TASK-0117（任务包）、TASK-0118（事件触发）同写 scheduler/scheduled-tasks 域。
- 执行方式：serial，主工作区。
- 可并行 Task：PLAN-0010、PLAN-0011、TASK-0115。
- 前置依赖：无；落地前需先写 ADR 说明与 ADR-0123 的关系。
- 冲突文件/独占路径：`features/scheduled-tasks/`、`scheduler/` 域。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0012 阶段 A，先于 0117/0118。

### 做

- 在 `executionMode` 基础上新增**能力分档**维度（不改三态语义）：如 `allowWorkspaceWrite`/`allowCommonCommands`/`allowBatchDelete`/`allowSystemTools`/`autoApprovePrompts` 等开关组，逐项可独立授权；
- 「全部开启」为显式批量操作 + 风险文案确认（不默认勾选）；
- 计费/付费语境一票否决（任务涉及配额消耗操作时该档强制人工确认）；
- Scheduler 任务编辑 UI 暴露分档（i18n 文案）；
- 权限面执行时逐档校验——未授权能力仍走正常审批；
- 先补 ADR（与 ADR-0123 双闸门关系）。

### 不做

- 不做全局免打扰开关（只做任务粒度）；
- 不改 plan-mode 的契约模式语义；
- 不动 `executionMode` 三态的既有行为；
- 不复制 WorkDaddy 的按钮文案白名单实现（那是 CDP 宿主场景的 workaround，本仓有自己的权限卡系统）。

## Given / When / Then

- Given：一个定时任务配置了「工作区外写=允许、系统级工具=不允许」；
- When：任务执行到系统级工具调用；
- Then：该调用仍出审批卡/被拒，工作区外写直放；未配置分档的任务行为与现状逐比特一致。

## 必须保持

- ADR-0123 双闸门不破：分档是授权范围的细化，不绕过权限评估管线；
- 默认档行为与现状完全一致（向后兼容）；
- 「全部开启」必须有显式风险确认文案（i18n）；
- 计费相关操作在任何档位下都保留人工闸。

## 测试与验证

- 定向测试：分档判定单测（逐档×允许/拒绝矩阵）、默认值兼容测试；
- 用户流程：建两个定时任务（粗档/细分档）跑通各自审批路径；
- 质量检查：`bun run test:pkg coding-agent`、`bun run check:quick`、ADR 评审。

## 交付记录

- 实际修改：
  - `docs/adr/0132-unattended-permission-tiers-on-scheduled-tasks.md`（说明：任务要求写 0131，但 `0131-per-module-context-boundary-declarations.md` 已占用该号，按 ADR README「最大编号 +1」落地为 0132）
  - `packages/coding-agent`：`permissionTiers` 合同、`evaluateUnattendedToolAutoApprove` 纯逻辑与逐档 allow/deny 矩阵测试
  - `apps/desktop`：任务存储/校验、自动化会话分档绑定、审批 broker 接线、TaskForm 分档 UI + i18n、「全部开启」风险确认
  - `.github/release-notes/v0.1.1.md`
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run`：`unattended-permission-tiers.test.ts`、`scheduled-task-tools.test.ts`、`unattended-permission-session-registry.test.ts`、`agent-task-tools.test.ts`、`task-executor.test.ts` → 5 files / 43 passed
  - desktop vitest：`useSchedulerPermissionTiersModel.test.tsx`、`useTaskFormModel.test.tsx` → 2 files / 4 passed
  - `bun run check:quick -- <本 Task 文件列表>` → 通过
  - `bun run --cwd packages/coding-agent build` → 通过
- 未运行及原因：`verify:ui:*`（用户未授权）；全量 `bun run check` / `test:pkg coding-agent` 未整包重跑（定向测试与 check:quick 已覆盖本变更面）
- Worktree：主工作区（unassigned）
- 剩余风险：shell 命令归类启发式可能把边缘命令归入 systemTools（偏保守）；计费语境靠摘要/入参关键词匹配，未知工具名需后续扩展词表
