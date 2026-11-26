---
id: TASK-0519
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: ADR-0155（参照上游 0111d7cde 系列重写，D4 拍板保留本地权限分层）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0517]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: b82cb6e85
read_paths:
  - apps/desktop/src/main/scheduler/
  - apps/desktop/src/main/ipc/scheduler.ts
  - apps/desktop/src/preload/api-types/scheduler.ts
  - apps/desktop/src/preload/apis/scheduler.ts
  - packages/coding-agent/src/features/scheduled-tasks/
write_paths:
  - apps/desktop/src/shared/automation.ts
  - apps/desktop/src/shared/automation-timing.ts
  - apps/desktop/src/main/scheduler/task-storage.ts
  - apps/desktop/src/main/scheduler/automation-migration.ts
  - apps/desktop/src/main/scheduler/scheduler.ts
  - apps/desktop/src/main/scheduler/scheduler-service.ts
  - apps/desktop/src/main/scheduler/task-executor.ts
  - apps/desktop/src/main/scheduler/cron.ts
  - apps/desktop/src/main/ipc/scheduler.ts
  - apps/desktop/src/preload/api-types/scheduler.ts
  - apps/desktop/src/preload/apis/scheduler.ts
  - project/tasks/TASK-0519-automation-model-v2-backend.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0519 自动化数据模型 v2 后端——判别联合调度、runTarget、迁移与执行器重写

## 合同

- 来源与目标：ADR-0155 决策 1-8 的后端落地。参照上游 0111d7cde 系列，按 D4 保留 permissionTiers/trigger/executionMode/skill/modelKey。
- 输入 → 输出：存量 scheduled-tasks.json（v1 裸数组）→ 一次性迁移为 automations.json（version 2）+ .v1.bak 备份；新模型驱动的调度/执行/记录链路。
- 做：
  1. shared/automation.ts + automation-timing.ts：判别联合、runTarget、校验（补上上游遗漏的 interval 分支）、触发时刻纯函数；本地扩展字段 executionMode/skill/permissionTiers/trigger/modelKey→model{key,reasoning?}。
  2. task-storage.ts 重写：automations.json version 2、原子写与串行链沿用、迁移入口、心跳状态文件读写、missed 记录合并写、绑定会话链接合成。
  3. automation-migration.ts：cron 档位还原/isOnce→once.at/cwd 推断项目/permissionTiers·trigger·executionMode·skill 原样保留/event·manual 任务丢弃 cron/旧记录不动。
  4. scheduler.ts：判别联合调度（interval 动态重排一次性作业）、once 绝对时刻、心跳、powerMonitor suspend/resume 错过统计。
  5. task-executor.ts 重写：outcome 口径三态、runTarget 会话获取（same-session 忙等+独立一轮）、suspendedReason 暂停、绑定回写、unattended metadata 单轮否决标记、模型每次触发解析/不可用即失败不回退。
  6. scheduler-service.ts + IPC + preload：校验迁移到新结构、runTarget 输入补齐默认对话 cwd、句柄会话删除接线（same-session 绑定暂停+清记录）、preload 类型补 trigger。
  7. Agent 定时工具与自动化包导入的适配层转换（v1 包 cron/isOnce → v2 结构）。
- 不做：渲染层 UI 改版（TASK-0520）、侧栏会话组投影与右键创建入口（TASK-0521）、webhook/notifyClaw 通知、CLI 适配。包 schemaVersion 升 2 的完整改造若体量过大可拆 TASK-0522，但导入路径必须先能转换 v1 包。
- Given / When / Then：
  - 存量 v1 文件存在且 automations.json 不存在 → 启动后生成 version 2 文件 + .v1.bak；cron 表达式「0 9 * * *」→ daily{hour:9,minute:0}；permissionTiers/trigger 逐字段相等。
  - interval{everyMinutes:45,startAt} → 下次触发 = startAt 之后第一个 45 分钟整数倍锚点；机器休眠跨过 2 个触发点 → 恢复后产生一条 missedCount=2 的 missed 记录。
  - same-session 绑定会话正忙 → 等当前轮结束后独立一轮执行；绑定会话文件不存在 → 任务暂停 session-deleted 且不创建新会话。
  - 重叠触发 → skipped(previous-running)；once 已过期 → 迁移即停用。
- 验证：各模块单测（移植上游测试矩阵 + 本地保留字段用例）+ 定向 + test:impact + bun run check。
- 人工验收：实机升级后检查既有定时任务迁移结果与下一次触发；same-session 任务绑定与暂停恢复。

## 交付

实施完成（2026-11-26，主工作区串行）：

- 后端：shared/automation.ts（判别联合 schedule + runTarget + 校验含 interval 上限一周分支）、automation-timing.ts（cron↔schedule 换算、nextFireTime/编辑重锚）、task-storage 重写（automations.json v2 + .v1.bak 迁移、心跳状态、missed 记录合并写）、automation-migration.ts（v1 裸数组迁移，permissionTiers/trigger/executionMode/skill 原样保留，event/manual 任务 cron 丢弃，过期 once 迁移即停用）、scheduler.ts 判别联合调度（interval 动态重排、powerMonitor suspend/resume 错过统计、错过不补跑）、task-executor.ts 重写（outcome 三态、suspendedReason 暂停绝不顶替、绑定回写、unattended 单轮否决标记、模型每次触发解析、executionMode 任务覆盖>宿主默认，不强制 full-access）、session-deletion.ts（句柄会话删除接线：same-session 绑定暂停+清记录）。
- v1 外部契约翻译：v1-shape-adapter.ts（Agent 工具与插件域 cron/isOnce/cwd 形状边界换算、null 清除语义）、automation-package-service/agent-task-tools 适配；v1 表达不了的 interval 计划在 create 场景不下发 cron——服务层响亮报错，不近似（ADR-0155 取舍）。
- 渲染层适配（renderer 先行，UI 改版留 TASK-0520）：cron-utils 档位、useSchedulerTaskFieldsModel、useAutomationDetailModel（编辑保存不下发未变的 enabled/runTarget，保护 suspended 不被误清）、审批抽屉 v1-draft-conversion 双向换算、ExecutionHistory/状态模型/locales。
- 验证：typecheck 0 错误；定向测试 main/shared 6 文件 41 用例 + renderer 2 文件 15 用例全绿；test:impact 1724/1729（5 失败已证实为 scripts/quality/desktop-release-workflow.test.mjs 预存在 bash/EPERM 环境问题，与 diff 无关）；`bun run check` 全绿（lint/types/guards/mobile-lint）。task-executor.test.ts 断言深度基线 10→22，文件头写明豁免理由（编排边界入参+负向合同）。发布碎片 .github/release-notes/fragments/v0.1.5/automation-model-v2.md 已汇编。
- 人工验收待做：实机升级后检查既有定时任务迁移结果与下一次触发；same-session 任务绑定与暂停恢复。
