---
id: TASK-0208
type: task
status: in_progress
priority: P1
owner: coordinator
source: user-request；origin/chenxvhua 分支
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0030]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 899f4fce5492dfd79ae7ad67bfee8bae54abdcc2
read_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md]
write_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md, project/tasks/TASK-0208-integrate-allstar-coding-ac-fence.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 集成 origin/chenxvhua 的 allstar-coding v0.4

## 目标与范围

把用户指定的 `origin/chenxvhua`（7 个提交）合并进本地 `main`，按事实解决发布说明冲突后跑门禁，通过则把 main fast-forward 推到 `origin/dev`。

不做：不改写分支内容、不替作者补实现、不推 origin/main、不发布。

## 并发评估

串行；主工作区合并，无并行写入。冲突候选只有 `.github/release-notes/v0.1.3.md`。

## Given / When / Then

- Given：`origin/chenxvhua` 相对 `main` 领先 7 个提交，唯一冲突候选是发布说明；When：合并、按事实解决冲突、跑门禁；Then：本地 `main` 含该批改动、门禁通过、`origin/dev` fast-forward 到合并结果。

## 必须保持

- 不把 `Upstream baseline` 改成不在 `upstream/dev` 的提交（分支侧把该行误改为 `5eecd278d`，真值 `d217984c72ef7b5f66ce0a6fea1ae2375060d425`）。
- 不覆盖、不回退、不夹带任何不是本次合并产生的改动；不 force push、不推 `origin/main`、不发布。
- 保留分支自带的对 allstar-coding 发布说明内容的扩写。

## 测试与验证

- `bun run check`（全量静态门禁）。
- 插件自身用例（`allstar-coding` 包 test 脚本，含 `test/fence-judge.test.ts`、`test/ac-audit.test.ts`）。
- 合并后复核 `git log origin/dev..main`，确认推送范围只含本批。

## 交付记录

待实施（记录先落盘，随后合并）。
