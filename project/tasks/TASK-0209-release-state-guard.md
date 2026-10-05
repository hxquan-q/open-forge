---
id: TASK-0209
type: task
status: done
priority: P1
owner: release/desktop
source: user-request；RESEARCH-0023；PLAN-0016 阶段 1 与 2
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: []
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: fd52a3e89c
read_paths: [scripts/release/release-notes.mjs, scripts/release-desktop.mjs, docs/dev/agent-rules/delivery.md, .github/release-notes, .github/workflows/desktop-release.yml]
write_paths: [scripts/release/release-notes.mjs, scripts/release/release-notes.test.mjs, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, docs/dev/agent-rules/delivery.md, .github/release-notes/README.md, .github/release-notes/v0.1.3.md, .github/workflows/desktop-release.yml, project/tasks/TASK-0209-release-state-guard.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 发布状态可判定：政策成文加发布状态守卫

## 目标与范围

把「一个版本是否已发布」变成仓库里可机械判定的事实，并把口径写进规范。对应 [PLAN-0016](../plans/PLAN-0016-version-management-release-refactor.md) 的阶段 1 与阶段 2。

做：

- 发布日期只在发布动作里产生：`prepare` 写「待定」，`publish` 由脚本写入当天日期；`publish` 的前置校验从「日期不含待定」翻转为「日期必须是待定」。
- `scripts/release/release-notes.mjs --check`（已在 `check:guards` 中执行）增加状态校验：当前开发版本的说明文件名、标题与 `apps/desktop/package.json#version` 必须一致；没有 `v<版本>` tag 时日期必须是「待定」；已有 tag 时说明文件必须与 tag 处内容一致（已发布只读）。所有 `v*.md` 的标题必须与其文件名版本一致。
- 把版本事实源、0.x 语义、「发布日期只在发布时写」、「上游基线行只由脚本写」、「已发布版本文件只读」与各应用版本归属写进 `docs/dev/agent-rules/delivery.md` 与 `.github/release-notes/README.md`。
- 修正 `v0.1.3.md`：该版本尚未发布，日期回到「待定」。

不做：不改 `desktop-release.yml` 的发布语义与 job 结构（只在必要处补 checkout 深度）；不做 PLAN-0016 的阶段 3、4、5；不执行任何真实发布、tag 或 push。

## Given / When / Then

- Given 当前 `package.json` 版本为 0.1.3 且不存在 `v0.1.3` tag；When 运行 `bun run check`；Then 说明文件必须写「待定」，写成具体日期即失败。
- Given 用户要发布 0.1.3；When 运行 `publish 0.1.3 --confirm-publish`；Then 脚本先把「待定」替换为当天日期，再提交、打 tag 并原子推送；若文件已是具体日期则拒绝，提示先改回「待定」。
- Given 某版本已发布（存在 tag）；When 有人修改其说明文件；Then `--check` 报出与 tag 处内容不一致。

## 必须保持

- `apps/desktop/package.json#version` 仍是发布版本唯一事实源；不改 `ISSUE-0007` 冻结的「纯 X.Y.Z、无预发布后缀、GitHub Release 打 pre-release、publish 由用户执行」。
- 不改已发布版本的 Release Notes 正文；不引入新依赖；不调用真实 GitHub 或 R2。
- `--check` 在取不到 git 标签信息时只跳过「日期状态」这一条，其余校验照旧。

## 测试与验证

- `scripts/release/release-notes.test.mjs`：补状态校验用例（标题与文件名不符、无 tag 却写了日期、有 tag 却是待定、有 tag 且内容与 tag 不一致、全部通过的正例）。
- `scripts/release-desktop.test.mjs`：补「prepare 模板为待定」「publish 前置要求待定」「写入当天日期」用例。
- `bun run test:quality`、`bun run check`（含 `check:guards` 里的 `release-notes.mjs --check`）。
- 不跑真实发布；真实验证只到「守卫在本地与 CI 静态阶段生效」。

## 交付记录（2026-10-05）

- 实际修改：
  - `scripts/release-desktop.mjs`：`publish` 前置校验改为要求日期停在占位；新增 `PLACEHOLDER_DATE_LABEL`、`localToday()`、`stampReleaseDate()`，并在提交与打 tag 之前把占位替换成当天日期。
  - `scripts/release/release-notes.mjs`：新增 `releaseNotesStateProblems`（纯函数）、`releaseNotesVersions`、`collectReleaseNotesProblems`；`--check` 现在校验文件名、标题、日期状态与基线行，已发布版本还会与 tag 处内容逐字比对；上游继承的 `# Vetta …` 说明跳过。
  - `docs/dev/agent-rules/delivery.md` 新增「版本与发布状态」一节；`.github/release-notes/README.md` 同步标题与只读两条。
  - `.github/workflows/desktop-release.yml` 的质量作业补 `fetch-depth: 0`，否则取不到 tag 会把已发布误判为未发布。
  - `.github/release-notes/v0.1.3.md` 的日期从 `2026-09-29` 回到「待定」。
  - 两个 `scripts/release/` 源在本次改动后成为 fork 修改文件，按仓库规则补了声明头。
- 验证命令与结果：
  - `bun run test:quality`：37 文件 / 497 项通过（新增 10 项）。
  - `node scripts/release/release-notes.mjs --check`：通过（v0.1.3 停在占位且无 tag，其余 v*.md 标题一致）。
  - `bun run check`：exit 0（含 `check:guards` 里的同一守卫与声明头 ratchet `new=0`）。
- 未运行及原因：未执行任何真实 `publish`、tag 或 push；本轮不涉及发布授权。
- 剩余风险：`workflow_dispatch`（无 tag）走正式发布时，说明里的日期会停在占位；本仓正式发布路径是 `release:desktop:publish`（它会写日期并原子推 tag），该边界已写入交付规则待按需处理。历史文件 `v0.1.1.md` 有日期而无 tag，属既有记录，本轮不追溯。
- 集成：实现提交 `53f674121`（本地 `main`），`integration_status: integrated`；未推送、未发布。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI、工具链、规则、文档或仓库设置，无用户可观察行为变化；既定验收标准（静态门禁与定向测试）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
