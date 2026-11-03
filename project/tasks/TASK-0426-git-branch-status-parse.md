---
id: TASK-0426
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0165（TASK-0425 报告 G01）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0425]
related_issues: []
related_bugs: [BUG-0165]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 98f7de9e6
read_paths:
  - apps/desktop/src/main/git
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - project/bugs/BUG-0165-git-branch-status-parse.md
write_paths:
  - apps/desktop/src/main/git/git-repo-status.ts
  - apps/desktop/src/main/git/git-repo-status.test.ts
  - project/tasks/TASK-0426-git-branch-status-parse.md
  - project/tasks/README.md
  - project/bugs/BUG-0165-git-branch-status-parse.md
  - project/bugs/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - project/plans/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0152-git-branch-parse.md
exclusive_paths:
  - apps/desktop/src/main/git/git-repo-status.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 修复 Git 页签分支名解析（BUG-0165）

## 目标

右栏 Git 页签的分支展示正确：跟踪+ahead/behind 标记只显示本地分支名；detached HEAD 走短 SHA 兜底；空仓库首行不再把 `No` 当分支名。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0028 首片，主检出串行。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`git-repo-status.ts` 为本 Task 独占；与工作树中 TASK-0339/0392 候选（browser/activity-panel）无文件交集。
- Branch：主检出 chenxvhua。
- Worktree：不拆。
- 集成负责人：当前 Coordinator。
- 集成顺序：PLAN-0028 第 1 片。

### 做

1. 确认 `git-repo-status.test.ts` 既有两断言在当前实现失败（红基线）。
2. 修 `parseStatusBranchLine`：跟踪形态 `branch...upstream [ahead N]` 只取本地名；detached（`HEAD (no branch)`/旧形态 `No branch`）返回 null；空仓库 `## No commits yet on <branch>` 取 `<branch>`。
3. 补空仓库用例；定向测试全绿。
4. 更新 BUG-0165、本 Task 交付记录与 v0.1.4 fragment；同步三处索引。

### 不做

- 不改 `parsePorcelainStatus`（变更列表解析）与 `getGitRepoStatus` 的命令、超时、null 语义；
- 不做真实仓库 E2E（解析函数纯字符串边界已覆盖）；
- 不处理 §5.3 其他环境失败。

## Given / When / Then

- Given `## main...origin/main [ahead 1]`，When 解析，Then 得 `main`。
- Given `## feat/x`，When 解析，Then 得 `feat/x`。
- Given `## HEAD (no branch)` 或空行，When 解析，Then 得 null（由调用方走短 SHA 兜底）。
- Given `## No commits yet on main`，When 解析，Then 得 `main`。

## 必须保持

- `getGitRepoStatus` 只读命令合同（status/rev-parse、4s 超时、非 git 仓库返回 null）；
- detached 兜底输出格式 `HEAD (<短SHA>)` 不变；
- 变更条目解析行为不变。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/git/git-repo-status.test.ts`（当前预期 2 红 → 修复全绿）。
- 质量检查：`bun run check:quick -- apps/desktop/src/main/git/git-repo-status.ts apps/desktop/src/main/git/git-repo-status.test.ts`。
- 完整 check 与 impact 留批次收尾统一执行。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待用户在真实项目 Git 页签目验（可选）。
- 发布：未授权。

## 功能验收包

- 入口：打开任一 git 项目的右栏 Git 页签。
- 预期：分支名不含 `...origin/...`；detached 时显示 `HEAD (短SHA)`。
- 不通过表现：分支显示完整跟踪串或裸 `HEAD`。

## 交付记录

- 实际修改：`git-repo-status.ts` 重写 `parseStatusBranchLine`（跟踪段剥离、detached 旧/新形态判 null、空仓库取 `No commits yet on` 后分支名）；`git-repo-status.test.ts` 增 behind/无标记跟踪与空仓库用例；新建 PLAN-0028/BUG-0165/本 Task 与 plans/bugs/tasks 三索引行；v0.1.4 fragment `bug-0152-git-branch-parse.md`。
- 实际运行：定向红基线 3 失败/2 通过（与 BUG-0165 记录一致）→ 修复后 5/5 通过；`bun run check:quick -- <两个文件>` 通过（Biome+守卫，ratchet 未新增违规）。
- 未运行及原因：完整 `bun run check` 与 `test:impact` 留 PLAN-0028 批次收尾统一执行（本片影响面仅一个纯函数）；真实 Desktop Git 页签目验待用户可选，不阻塞工程结论。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知。空仓库形态依 porcelain v1 标准输出；用户自定义 `status.format` 不在本合同内。
