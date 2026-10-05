<!-- Copyright The Open Forge contributors. -->
# Open Forge Project Control Plane

`project/` 是当前二开产品的主动管理层；`exprot/` 保留为历史源码分析、调研证据和早期规划归档。

目录、编号、frontmatter、状态、内容和链接规范见 [`CONVENTIONS.md`](CONVENTIONS.md)。任何新的二开管理文件都必须进入 `project/`，不得继续向 `exprot/` 添加主动记录。

## 单一事实源

| 内容 | 权威位置 |
|---|---|
| Agent 开发规则 | `AGENTS.md`、其按需规则扩展 `docs/dev/agent-rules/`、目标最近的 `AGENTS.md` |
| 架构决策 | `docs/adr/` |
| 产品需求 | `project/requirements/` |
| 实施路线 | `project/plans/` |
| 可执行工作 | `project/tasks/` |
| 未决问题 | `project/issues/` |
| 已确认缺陷 | `project/bugs/` |
| 调研证据 | `project/research/` 与 `exprot/` |
| 测试/性能基线 | `project/verification/` |
| 长期上下文 | `project/context/` |
| 领域术语 | 根 `CONTEXT.md` 索引与 `docs/glossary/` 分册正文 |
| 多人/多 Agent 协作 | `project/collaboration/` |
| Task Worktree 生命周期工具 | `scripts/worktree/cli.mjs`（`bun run worktree:doctor`）、`.worktreeconfig.json` |
| Project 管理规范 | `project/CONVENTIONS.md` |
| 外部协作 Issue | GitHub Issues；本地记录保存关联编号，不复制 GitHub 全文 |

## 目录

记录类型的自动选择（建什么、何时续接、如何转换）见 [`CONVENTIONS.md`](CONVENTIONS.md) 的「记录路由」一节；这里只做目录导航。

- `requirements/`：稳定的用户目标、边界和验收条件。
- `plans/`：实现路线、阶段、依赖、取舍和升级信号。
- `tasks/`：可直接执行的原子工作项。
- `issues/`：还没有确定答案的产品或技术问题。
- `bugs/`：可复现或已有证据的实际缺陷。
- `research/`：源码、上游项目和外部资料的证据索引。
- `verification/`：测试合同、性能指标和质量门禁。
- `context/`：后续 Agent 需要先读的短上下文。
- `collaboration/`：多人/多 Agent 的 Worktree、分支、Task DAG 和集成规则；Worktree 的创建、诊断与清理由 `scripts/worktree/cli.mjs` 执行，Task 合同的结构不变量由 `scripts/quality/check-task-worktrees.mjs` 机械校验。
- `decisions/`：`docs/adr/` 的索引，不复制 ADR 正文。

## 编号和状态

- Requirement：`REQ-xxxx`
- Plan：`PLAN-xxxx`
- Task：`TASK-xxxx`
- Issue：`ISSUE-xxxx`
- Bug：`BUG-xxxx`
- Research：`RESEARCH-xxxx`
- Verification：`VERIFY-xxxx`

状态统一使用：

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

状态写在 frontmatter 中，不通过移动文件表达状态，避免路径和链接频繁变化。README 中的 Plan 状态表和 Task 当前焦点表是导航副本，必须与 frontmatter 同步；`bun run check` 会校验对应状态索引。

## 统一开发入口

开发任务由 [open-forge-task-intake](../.agents/skills/open-forge-task-intake/SKILL.md) 按需路由，职责与验收规则由其交付合同维护。

## 标准流水线

以下是进入实施后的主线，不要求每次创建全套记录；已有来源续接，PLAN 按记录路由条件建立，RESEARCH/VERIFY/Context 等支线按需关联。仅分析/规划请求停在对应记录，不自动进入编码。

```text
一句话需求
  → REQ / BUG / ISSUE
  → PLAN（按需）
  → TASK
  → Red：失败测试或基线
  → Trace：沿真实调用链确认根因
  → Change：最小可回滚实现
  → Green：定向测试和用户流程测试
  → Guard：质量门禁
  → Release Notes
  → 功能验收包 / 内部任务约定标准
  → 人工反馈 → 必要修正与复验
  → 满足验收后关闭并归档
```

## 三跳读取协议

处理任务时不要全量加载本目录：

1. 读仓库 `AGENTS.md`；
2. 读本 `project/README.md` 和目标目录 README；
3. 只读当前 Requirement、Plan、Bug/Issue 以及最多 1–2 篇相关 Research/Verification Note。

`exprot/` 暂不删除。迁移期间，`project/` 通过索引指向 `exprot/`，待链接和事实源审查完成后再决定是否归档或移除旧路径。
