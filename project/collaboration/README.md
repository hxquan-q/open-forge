<!-- Copyright The Open Forge contributors. -->
# Collaboration

本目录定义多人/多 Agent 并行开发的协作合同。它只管理开发协作，不等同于产品运行时的 Agent Team。

## 两种并发必须分开

### 开发协作并发

多人或多个 Agent 同时修改代码、测试和文档。

默认模型：

```text
一个 TASK
  → 一个 owner
  → 一个 branch
  → 一个 worktree
  → 一个验证闭环
  → 一个集成提交
```

### 产品运行时并发

Desktop 内部的 Agent Team、Subagent、Tool 并发和 Task 执行。

它们必须继续复用 Runtime/Session/Turn/Policy/事件合同，不能因为开发协作模型而新增第二套生产 Runtime。

## 工作树策略

### 推荐使用 Worktree 的场景

- 两个或多个 Task 会同时修改代码；
- 修改不同包但需要独立测试；
- 一个 Agent 做调查，另一个 Agent 编码；
- 一个 Task 需要长时间运行测试或构建；
- 需要保持协调者工作区干净。

示例：

```bash
git fetch origin dev
git worktree add ..\open-forge-wt\TASK-0002 -b task/TASK-0002-provider origin/dev
```

实际基线以当前 `git branch --show-current`、`git branch -avv` 和远程状态为准，不要盲目假定分支存在。

### 不使用 Worktree 的场景

- 只做只读研究；
- 只修改同一个协调者负责的 Project 文档；
- 单人串行修改；
- 不产生文件改动的讨论或审查。

多个 Agent 不得在同一个工作树同时改同一文件。

## 分工模型

### Coordinator

负责：

- 拆分 Requirement/Plan 为 Task DAG；
- 分配 owner、branch、worktree 和路径边界；
- 维护 `project/` 索引和状态；
- 集成 worker 提交；
- 运行最终影响测试和质量门禁；
- 统一更新 Release Notes；
- 在用户授权后推送目标分支。

### Worker

负责：

- 只处理分配的一个或一组不冲突 Task；
- 先读取项目规则和关联条目；
- 不修改其他 Worker 的路径；
- 在自己的 worktree 中写测试、实现和验证；
- 更新 Task 的实际结果；
- 不直接 Push 共享分支。

### Reviewer / Integrator

负责：

- 检查行为合同、包边界、测试和文档同步；
- 处理跨 Task 的冲突；
- 确认依赖顺序和回滚边界；
- 集成后重新运行最终验证。

## Task 并发合同

每次创建或拆分 Task 时，先向用户报告“支持并发 / 条件支持 / 不支持”，并说明依赖、冲突路径、Worktree 方式和集成顺序；这些结论随后写入 Task frontmatter 和正文。

每个并行 Task 必须在 frontmatter 中声明：

```yaml
execution: parallel
owner: packages/ai
branch: task/TASK-0002-provider
worktree: ..\open-forge-wt\TASK-0002-provider
base_commit: <commit>
read_paths:
  - packages/ai/
write_paths:
  - packages/ai/src/
  - packages/ai/test/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
```

字段规则：

- `execution`：`serial`、`parallel` 或 `coordination-only`；
- `owner`：明确到包、目录或责任人；
- `branch` / `worktree`：并行代码 Task 必填；
- `base_commit`：创建工作树时记录；
- `read_paths`：允许读取的主要范围；
- `write_paths`：允许修改的范围；
- `exclusive_paths`：需要独占的共享文件；
- `depends_on`：前置 Task ID；
- `conflicts_with`：不能并行的 Task ID；
- `integration_status`：`pending`、`reviewing`、`integrated`、`rejected`。

## DAG 示例

当前 Runtime 性能计划推荐：

```text
TASK-0002 Provider fixture
        ↓
TASK-0003 Session cancel/deadline
        ↓
TASK-0004 Performance snapshot
       ↙ ↓ ↘
TASK-0005  TASK-0006  TASK-0007
Compaction Memory    GPU

TASK-0008 Task/Artifact contracts
  depends_on: TASK-0003, TASK-0004
```

`TASK-0009` 品牌化决策冻结与 Runtime 性能链路无依赖，但会被域名、更新源和 Marketplace 决策阻塞。

## 集成规则

1. Worker 只提交自己的 Task 范围；
2. Coordinator 集成前先检查 `git diff --stat`、测试和 Task 状态；
3. 跨 Worker 同一文件的改动必须串行化；
4. 发生冲突时优先回到合同和所有权，不直接保留双方代码；
5. 集成后由 Coordinator 跑 `test:impact`、`check:quick` 和必要的 `check`；
6. Worker 不执行 force push、reset --hard、checkout 覆盖或 stash；
7. 只有用户明确授权时才 Push 共享分支。

## 交接

Worker 完成时在 Task 中记录：

- 已完成的行为；
- 修改文件；
- 测试和命令结果；
- 未运行的验证及原因；
- 已知风险；
- 后续 Worker 需要注意的上下文。
