<!-- Copyright The Open Forge contributors. -->
# Open Forge 开发分支与 Task 生命周期

本文件是 Open Forge 日常开发、Task Worktree、集成、推送和稳定版晋升的操作合同。根 [`AGENTS.md`](../../AGENTS.md) 对所有 Agent 生效；Claude Code 额外入口见 [`CLAUDE.md`](../../CLAUDE.md)。

## 分支角色：本地 main → 远端 dev → 远端 main

```text
Task Worker（隔离 worktree / task/TASK-xxxx-*）
        │ 实现、定向测试、原子提交；不推共享分支
        ▼
Coordinator：合入本机 main → 集成测试 / 完整门禁
        │ 只在所有待推提交均已验收后执行 git push origin main:dev
        ▼
origin/dev（开发集成候选）
        │ 用户按阶段审查并合入
        ▼
origin/main（稳定 / 发布分支）
```

- **日常集成基线**：本地长期分支只有 `main`。不要新建或维护长期本地 `dev`、`forge/dev`；`origin/dev` 是远端集成候选，不 checkout 成另一条长期本地分支。
- **稳定版边界**：`origin/main` 由用户阶段性从 `origin/dev` 晋升。Agent 不直接 push、merge、rebase 或 reset `origin/main`；只有用户针对某次具体操作另行明确要求时才例外。
- **上游边界**：`upstream` 仅用于 fetch 和对照；禁止向上游 push、PR 或请求合并。
- **长期授权范围**：用户已授权标准流程在验收后运行 `git push origin main:dev`。该授权只覆盖 fast-forward 发布到个人仓库 `origin/dev`，不覆盖 `origin/main`、`upstream`、Task feature branch 的远端 push、force push、tag、Release 或构建发布。

## Task 拆分与 Worktree

### Coordinator 派工前

1. `git status --short` 检查主工作区；已有改动按其 Owner 保留。新 Task 只基于已提交的 `main` HEAD，主工作区有相关未提交内容时先确认归属与依赖，不把脏改动假定为基线。
2. 形成 Task 合同：Owner、Given/When/Then、验收与测试、`read_paths` / `write_paths` / `exclusive_paths`、依赖和冲突路径、集成次序。
3. 对确实并行实现的**每个代码 Task**，使用独立 `task/TASK-xxxx-<slug>` branch 与独立 Worktree；不得两个 Worker 在同一个工作目录并行写入。不能安全拆分时改成 `execution: serial`；只读分析使用 `coordination-only`，不建代码 Worktree。
4. 派工前运行：

   ```bash
   bun run worktree:check --all
   bun run worktree:create --task TASK-xxxx
   bun run worktree:status --task TASK-xxxx
   ```

   合同/路径冲突必须先解决或明确写入 `conflicts_with` 并定好串行集成顺序。创建使用 `.worktreeconfig.json` 的 `baseRef: "main"`，不从陈旧的 `origin/dev` / `origin/forge/dev` 分支开始。

### Worker 完成 Task

在自己的 Worktree 内完成：

1. 先跑最小行为回归与常见用户流程测试，再跑 `bun run test:impact -- <Task 文件路径...>`、`bun run check:quick -- <Task 文件路径...>`。
2. 测试通过后，逐个暂存本 Task 文件，核对后按原子变更提交；功能代码与配套测试同一提交，独立 concern 分开提交。**提交必须带 pathspec**（共享索引无锁，其他会话可能已把他们的文件暂存进来，不带 pathspec 的 commit 会整索引提交）：

   ```bash
   git status --short
   git add -- <本 Task 文件路径...>
   git diff --cached --check
   git diff --cached --name-only   # 确认没有别人的文件混入
   git commit -F - -- <本 Task 文件路径...>
   git log -1 --stat               # 提交后核对文件清单
   ```

   若发现他人文件被卷入提交：立即 `git reset --soft HEAD~1`，用 pathspec 重交，暂存区其余内容原样归还。使用仓库中文多行格式；严禁 `git add .` / `git add -A`、`--no-verify`、`commit --amend`。
3. 向 Coordinator 交接 Task branch/commit、修改文件、实测命令、失败/未运行项和剩余风险；不要自行改主工作区中的 Task 状态或 Project 索引。Coordinator 在本地 `main` 集成时核实证据并更新 Task 交付记录。
4. Worker **不 push** 到 `origin/dev` 或 `origin/main`，也不删除 Worktree。

测试失败、冲突未解或结果无法归属时，Task 保持 `verifying` / `blocked`，保留 branch 与 Worktree；先记录可复现证据，不能为了清理状态删断言、跳过门禁或强行集成。

## Coordinator 集成到本地 main

一次集成一个 Task，按 `depends_on` 与 `conflicts_with` 排序：

