---
id: TASK-0094
type: task
status: ready
priority: P1
owner: packages/runtime-storage
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `review.rs` 快照库 + hash 守卫回滚机制对照）
execution: parallel
branch: forge/dev
worktree: unassigned（主工作区或独立 Worktree）
base_commit: forge/dev
read_paths: [packages/runtime-storage/src, packages/runtime-node/src/coding, apps/desktop/src/main, apps/desktop/src/renderer/domains/conversation, project/research/RESEARCH-0010-pi-desktop-borrowing-opportunities.md]
write_paths: [packages/runtime-storage/src, packages/runtime-node/src/coding, apps/desktop/src/main, apps/desktop/src/renderer/domains/conversation]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 每次执行的代码变更快照库与 hash 守卫回滚

## 目标

Write/Edit 工具执行前把被改文件的 before 字节快照持久化入库，toolResult 携带 `details.review`（snapshotId、相对路径、增删行数、可回滚标记）；对话中的变更审查卡在外部 `git commit` 之后依然准确还原当次修改，并可经 hash 校验守卫回滚——审查与回滚彻底解耦 Git 状态。

## 背景事实

- 参照（RESEARCH-0010 §4，PI-Desktop `crates/host-core/src/review.rs`，ADR-0043 取代依赖 git diff 的 ADR-0042）：
  - `prepare_change` 在写入前把旧文件字节存进 `review-changes/<sessionId>/<snapshotId>/{before,meta.json}`（MAX_SNAPSHOT_BYTES=16MiB / MAX_DIFF_BYTES=512KiB 界值）；
  - 成功后 toolResult `details.review` 记 snapshotId/相对路径/状态/增删行；
  - `rollback_change` 带 hash 守卫：当前文件 hash 与快照记录不符时拒绝盲覆盖，避免把用户外部改动冲掉。
- 本仓库现状：`packages/runtime-node/src/coding/tools/edit/edit-tool.ts:94` 已把 `{ diff, firstChangedLine }` 写进 toolResult `details`，renderer `EditDiffView` 消费 `uiDetails.diff`——**展示用单次执行快照已存在**；缺 before 字节库与守卫回滚。`packages/runtime-storage/src/conversation/record-schema.ts` toolResult `details` 为自由字段，可直接承载 `details.review` 合同。

## 范围

### 并发评估

- **并发结论**：**支持并发**
- **执行方式**：parallel（与 P0 链及 TASK-0095 无共享写路径，可独立 Worktree）
- **可并行 Task**：TASK-0091、TASK-0092、TASK-0093、TASK-0095
- **前置依赖**：无
- **冲突文件/独占路径**：无（`edit-tool.ts`/`details` 字段无其他在途 Task 触碰）
- **Branch**：`task/TASK-0094-review-snapshot`（并行时）或 `forge/dev`
- **Worktree**：可独立 Worktree
- **集成负责人**：本 Task 执行者 / Coordinator
- **集成顺序**：任意时点独立集成

### 做

- `runtime-storage` 定义 `details.review` 合同（snapshotId、path、status、added/removed 行数、rollbackable）与快照存储 Port（界值、过期清理）；
- `runtime-node` 在 Write/Edit 类工具执行前完成 before 快照（失败不写不快照），成功后把 review 元数据写进 `details`；
- `apps/desktop`：变更卡新增「回滚」能力——hash 守卫校验当前文件状态与快照记录一致才允许还原；不一致给出明确冲突提示而非盲覆盖；
- 快照库容量界值与清理策略（会话维度组织）。

### 不做

- 不做整仓库级 git 集成或自动 commit；
- 不重写现有 `details.diff` 展示路径（统一事实源即可，展示逻辑不大改）；
- 不覆盖 Bash/其他非文件写入路径的副作用回滚。

## Given / When / Then

- Given：agent 在某会话中通过 edit 工具修改了 `src/foo.ts`，之后用户在别处执行了 `git commit` 或其他改动；
- When：用户回到该会话查看当时的变更卡并点击「回滚」；
- Then：卡片仍展示**当次执行时**的准确 diff（不受后续 git 状态影响）；当前文件未被外部再改动时可一键还原到写入前内容；已被外部改动时提示冲突而非覆盖。

## 必须保持

- `details` 字段对旧记录的向后兼容（旧会话无 `details.review` 时 UI 正常降级）；
- 快照失败不得阻断工具正常写入路径（或明确选择「无快照则不暴露回滚」的一致语义）；
- 快照内容不落日志、不进模型上下文；
- 容量界值内行为确定，超限有明确降级。

## 测试与验证

- 定向测试：`runtime-node` 合同测试（写入前快照、失败不残留、界值截断）；`runtime-storage` Schema 合同测试（`details.review` 合法/拒绝输入、旧记录兼容）；desktop 组件测试（回滚按钮状态、hash 冲突提示）；
- 用户流程：会话内 edit → 外部 git commit → 查看卡片 → 回滚/冲突提示（集成层 fake fs 可复现）；
- 质量检查：`bun run test:impact -- packages/runtime-node/src/coding/tools/edit`、`bun run check:quick`、`bun run check`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
