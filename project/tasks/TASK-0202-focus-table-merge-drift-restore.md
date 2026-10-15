---
id: TASK-0202
type: task
status: done
priority: P2
owner: coordinator
source: 会话核查（user-request 2026-10-03）；TASK-0187 集成合并 03ce0c378 误删焦点表行
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0197, TASK-0196, TASK-0200]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 0712fc8cc2d2d87787f196371f72c5c32a7f8dfa
read_paths: [project/tasks, project/plans, scripts/quality/check-project-indexes.mjs]
write_paths: [project/tasks/TASK-0202-focus-table-merge-drift-restore.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行 6c431ca90 登记、adea036dc 修复）
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 恢复焦点表被合并丢失的八行任务

## 目标与范围

修复 Task 目录焦点表的合并回退：`03ce0c378`（TASK-0187 稳定性批次合入 main）声明索引冲突「按并集解决」，实际却删除了 main 侧 8 行非 done 任务（`TASK-0039 / TASK-0042 / TASK-0159 / TASK-0195 / TASK-0196 / TASK-0197 / TASK-0198 / TASK-0200`，其中 0197 为 `in_progress`），与 [`README.md`](README.md)「Task 状态变更时同步本节焦点表」及该合并声明的并集意图不符。按各 Task frontmatter 与最新交付记录补回八行，并将本 Task 行同步进表。

### 并发评估

- 结论：不支持并行（小型台账修复）
- 执行方式：serial
- 可并行 Task：无（`project/tasks/README.md` 为共享写面）
- 前置依赖：无
- 冲突文件/独占路径：`project/tasks`（与 TASK-0197 泳道共享，已登记 conflicts_with）
- Branch：main
- Worktree：无（主工作区实施，不拆独立树）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：本修复直接入 main；其他泳道后续修改焦点表时保留本批八行

### 做

- 按 8 个 Task 的 frontmatter 与最新交付记录补回焦点表八行（状态列与 frontmatter 严格一致）。
- 新增本 Task 行并随状态推进同步。

### 不做

- 不改 8 个 Task 的 frontmatter 与正文（其验收闭环属各自泳道）。
- 不扩充焦点表覆盖到从未登记的其它条目（`requireAll: false` 现状不变；残余观察见交付记录）。
- 不推送、不发版、不改发布说明（无产品可见变化）。

## Given / When / Then

- Given 当前 main HEAD 焦点表缺失上述八行（其中 TASK-0197 为 in_progress）；When 运行 `bun run scripts/quality/check-project-indexes.mjs`；Then 该检查对缺失不报错（`requireAll: false`），但缺失使导航失去 in_progress 泳道，不能据此认为台账完整。
- Given 补回八行后；When 运行 `check-project-indexes` 与完整 `bun run check`；Then 八行状态列与 frontmatter 一致、无重复行，检查退出码 0。

## 必须保持

- 焦点表内其余行原样保留，不重排、不改写。
- 8 个 Task 的 frontmatter `status` 与表中状态列一一对应（`check-project-indexes` 校验）。
- README 其余章节、UTF-8 编码与许可证头不变。

## 测试与验证

- 定向：`bun run scripts/quality/check-project-indexes.mjs`（tasks 表与 frontmatter 一致性）。
- 质量检查：`bun run check`（lint/types/guards/mobile-lint）。

## 验收分层

- 工程验证：通过（2026-10-03，绑定 main `6c431ca90` 登记 + `adea036dc` 修复）。定向 `bun run scripts/quality/check-project-indexes.mjs` 退出码 0；完整 `bun run check` 的四个子门（lint/types/guards/mobile-lint）全部退出码 0，guards 内含 project-indexes 一致性通过。
- 技术评审：自审（对照 `75c5ae2df` → `03ce0c378` 的 README diff 逐行核对八行来源；八行状态列由 `check-project-indexes` 与各 Task frontmatter 机器比对通过）。
- 集成：已提交本地 main（`6c431ca90` 记录、`adea036dc` 补行）；integration_status: integrated。
- 人工功能验收：不适用（内部台账修复，无用户可见行为；既定完成标准为「焦点表与 frontmatter 一致且检查通过」，对照 TASK-0201 先例）。
- 发布：已授权推送 origin/dev（`add53c55d..6e2c6537f`，2026-10-03，随收口批次）；不发版、不改发布说明。

## 功能验收包

- 入口与前置条件：仓库主工作区。
- 操作步骤：查看 `project/tasks/README.md`「当前执行焦点」表。
- 预期行为与最终产物：`TASK-0039 / 0042 / 0159 / 0195 / 0196 / 0197 / 0198 / 0200` 八行存在，状态列与各自 frontmatter 一致。
- 不通过表现与已知限制：仍缺行或状态不一致即未修复；不覆盖历史上从未登记的条目（另行决策）。
- 验收反馈及回归案例：无用户可见变化。

## 交付记录

- 实际修改：`project/tasks/README.md`（新增 TASK-0202 行；补回 0039/0042/0159/0195/0196/0197/0198/0200 八行）；`project/tasks/TASK-0202-focus-table-merge-drift-restore.md`（新建）。
- 实际运行：`bun run scripts/quality/check-project-indexes.mjs` 退出码 0；`bun run check`（lint/types/guards/mobile-lint）全部退出码 0。提交前 pre-commit 门禁（staged guards + biome）两轮通过。
- 未运行及原因：无必需项未运行。未改 `.github/release-notes/`——纯台账维护无产品可见变化，对照 TASK-0142–0144 先例不写发布说明。
- 同类核查（残余观察，不属本任务范围）：焦点表历史漂移不止本批——`TASK-0038/0051/0064/0074/0075/0154/0194` 的行由更早提交移除（部分为并入所属批次行或 dev/main 同步的「防悬挂引用」取舍，见 `1c1a50b9e`）；`TASK-0046/0120/0147/0152/0155/0156/0157/0158/0160/0161` 从未登记。`check-project-indexes` 对 tasks 为 `requireAll: false`，不校验完整性；是否改为全覆盖属独立决策。
- Worktree：未拆出（串行小修，主工作区直接实施，不拆独立树）。
- 剩余风险：未来合并焦点表时仍可能丢失行（门禁不校验完整性，只校验已列行状态一致）；在维护习惯与检查范围不变更的前提下需人工复核，本次残余观察项亦然。
