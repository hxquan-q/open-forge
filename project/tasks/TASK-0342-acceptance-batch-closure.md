---
id: TASK-0342
type: task
status: done
priority: P2
owner: coordinator
requirement:
plan:
source: user-request（会话中确认「验收完成」）
related_requirement: []
related_plan: [PLAN-0018, PLAN-0019]
related_tasks: [TASK-0309, TASK-0310, TASK-0311, TASK-0312, TASK-0313, TASK-0314, TASK-0315, TASK-0316, TASK-0317, TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0327, TASK-0328, TASK-0330, TASK-0331, TASK-0332, TASK-0334, TASK-0335, TASK-0336, TASK-0337, TASK-0338, TASK-0339, TASK-0340]
related_issues: []
related_bugs: [BUG-0134, BUG-0135]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f42466feb
read_paths: [project/tasks, project/bugs, project/verification]
write_paths: [project/tasks, project/bugs/README.md, project/bugs/BUG-0134-browser-tab-generic-error-repeat-loop.md, project/bugs/BUG-0135-html-preview-loses-file-directory-semantics.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 验收批次收口：浏览器/预览线、上游 UI 同步、自主开发与安全批次

## 目标

用户在会话中确认四条待验收批次「验收完成」，本 Task 把这条用户决定落到台账：把对应 Task 从 `verifying` 闭合为 `done`，同步索引与关联 Bug 状态，并在每条记录里写明闭合依据是本轮用户验收，而不是 Agent 推断。

## 范围

### 并发评估

- 结论：不支持并发（纯台账改动，单文件写入且互相依赖索引一致性）
- 执行方式：coordination-only
- 可并行 Task：无
- 前置依赖：各批次工程验证与集成已完成（见各自交付记录）
- 冲突文件/独占路径：`project/tasks/README.md`、`project/bugs/README.md`
- Branch：main
- Worktree：未拆出（主工作区串行）
- 集成负责人：coordinator
- 集成顺序：单次提交

### 做

- 闭合 26 个 Task：`0309`–`0317`（安全与设计插件批次）、`0322`–`0328`、`0330`–`0332`、`0334`（PLAN-0019 自主开发）、`0335`–`0338`（上游 UI 同步）、`0339`/`0340`（浏览器/预览线）。
- 同步 `BUG-0134`、`BUG-0135` 为 `done`（修复随 0339/0340 验收）。
- 更新 `project/tasks/README.md` 当前执行焦点表与 `project/bugs/README.md` 状态列。

### 不做

- 不闭合 `0318`（WeKnora 客服）、`0319`（侧边栏命名）——不在本次用户确认的范围内。
- 不闭合 `0321`（CI 预算）、`0329`（blocked）、`0333`（已 done）；不改动 `0341`（在途实施）。
- 不改任何实现、测试或发布说明；不把闭合写成发布完成。

## Given / When / Then

- Given 某 Task 处于 `verifying` 且工程验证与集成已记录；When 用户明确反馈本批次验收完成；Then 该 Task 置 `done`，交付记录追加用户验收依据。
- Given 某 Task 有对应的 `verifying` Bug；When 修复 Task 因用户验收闭合；Then Bug 同步置 `done`。
- Given `README.md` 索引列出的状态；When 与 frontmatter 不一致；Then `bun run check` 失败。

## 必须保持

- 状态与事实以 Task/Bug frontmatter 为准，索引只是副本。
- 记录用户验收时区分「用户已确认」与「按授权推断」；本批属于前者。
- 不夹带在途改动（`browser-runtime-manager` 等 TASK-0341 工作）进入本次提交。

## 测试与验证

- 定向测试：不适用（无代码变更）。
- 用户流程：不适用（台账记录）。
- 质量检查：`bun run check`（含 `check-project-indexes`）。

## 验收分层

- 工程验证：不适用（纯台账）。
- 技术评审：自审（逐条核对各 Task 的工程验证与集成记录是否齐备）。
- 集成：主工作区串行，`integration_status: integrated`。
- 人工功能验收：接受（用户在会话中给出「验收完成」结论，2026-10-21）。
- 发布：未授权，与本次闭合无关。

## 功能验收包

- 入口与前置条件：不适用（台账收口）。
- 操作步骤或 AI 任务输入：不适用。
- 预期行为与最终产物：26 个 Task 与 2 个 Bug 状态为 `done`，索引一致。
- 不通过表现与已知限制：若索引未同步，`bun run check` 会直接报出不一致行号。
- 验收反馈及回归案例：用户 2026-10-21 反馈「验收完成」，范围为上述四条批次。

## 交付记录

- 实际修改：26 个 Task 文件的 `status`/`updated` 与交付记录追加闭合依据；`BUG-0134`、`BUG-0135` 置 `done`；`project/tasks/README.md` 与 `project/bugs/README.md` 状态列同步；新建本 Task。
- 实际运行：`bun run check`（结果见提交记录）。
- 未运行及原因：无代码变更，未运行定向测试与 `verify:ui:*`；各批次的实机验证证据保留在原 Task 交付记录中。
- Worktree：未拆出（纯台账，主工作区串行）。
- 剩余风险：用户验收是会话内的一句话结论，未逐条回贴现场证据；若有条目实际未验，应按原 Task 的验收包重新开口，而不是维持 `done`。
