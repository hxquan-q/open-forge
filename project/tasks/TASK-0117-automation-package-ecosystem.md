---
id: TASK-0117
type: task
status: done
priority: P2
owner: apps/desktop
requirement: []
plan: PLAN-0012
source: RESEARCH-0012 WorkDaddy P2（automation-package.v1 schema + 远端发现安全链——AGPL，净室重写）
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/scheduler/, apps/desktop/src/renderer/domains/scheduler/, packages/coding-agent/src/features/scheduled-tasks/, apps/desktop/src/main/abilities/]
write_paths: [apps/desktop/src/main/scheduler/, apps/desktop/src/renderer/domains/scheduler/, packages/coding-agent/src/features/scheduled-tasks/, packages/coding-agent/schemas/, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0116]
conflicts_with: [TASK-0116, TASK-0118]
integration_status: integrated（a8f8bffaf，随本批推送 origin/dev）
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 自动化任务包 schema + 导入导出 + 远端发现安全链

## 目标

本仓调度任务只有 prompt+cron，无分享/发现链路。参照 WorkDaddy `automation-package.v1`（净室重写）：版本化包封套 schema（id/semver/`requires{minVersion,taskSchemaVersion,capabilities,platforms}`/输入参数）+ JSON/ZIP 导入导出 + 关键字标记的公开仓发现 + **导入即停用、不覆盖同 ID**。安全链硬约束：逐 host URL 硬校验、手动重定向 ≤3 次每跳重验、流式大小上界、canonical sha256 身份去重、远端内容永不自动执行。

## 范围

### 并发评估

- 结论：不支持并发——与 TASK-0116（同 scheduler 域）、TASK-0118（同域触发器面）互斥。
- 执行方式：serial，主工作区。
- 可并行 Task：PLAN-0010、PLAN-0011、TASK-0115。
- 前置依赖：TASK-0116（任务定义字段扩展先落定）。
- 冲突文件/独占路径：`scheduler/` 域全部、`scheduled-tasks/` feature。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0012 阶段 B，TASK-0116 之后、与 TASK-0118 排开。

### 做

- 定义 `automation-package` schema（封套：id 点分、semver、`requires{minAppVersion,taskSchemaVersion,capabilities,platforms}`、输入参数类型校验）；
- 导出：单任务 JSON / 批量 ZIP；导入：只读预览 → 兼容检查 → **默认停用** → 不覆盖同 ID；
- 远端发现：从 GitHub 公开仓按约定关键字/topic 发现任务包；URL 逐 host 白名单校验、重定向每跳重验、流式下载大小上界（任务文件 ≤1MiB、聚合 JSON ≤5MiB 量级）、canonical JSON sha256 做文档身份去重、多源聚合按 star/更新时间排序；
- 导入失败给出**不兼容原因**（版本/能力/平台不符逐一说明）；
- 任务 JSON 兼容多版本 schema（v1 起，演进时归一化）。

### 不做

- 不做私有源/登录态源（本阶段只读公开仓）；
- 不做远端任务自动更新（每次手动导入）；
- 不做 WorkDaddy 的 `dom.*`/`session.*` 60-op DSL——本仓任务面向自有 agent/session API；
- 不复制 WorkDaddy 实现（AGPL 净室重写）。

## Given / When / Then

- Given：一个从公开仓发现的任务包；
- When：用户点导入；
- Then：只读预览 → 兼容检查通过 → 任务以**停用**态入列表、同 ID 不覆盖；URL 非白名单/超限/schema 不符时被拒并给出原因。

## 必须保持

- 远端内容**永不自动执行**：导入默认停用是硬断言；
- 凭据/会话数据不出仓——任务包只含任务定义；
- 下载链路不引入新网络权限面（走既有 fetch 约束）。

## 测试与验证

- 定向测试：schema 校验矩阵（版本/能力/平台不符拒绝）、URL 校验与重定向拦截、大小上界截断、导入停用断言；
- 用户流程：导出本地任务 → 改 ID 再导入 → 验证并存；从测试仓发现导入 → 验证停用态；
- 质量检查：`bun run check:quick`、`test:impact` 相关包。

## 交付记录

- 实际修改：`packages/coding-agent` automation-package 纯逻辑 + schema JSON；`apps/desktop` 安全下载/发现/导入导出服务 + IPC/preload + 自动化页导入/导出/发现 UI + i18n；release notes。
- 实际运行：见本轮 `test:impact` / `check:quick` 记录。
- 未运行及原因：未跑 `verify:ui:*`（用户未授权）；未对真实 GitHub 做联调（发现链用 mock/边界单测覆盖）。
- Worktree：主工作区串行。
- 剩余风险：公开 topic 仓数量可能为 0，发现面板空态属预期；导入 cwd 取默认对话目录，用户需自行确认后再启用。
