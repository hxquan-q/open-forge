<!-- Modified by The Open Forge contributors. -->
# Git、上游与协作规则

本文是[根规则](../../../AGENTS.md)按任务触发加载的全仓规则扩展，约束级别不因拆分而改变；更近一级 AGENTS 可收紧。代码路径、命令与原文中的“根文件”均相对仓库根，不相对本文目录。

## 上游同步与改动归属

- 每个 fork 侧改动归属三类之一，并在对应 Task 中标注：**Upstreamable**（可回馈上游，保持补丁干净、不混入 fork 专属逻辑）、**Open-Forge-only**（留在 fork 新增的包、适配层或扩展点）、**Compatibility**（为兼容凭据、协议、持久化或存量数据而保留的标识与适配，须注明保护的合同）。
- 本项目日常开发/集成固定在本地 `main`；并行代码 Task 各用 `task/TASK-xxxx-<slug>` 独立 Worktree，基线为本地 `main`。不要维护长期本地 `dev` 或 `forge/dev`。
- `origin/dev` 是已测试的开发集成候选，`origin/main` 是稳定/发布分支；Coordinator 验收本地 `main` 待推批次后可按 [`development-workflow.md`](../../../project/collaboration/development-workflow.md) 的长期授权执行 `git push origin main:dev`。该授权不覆盖 `origin/main`、上游、force push、tag 或 Release。
- `upstream` 仅用于 fetch 与差异对照；禁止向上游 push、开 PR 或请求合并。上游同步必须作为有明确范围的 Task 规划；不得用 `forge/dev` 替代本地 `main` 或 `origin/dev`。
- 每次上游同步后重跑受影响面的行为合同测试；同一热文件反复冲突时先重评薄壳边界，不沿用历史冲突预算。
- 已发布的上游 Release Notes 是上游发行物记录，fork 不得改写或追加 fork-only 条目；Open Forge 候选发布文案暂存关联 Issue/Task，首发版本确认后迁入自己的版本说明。
## Git 与并行工作区

- 工作区可能同时包含用户或其他 Agent 的改动。不要覆盖、回退、移动或删除不是本次任务产生的变更。
- 禁止使用 `git reset --hard`、`git checkout .`、`git clean -fd`、`git stash`、`git add .`、`git add -A` 和 `git commit --no-verify`。
- 每完成一个 Task 或一组自洽修改且验证通过后就提交，无需每次另行征求提交授权；仍按原子化原则拆分，一次提交只做一件事。暂存时逐个列出本次修改的具体路径，并在提交前用 `git status` / `git diff --cached` 核对 staged 内容。
- Worker 只在自己的 Task Worktree 提交 Task 原子提交，不直接推 `origin/dev`。Coordinator 完成本地 `main` 集成并跑完规定测试和完整 `check` 后，用户已预先授权其将**已验收批次** fast-forward 推到 `origin/dev`；推送前必须审核 `git log origin/dev..main`，不得夹带未验收提交。
- `origin/main` 的稳定版晋升由用户阶段性完成；Agent 默认不得 push/merge `origin/main`。任何不属于上述 `main:dev` 验收流程的 Push、PR、tag、Release 或部署都必须另行取得用户明确授权。
- Commit message 必须使用中文多行格式，至少包含标题、空行和正文，不得只写单行标题。
- 标题应简短概括单一逻辑变更，并遵循仓库现有的语义化前缀风格（如 `feat(auth): ...`）；标题与正文之间保留一个空行。
- 正文用 1–3 句说明改动动机、背景和影响，重点解释“为什么”，避免逐项复述 diff；长段落按约 72 个字符换行，使用Markdown列表来分别列出做了什么。
- 不添加 `Co-Authored-By`、`Signed-off-by` 等作者信息。存在关联工单时，在正文后空一行添加独立尾注 `fixes #N` 或 `closes #N`。
- 不 force push。Rebase 冲突若落在本次未修改的文件中，立即中止并请求用户处理。
