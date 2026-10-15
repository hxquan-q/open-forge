---
id: TASK-0049
type: task
status: done
priority: P1
owner: release/product
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: coordination-only
branch: none
worktree: none
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [project/requirements/PRODUCT.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, project/plans/PLAN-0003-open-forge-rebrand.md]
write_paths: [project/requirements/PRODUCT.md, project/tasks, .github/release-notes]
exclusive_paths: [project/requirements/PRODUCT.md, project/tasks, .github/release-notes]
depends_on: [TASK-0044, TASK-0045]
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 社区目标确认

## 目标

为后续仓库文档和文档站更新确认可公开使用的社区、支持和讨论入口，并把决定记录为项目事实，避免从旧 Vetta 链接推测新地址。

## 范围

### 并发评估

- 结论：coordination-only；需要产品/发布负责人确认外部目标，不创建代码 Worktree。
- 执行方式：coordination-only。
- 可并行 Task：无；`TASK-0047`、`TASK-0048` 等待本任务决议。
- 前置依赖：TASK-0044、TASK-0045 完成并确认品牌称呼；当前 `PRODUCT.md` 将既有外部入口列为暂时有效。
- 冲突文件/独占路径：`project/requirements/PRODUCT.md`、本 Task 交付记录与 Release Notes。
- Branch：none；Worktree：none。
- 集成负责人：Coordinator 与产品/发布负责人。
- 集成顺序：确认保留现有入口或批准新目标 → 更新 `PRODUCT.md` 与本 Task 记录 → 解锁文档迁移 Task。

### 做

- 明确 Discord、GitHub Discussions 和支持/联系入口继续使用现有目标还是改到经确认的新目标。
- 在用户确认后更新产品事实源；将“暂保留旧入口”与“品牌迁移已完成”明确区分。

### 不做

- 不创建 Discord/其他社区，不发布公告、不邀请成员、不修改线上设置。
- 不猜测域名、邮箱、组织账号或社区链接。
- 不因为此次决策修改 `@vetta/*`、`VETTA_*`、协议、凭据或数据目录。

## Given / When / Then

- Given：现有 Open Vetta 外部入口仍被记录为暂时有效，且 Open Forge 新社区目标尚未确认；When：产品/发布负责人明确选择保留现有入口或提供经批准的新目标；Then：`PRODUCT.md` 记录唯一当前事实源，后续文档 Task 只使用已确认链接，且没有发生外部账号创建或发布。

## 必须保持

- 外部目标必须由负责人明确提供或确认，Agent 不生成猜测链接。
- 决策记录不得宣称尚未迁移的站点或社区已完成品牌迁移。
- 本任务只记录决策和仓库内文档事实，不产生真实外部副作用。

## 测试与验证

- 定向检查：新目标可访问性由负责人提供证据；核对 `PRODUCT.md` 中相关链接与 Plan/Task 状态一致。
- 用户流程：从 README、文档站和讨论入口逐项核对最终链接；本 Task 不执行外部账号操作。
- 质量检查：文档链接与相对路径核对；更新当前版本 Release Notes。

## 收口记录（2026-10-05）

- 决策已取得（2026-09-25）：社区入口暂时不建设——保留现有外部入口（openvetta.com、docs.openvetta.com、github.com/openvetta/open-vetta、Discord、GitHub Discussions、LINUX DO 链接），不创建新 Discord/社区，不做任何外部变更。
- 决策已同步 `project/requirements/PRODUCT.md`（Brand Commitments，含 2026-09-25 用户确认原文）。
- 前置依赖已满足：`depends_on: [TASK-0044, TASK-0045]` 两者 frontmatter 均为 `done`（TASK-0044 Desktop 文案迁移、TASK-0045 CLI 与生态身份迁移），因此本任务按原计划转 `done`，仅需复核记录，无额外实施。
- 实际修改：`PRODUCT.md` Brand Commitments 一条（2026-09-25）；本记录状态与收口（2026-10-05）。
- 实际运行：无代码与外部操作；coordination-only，未创建任何外部账号或发布。
- 未运行及原因：不适用（无代码改动与外部账号操作）。
- 剩余风险：现有外部入口仍挂旧品牌域名与仓库名；若后续购域或决定建设新社区，需重新决策并同步 `TASK-0047` / `TASK-0048`。