```bash
# 在主检出确认当前分支及工作区；集成前要求干净
git switch main
git status --short
bun run worktree:check --task TASK-xxxx

# 保留可审查的 Task 边界；先合入但暂不创建 merge commit
git merge --no-ff --no-commit task/TASK-xxxx-<slug>

# 对冲突逐项结合合同解决；随后运行集成后的行为测试
bun run test:impact -- <已集成改动路径...>
bun run check
```

- 只有合并结果测试和质量门禁全通过后，才创建该 Task 的集成提交；将 Task 状态、`integration_status: integrated`、实际集成提交及验证结果写回 Project 记录。为了让 Worktree 能在 origin/dev 推送后立即安全清理，在这次集成提交中将 `worktree` 标记为 `unassigned（已集成，待推送后清理）`；保留 `branch` 字段作为历史来源，供 `worktree:remove --task` 定位。
- 若冲突不可安全解决或集成验证失败，且当前仍处于该次 Git merge 中，使用 `git merge --abort` 退出；主工作区开始集成前必须干净，其他未提交工作区不在本次合并里。Task branch / Worktree 保留等待修复，不 force、不 reset。
- 项目索引和 Task 状态由 Coordinator 维护；Worker 的交付记录应由 Coordinator 集成时核实并落库，避免多个并行 Task 同时改共享索引文件。

## 工程验收与产品接受

本流程的“验收”指开发候选的工程验收；与人工接受的关系统一见 [交付合同](../../.agents/skills/open-forge-task-intake/references/delivery.md)。推送仍须满足下面全部批次条件。

## 验收后推送到 origin/dev

只有下列条件全部满足，Coordinator 才运行标准推送；该动作属于用户授予的日常工作流授权，不需要每个已完成 Task 再逐次询问：

```bash
# 必须在本地 main；工作区干净
git branch --show-current
git status --short

# 先审核完整待推提交批次，不能夹带未验收的 Task
git fetch origin
git log --oneline origin/dev..main
bun run test:changed --base origin/dev
bun run check

# 仅 fast-forward 推送已验收集成批次
git push origin main:dev
```

- `git log origin/dev..main` 中每个提交都必须属于已测试、已集成的工作。若 main 上还有未验证的独立提交，先完成或拆分其验收；不把整条 main 历史盲目推给 dev。
- 任何测试/门禁失败、main 脏、提交归属不清、远端分叉、non-fast-forward 或推送拒绝：停止，不使用 `--force`。先 fetch 并检查差异；若需把新的 `origin/dev` 纳入本地 main，合并后重新跑受影响测试与 `check` 再推。
- 本流程不推 `origin/main`。用户自行在阶段检查后把 `origin/dev` 合入 `origin/main`，以控制稳定版节奏。

## Worktree 清理

Task 已推到 `origin/dev` 且 Worktree 内容已并入 `main` 后，Coordinator 才清理：

```bash
bun run worktree:status --task TASK-xxxx
bun run worktree:remove --task TASK-xxxx
```

`remove` 默认拒绝 dirty、锁定、未跟踪、未推送提交或 Git 状态未知的 Worktree；不要把 `--force` 当常规清理方式。只在 origin/dev 推送成功后运行清理。`worktree` 已在集成提交中标记为“已集成、待清理”，因此清理成功后不需再单独提交一次仅更新该字段的 Project 元数据；`branch` 保留为已集成 Task 的来源记录。若清理因 dirty/lock 等原因失败，Worktree 和 Task branch 均保留，查明 Owner 与内容后再重试。未完成、未集成、仍在使用或 owner 未确认的 Worktree 一律保留。

本地没有活动 Task 时应只保留长期 `main` 分支；活跃 Task 的本地 `task/*` 分支仅作为其 Worktree 生命周期的一部分。远端 `origin/dev` / `origin/main` 是远端 refs，不因此创建长期本地 `dev` / `forge/dev` 分支。

## PR 标题与结构变更门禁

`.github/workflows/pr-title.yml` 在 PR opened/edited/reopened/ready_for_review 时校验标题形如 `<type>(<scope>): <description>`；type 与 scope 白名单由 `scripts/quality/check-pr-title.mjs` 维护——scope 自动派生自 `package.json#workspaces` 各包目录名（含 presets/externals 展开项），外加 `EXTRA_SCOPES` 中的非包域（`quality`、`project`、`docs`、`ci`、`release`、`runtime`、`mcp` 等）。本地预检：`bun run scripts/quality/check-pr-title.mjs -- "<title>"`。

- 只校验 PR 标题，不校验 commit message；不追溯历史 PR；不新增第三方 Action 依赖。
- `pull_request_template.md` 的 `## Structural changes` 段在勾选 `Public contract` 时必填：受影响消费者/实现、兼容性影响、迁移计划与豁免引用（waiver/ADR/OWNERS）。
