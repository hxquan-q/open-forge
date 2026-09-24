<!-- Copyright The Open Forge contributors. -->
# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。并行执行时必须同时遵守 [`../collaboration/README.md`](../collaboration/README.md)。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

## 状态

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

状态和实现/验证事实以每个 Task 文件的 frontmatter 与交付记录为准；本 README 的当前焦点表是导航副本，由 Coordinator 同步维护，并由 `bun run check` 校验状态一致性。

## 当前执行焦点

| Task ID | 状态 | Plan | 焦点 / 协调说明 |
|---|---|---|---|
| `TASK-0115` | `verifying` | `PLAN-0012` | 会话级中断续接监视器；主工作区串行，待集成收口。 |
| `TASK-0116` | `verifying` | `PLAN-0012` | 无人值守授权分档（ADR-0132）；主工作区串行。 |
| `TASK-0117` | `verifying` | `PLAN-0012` | 自动化任务包 schema/导入导出/发现；主工作区串行，待集成收口。 |
| `TASK-0118` | `verifying` | `PLAN-0012` | 事件触发型自动化；主工作区串行，待集成收口。 |
| `TASK-0119` | `verifying` | `PLAN-0012` | 会话归档 OFAR；独立 Worktree `task/TASK-0119-session-archive-format`，待合入。 |
| `TASK-0060` | `verifying` | `PLAN-0006` | Canvas Artifact 服务已集成，待整体验证收口。 |
| `TASK-0072` | `ready` | `PLAN-0006` | WebContentsView 迁移；serial，不创建独立 Worktree。 |
| `TASK-0050` | `ready` | `PLAN-0002` | transcript 窗口化第 2 步（`beforeEntry` 游标分页）；依赖已齐，主工作区串行，链内 TASK-0051 / TASK-0038 仍为 draft。 |

## Task 要求

- 必须关联 `REQ` 或 `BUG` / `ISSUE`；
- 说明 owner、范围、不做什么和依赖；
- 给出可观察的完成标准；
- 指定测试层级和验证命令；
- 完成后记录实际验证结果；
- 不把多个可独立回滚的 concern 塞进一个 Task；
- Task 状态变更时同步本节焦点表，状态必须来自 Task frontmatter，不推测下一项工作。

## 协作与集成

- `depends_on`、`conflicts_with` 和 `write_paths` / `exclusive_paths` 是并发与集成顺序合同；具体 DAG 以对应 Plan/Task 文件为准，不在此重复维护路线细节。
- 并行批次启动前运行 `bun run worktree:check --all`；检查报告 scope 冲突时先缩小范围或登记冲突，再创建 Worktree。
- `bun run worktree:status` 用于确认真实 Git Worktree 状态；若与 Task frontmatter 不一致，先找 Owner 核实，不移动、覆盖或清理可能含有工作的 Worktree。
- Task 与 Project 索引检查会由 `bun run check` 执行；集成前另运行 `bun run worktree:check --task TASK-xxxx`。
