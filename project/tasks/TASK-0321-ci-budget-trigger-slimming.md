---
id: TASK-0321
type: task
status: verifying
priority: P1
owner: release/product
source: ISSUE-0029
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0029]
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: a7ef4874d
read_paths: [.github/workflows/quality.yml, .github/workflows/desktop-packaged.yml, scripts/quality/quality-gates.test.mjs, project/issues/ISSUE-0029-ci-actions-budget-exhausted.md]
write_paths: [.github/workflows/quality.yml, .github/workflows/desktop-packaged.yml, scripts/quality/quality-gates.test.mjs, project/issues/ISSUE-0029-ci-actions-budget-exhausted.md, project/tasks/TASK-0321-ci-budget-trigger-slimming.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 预算受限下收敛 CI 触发面

## 目标

在 GitHub Actions 预算耗尽（[ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)）期间保留有效反馈：`dev` push 只运行轻量质量检查；完整三平台单测矩阵与 desktop-packaged 改为 PR / 手动触发；同时在账户侧停用名下其他仓库的 Actions，避免继续消耗额度。

## 范围

### 并发评估

- 结论：不支持并发（修改集中在两个 workflow 与一处质量合同测试，串行成本最低）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`.github/workflows/quality.yml`、`.github/workflows/desktop-packaged.yml`、`scripts/quality/quality-gates.test.mjs`、项目记录
- Branch：`main`
- Worktree：`.`
- 集成负责人：coordinator
- 集成顺序：本 Task 单独集成

### 做

1. `quality.yml`：保留 `push` 到 `dev` 的 `check-and-test`（ubuntu 轻量检查）；`unit-tests` 三平台矩阵仅由 PR 与 `workflow_dispatch` 触发，手动运行时以 `origin/dev` 为变更基线；
2. `desktop-packaged.yml`：移除 `push` 触发，保留 `pull_request` 并新增 `workflow_dispatch`；
3. 在 `quality-gates.test.mjs` 增加合同断言，锁定「push 轻量、PR/手动完整」的触发面；
4. 更新 ISSUE-0029 决策记录与 Task 索引；
5. 账户侧停用 `dyp`、`ShunX`、`xiaoai`、`weallstar` 等其他仓库的 Actions（不涉及本仓文件）。

### 不做

- 不删除任何检查步骤、不降低断言或超时、不把失败改为 `continue-on-error`；
- 不修改 `desktop-cache` 的缓存预热计划、CodeQL 默认配置与 public 仓库 Actions（后两者不消耗私有仓库额度）；
- 不向 `upstream` push、不创建 PR、不触发发布或部署；
- 不代替用户调整账户预算；预算恢复仍由用户决定。

## Given / When / Then

- Given：`dev` 分支收到一次 push；
- When：`quality` 与 `desktop-packaged` 被触发；
- Then：只有 `check + quality tests`（ubuntu）实际运行，三平台单测矩阵与 desktop-packaged 不启动。
- Given：仓库收到一个 PR 或维护者手动运行 workflow；
- When：`quality` / `desktop-packaged` 被触发；
- Then：三平台单测矩阵与 desktop-packaged 恢复完整运行。

## 必须保持

- PR 路径仍覆盖 ubuntu/macOS/Windows 三平台 `test:changed`；
- `cancel-in-progress: true`、`fail-fast: true`、完整 Git 历史与依赖安装动作不变；
- desktop-packaged 的 packaging contract 与 packaging-sensitive smoke 判定不变；
- 本地质量入口、缓存键与权限声明不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run scripts/quality/quality-gates.test.mjs scripts/quality/desktop-release-workflow.test.mjs`；
- 质量检查：`bun run test:quality`、`bun run check`；
- 远端证据：本次推送后 workflow 因预算被拒启，无法取得运行绿；该项在预算恢复后补跑。

## 验收分层

- 工程验证：通过。定向合同测试 2 文件 / 128 例通过；`bun run test:quality` 526 例通过；`bun run check` 退出码 0。
- 技术评审：自审；核对 YAML 触发面、手动运行基线与既有矩阵断言均未被削弱。
- 集成：`integration_status: pending`，待提交与推送。
- 人工功能验收：待用户确认触发面符合预期。
- 发布：未授权。

## 交付记录

- 实际修改：`quality.yml` 增加 `workflow_dispatch`、`unit-tests` 仅在 PR/手动运行、手动运行回退 `origin/dev` 基线；`desktop-packaged.yml` 移除 `dev` push 触发并保留 PR/手动；`quality-gates.test.mjs` 新增 1 例触发面合同；同步 ISSUE-0029、本 Task 与 Task 索引。
- 账户操作：`dyp`、`ShunX`、`xiaoai`、`weallstar` 的 Actions 已停用（`enabled=false` 已复核）；脚本 `gh api -X PUT repos/hxquan-q/<repo>/actions/permissions -F enabled=false`。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/quality/quality-gates.test.mjs scripts/quality/desktop-release-workflow.test.mjs`（128/128）；`bun run test:quality`（526/526）；`bun run check`（退出码 0）。
- 未运行及原因：远端 CI 无法取得绿——Actions 预算仍在拒启所有 job（ISSUE-0029），本地改动推送后也不会启动；预算恢复后需补 PR/手动触发的实际运行证据。
- 剩余风险：手动运行 `quality` 以 `origin/dev` 为基线；手动运行 `desktop-packaged` 的 smoke 判定仍以 `${GITHUB_SHA}^` 为基线，若打包敏感改动不在最后一个提交内可能跳过 smoke。
