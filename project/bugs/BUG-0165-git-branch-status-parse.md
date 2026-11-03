---
id: BUG-0165
type: bug
status: verifying
priority: P2
owner: apps/desktop/git
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 / code-mode-audit-2026-10-30 §四 G01
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0426]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Git 页签分支名解析两处稳定错误

## 用户流程

- Given：项目分支领先/落后远端（`## main...origin/main [ahead 1]`），When：打开右栏 Git 页签，Then：应显示 `main`。
- Given：仓库处于 detached HEAD（`## HEAD (no branch)`），When：打开 Git 页签，Then：应显示 `HEAD (<短SHA>)` 兜底。

## 实际行为

- 带跟踪与 ahead/behind 标记的分支显示成 `main...origin/main`（连上游一起当分支名）。
- detached HEAD 行被解析出 `HEAD`，导致 `getGitRepoStatus` 走不到 `rev-parse --short` 兜底，短 SHA 展示不可达。

## 环境与失败证据

- 基线 `98f7de9e6`，Windows / Desktop 0.1.3。
- `git-repo-status.test.ts` 两条断言（`main...origin/main [ahead 1]` → `main`、detached → null）在全量与隔离复跑中均失败（TASK-0425 §5.2/5.3、报告 G01）。
- 根因：`parseStatusBranchLine` 的正则 `/^## (?!No branch)(\S+)/` 用 `\S+` 吞掉 `...origin/main`；`HEAD (no branch)` 是小写 no branch，`(?!No branch)` 前瞻拦不住 `HEAD`（`git-repo-status.ts:38`）。

## 最小复现

1. 在任一分支 `git commit` 后不 push（产生 ahead 标记），打开该项目 Git 页签，分支名含 `...origin/...`。
2. `git checkout --detach`，刷新 Git 页签，分支显示 `HEAD` 而非 `HEAD (短SHA)`。

## 影响

右栏 Git 页签分支展示错误；detached 场景短 SHA 兜底失效。只影响展示，不产生写操作。

## 根因证据

同上失败证据：现有测试即期望行为的表达，当前实现两红。

## 回归测试

`git-repo-status.test.ts`：跟踪+ahead 行 → 本地分支名；detached 行 → null；补空仓库首行 `## No commits yet on main` → `main`（旧实现会把 `No` 当分支名，同函数边界一并覆盖）。

## 修复与验证

- 修复：`parseStatusBranchLine` 重写——先剥 `## ` 前缀；`HEAD`（detached）与旧形态 `No branch` 返回 null；空仓库 `No commits yet on <branch>` 取 `<branch>`；其余先去 `...upstream` 跟踪段、再去空白后缀，只留本地分支名（`git-repo-status.ts:36-52`）。`parsePorcelainStatus` 与 `getGitRepoStatus` 命令合同未动。
- 测试：红基线 3 失败（既有跟踪/detached 两断言 + 新增空仓库用例）→ 修复后 5/5 通过（`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/git/git-repo-status.test.ts`）。
- 检查：`bun run check:quick -- git-repo-status.ts git-repo-status.test.ts` 通过（Biome+守卫）。完整 check 与 impact 随 PLAN-0028 批次收尾统一执行。
- 未运行及原因：真实仓库页面目验属人工验收（待用户可选）；本修复为纯字符串解析边界，已由表驱动单测覆盖。
