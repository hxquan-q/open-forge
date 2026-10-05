---
id: TASK-0217
type: task
status: done
priority: P1
owner: coordinator
source: user-request（「都可以继续」）；TASK-0047/0048 陈旧阻塞复核
related_requirement: [REQ-0003]
related_plan: [PLAN-0003]
related_tasks: [TASK-0047, TASK-0048, TASK-0045, TASK-0049]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 04a082155
read_paths: [project/tasks, project/tasks/README.md, README.md, QUICKSTART.md, CONTRIBUTING.md, docs, apps/docs-site]
write_paths: [project/tasks/TASK-0047-repository-docs-brand-migration.md, project/tasks/TASK-0048-docs-site-brand-migration.md, project/tasks/TASK-0217-retriage-stale-blockers.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 复核并解除 TASK-0047 与 TASK-0048 的陈旧阻塞

## 目标与范围

`TASK-0047`（仓库公开文档品牌迁移）与 `TASK-0048`（公开文档站品牌迁移）的「阻塞」小节都写「仅剩 `TASK-0045` 收口，及随之关闭的 `TASK-0049`」。复核结果：`TASK-0045` 与 `TASK-0049` 的 frontmatter 均为 `done`，阻塞条件已满足。

但这两条**不是「做完未关」，而是尚未实施**——它们的交付记录（实际修改、实际运行、未运行及原因、剩余风险）四条全为空，说明工作从未开始。

做：把两条的 frontmatter 从 `blocked` 改为 `ready`；在各自的「阻塞」小节写清事实（阻塞条件已满足、交付记录为空即未实施），并保留原有约束（冻结技术标识不变、社区继续使用已冻结目标）；同步焦点表。

不做：不在本条目里实施品牌迁移本身——那是 `TASK-0047`/`TASK-0048` 自己的范围，需要各自的切片与验收；不改它们对冻结标识（`.vettapkg`、`@vetta/*`、`VETTA_*`）的要求。

## Given / When / Then

- Given `TASK-0045`/`TASK-0049` 已 done；When 复核 0047/0048；Then 状态由 blocked 转 ready，且「未实施」这一事实被明确写出，不被误读成「已交付待验收」。

## 必须保持

- 不删改两条任务原有的范围、不变量与验收标准；只更正状态与阻塞叙述。
- 不把任何未做的文档改动写成已做。

## 测试与验证

- `bun run check` 的索引一致性（`check-project-indexes` 与 `check-task-worktrees`）。
- 量出实际缺口（公开文档与文档站里仍带旧品牌字样的位置数量），作为后续实施切片的输入。

## 交付记录（2026-10-06）

- 实际修改：TASK-0047 与 TASK-0048 的 frontmatter 由 blocked 转 ready；两条的「阻塞」小节改写为「阻塞已解除、但尚未实施」并保留原约束；两条与本条一并补进焦点表。
- 复核证据：两条的交付记录四条（实际修改、实际运行、未运行及原因、剩余风险）全为空，说明工作从未开始，不是「做完未关」；TASK-0045 与 TASK-0049 的 frontmatter 均为 done，说明原阻塞条件已满足。
- 实测缺口（判据：排除冻结标识后仍提到旧品牌的行）：公开文档与文档站合计 334 行、84 个文件。分布最高的是 docs-site 内容（product/design.mdx 17 行、其 en 版 14 行）与 README.md（11 行）。样本里仍混有必须保留的上游署名（README「Open Forge is an independently maintained derivative of Open Vetta」），实施时要逐行判三类：散文改名、上游署名保留、冻结标识保留。
- 验证：check-project-indexes 与 check-task-worktrees 通过。
- 未运行及原因：未实施品牌迁移本身（属 0047/0048 的范围）；未运行 docs-site 构建。
- 剩余风险：334 行是「需逐行判断」的上界，不等于「需改写」的行数；两条 P0 的真实工作量要按文件切片后才清楚。
- 集成：提交 `1e6e2ab4c`，本地 `main`；未推送。
