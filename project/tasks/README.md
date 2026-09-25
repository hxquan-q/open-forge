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
| `TASK-0027` | `verifying` | `PLAN-0001` | Plugin Artifact Renderer 注册表；SDK 合同与 Desktop 宿主接线已落地，待本轮验证收口。 |
| `TASK-0050` | `ready` | `PLAN-0002` | transcript 窗口化第 2 步（`beforeEntry` 游标分页）；依赖已齐，主工作区串行，链内 TASK-0051 / TASK-0038 仍为 draft。 |
| `TASK-0072` | `ready` | `PLAN-0006` | WebContentsView 迁移；serial，不创建独立 Worktree。 |
| `TASK-0045` | `ready` | `PLAN-0003` | CLI/IM/MCP/插件外显身份迁移；命名决策已齐（2026-09-25：`openforge`、旧命令直接切换、`openforge-serv`），serial 实施后收口 `TASK-0049` → `TASK-0047`/`TASK-0048`。 |
| `TASK-0122` | `ready` | `PLAN-0013` | 团队主控「分派后让出回合」提示词引导 + `team_wait_tasks` timeout 载荷瘦身；parallel 可独立 worktree，与 TASK-0123 无文件交集。 |
| `TASK-0123` | `ready` | `PLAN-0013` | 成员会话 `browser_tab` 不可用性显式声明（剔除或标注降级路径）；parallel，先定位装配点再定改法。 |
| `TASK-0124` | `draft` | `PLAN-0013` | 团队会话阶段化进度展示；serial，依赖 TASK-0122 回合语义落地后细化设计。 |
| `TASK-0125` | `draft` | `PLAN-0013` | rebase 上游+阶段 1 后同任务复跑量化对比（Verification 收口）；depends_on TASK-0122。 |

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
