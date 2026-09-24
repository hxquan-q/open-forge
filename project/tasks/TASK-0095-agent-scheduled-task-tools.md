---
id: TASK-0095
type: task
status: ready
priority: P2
owner: packages/coding-agent
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `scheduled_tools.rs` Agent 工具 + project 作用域圈定机制对照）
execution: parallel
branch: forge/dev
worktree: unassigned（主工作区或独立 Worktree）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/features, apps/desktop/src/main/scheduler, apps/desktop/src/main/ipc, packages/plugins/presets/vetta-actions/src/domains/scheduler.ts, project/research/RESEARCH-0010-pi-desktop-borrowing-opportunities.md]
write_paths: [packages/coding-agent/src/features, apps/desktop/src/main/scheduler, apps/desktop/src/main/ipc]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent 侧定时任务工具（自然语言设定长期看护任务）

## 目标

Coding Agent 获得一组读写定时任务的工具，用户可直接对 Agent 说「把这个项目的静态检查改成每天下午 2 点自动跑一次」，Agent 校验权限后把任务写入现有调度引擎——形成「自然语言 → 长期看护」的体验闭环。

## 背景事实

- 参照（RESEARCH-0010 §6，PI-Desktop `crates/host-core/src/rpc/scheduled_tools.rs` + `apps/desktop/electron/main/runtime/scheduled-runner.ts`）：
  - `ScheduledTask{List,Create,Update,Delete}` 注入工具表：List 为 low risk 直放，增删改走正常审批；
  - **以调用 session 的持久 project_path 圈定作用域**——list 只回本项目任务，改/删命中不到本项目任务即 `NOT_FOUND`，前台切项目不会让后台会话改错目标；
  - 强制 Agent 模式（plan 模式禁用）；任务自存 permissionMode 与 provider/model。
- 本仓库现状：
  - `apps/desktop/src/main/scheduler/`（cron 引擎 + `task-executor` + `task-storage`）与 `domains/scheduler/AutomationPage` GUI **已存在且表达能力超过 PI 的 cadence 枚举**；
  - `packages/plugins/presets/vetta-actions/src/domains/scheduler.ts` 已有完整 app action CRUD（经 `OpenForge.exe action` 已可外部调用）；
  - 缺口只剩 coding-agent 内的 agent 工具面 + 与主进程 scheduler 的桥接。

## 范围

### 并发评估

- **并发结论**：**支持并发**
- **执行方式**：parallel（与 P0 链及 TASK-0094 无共享写路径，可独立 Worktree）
- **可并行 Task**：TASK-0091、TASK-0092、TASK-0093、TASK-0094
- **前置依赖**：无
- **冲突文件/独占路径**：无（新增 feature 目录 + scheduler 桥接，无在途 Task 触碰）
- **Branch**：`task/TASK-0095-scheduled-tools`（并行时）或 `forge/dev`
- **Worktree**：可独立 Worktree
- **集成负责人**：本 Task 执行者 / Coordinator
- **集成顺序**：任意时点独立集成

### 做

- `packages/coding-agent` 新增 scheduled-task feature：list（直放）+ create/update/delete（走权限确认），参数含 title/prompt/cron 表达式（保留现有 cron 表达力，不退回 cadence 枚举）；
- 工具以**调用 session 绑定的 project** 圈定作用域：list 只列本项目，改/删跨项目目标一律 `NOT_FOUND`；
- plan 模式下禁用增删改；
- `apps/desktop` 侧桥接：工具 → 现有 `scheduler-service`/`task-storage`，复用任务执行通道；
- 工具描述写清边界（如「只管理定时任务，不执行即时命令」类防误用说明，对齐仓库现有工具描述风格）。

### 不做

- 不重写 scheduler 引擎、cron 解析或 `AutomationPage`；
- 不把任务执行权限模型改为默认 Auto（沿用现有逐任务/审批语义）；
- 不做跨项目管理（按 PI 证据，作用域圈定是刻意设计而非缺失）。

## Given / When / Then

- Given：用户在项目 A 的会话中与 agent 对话，项目 B 已有其他定时任务；
- When：用户说「把这个项目的静态检查改成每天下午 2 点自动跑一次」，agent 调用定时任务工具；
- Then：agent 经权限确认后在项目 A 下创建任务；list 只回项目 A 的任务（看不到 B 的）；到点后 scheduler 引擎正常触发；用户在 AutomationPage 能看到该任务并手动管理。

## 必须保持

- 权限语义：增删改必须过审批路径，不得静默写库；
- 作用域隔离：任何路径下都不得让会话操作到非本 session 项目的任务；
- 与 app-actions `scheduler.*` 不产生第二份事实源（桥接同一 `scheduler-service` 存储）；
- plan 模式只读约束不破（plan 下增删改被拒绝且报错明确）。

## 测试与验证

- 定向测试：`coding-agent` 工具 Schema/权限合同测试（list 直放、写操作审批、plan 模式拒绝、跨项目 `NOT_FOUND`）；desktop 桥接 fake scheduler-service 测试；
- 用户流程：会话中自然语言设定 → 权限确认 → 任务出现并可被引擎触发（fake 时钟 + fake executor）；
- 质量检查：`bun run test:pkg coding-agent`、定向 vitest、`bun run check:quick`、`bun run check`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
