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
  → 一个验证闭环
  → 一个集成提交
```

当该 Task 需要与其它 Task 并行时，中间再插入两个一对一环节：

```text
  → 一个 branch（task/TASK-xxxx-<slug>）
  → 一个 worktree（<worktreeRoot>/task-xxxx-<slug>）
```

`execution: parallel` 只说明这个 Task **可以**被拆出去并行执行，不要求一定有 worktree——在集成分支上串行完成的并行候选 Task 同样合法，`worktree: unassigned（…）` 就是这种情形。是否真的拆出 worktree，由协调者按上文的推荐/不推荐场景决定。

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

### 不使用 Worktree 的场景

- 只做只读研究；
- 只修改同一个协调者负责的 Project 文档；
- 单人串行修改；
- 不产生文件改动的讨论或审查。

多个 Agent 不得在同一个工作树同时改同一文件。

## Worktree 生命周期（标准入口）

创建、诊断、检查与清理统一走 `scripts/worktree/cli.mjs`；手工 `git worktree add/remove` 只保留为故障恢复手段。

```bash
# 创建：读 Task 合同 → 建 worktree 与分支 → 初始化 → 回填 frontmatter
bun run task:worktree -- create --task TASK-0002

# 状态：Task、worktree、分支、脏树、未推送提交、孤儿与缺失
bun run worktree:status

# 检查：合同、依赖、跨 Task scope 冲突与 frontmatter/git 漂移
bun run worktree:check --all

# 清理：默认保留任何可能丢失工作的工作树
bun run worktree:remove --task TASK-0002

# 诊断链：环境 → 配置 → 合同 → 真实 Git 状态
bun run worktree:doctor
```

等价的直接入口是 `bun scripts/worktree/cli.mjs <command> [options]`；上面每个别名都可用 `--help` 查看选项。

### 并行派工前门禁

Coordinator 在创建任何一批并行 Worktree 前先运行：

```bash
bun run worktree:check --all
```

必须先处理所有 Task 合同错误和未登记的写范围冲突；`--all` 对尚未创建的 Worktree 会报告机器状态漂移，协调者需确认这是预期的 ready Task，不能把警告误当作代码失败，也不能跳过真实合同错误。每个工作树创建后再对目标 Task 运行 `bun run worktree:check --task <ID>`。若检查发现路径/分支与已有工作树不一致，先找 Owner 核实，不要移动、覆盖或清理该工作树。

### 创建合同

`create` 只接受满足以下条件的 Task，任一不满足即拒绝且不产生任何副作用：

- `execution: parallel` 且状态处于生命周期内（`draft`…`verifying`）；
- frontmatter 已含 `branch`、`worktree`、`base_commit` 三行（缺失则要求先补齐，脚本不代写新字段）；
- frontmatter 通过严格合同校验（见下）。

创建成功后回填的是**相对路径**（`.worktreeconfig.json` 的 `worktreeRoot` 形式，如 `../open-forge-wt/task-0002-provider`）和解析出的 `base_commit`，使合同在其他机器与 CI 上同样成立。绝对路径会被 `doctor` 报为 portability 告警。

### 基线（base）

基线来自 `.worktreeconfig.json`，`--base <ref>` 或 `--base head` 可覆盖：

```text
--base <ref>  →  baseRef  →  baseRefFallbacks（origin/forge/dev → origin/dev → origin/main）  →  HEAD
```

无法解析出任何基线时命令失败，不会静默回退到某个"看起来像"的分支。

### 初始化（setup）

`.worktreeconfig.json` 的 `setup.windows` / `setup.unix` 按平台选择，缺失时回退 `setup.fallback`；显式空数组表示该平台不执行任何命令。命令在工作树目录内执行，并获得：

- `WORKTREE_ROOT_PATH`：主检出绝对路径（用于从主检出复制配置）；
- `WORKTREE_TASK_ID`：当前 Task ID。

setup 失败时工作树保留在原地并打印恢复指引，命令以非零退出；用 `--no-setup` 可跳过。初始化的本地文件复制只发生在 `copyIgnored: true` 且 `.worktreeinclude` 有匹配模式时。

### 本地文件复制边界（`.worktreeinclude`）

`.worktreeinclude` 使用 gitignore 语法，且只复制**同时被 git 忽略**的文件（已跟踪文件不会重复）。凭据类路径一律拒绝，无论模式怎么写：`.env`（`*.example` / `*.sample` / `*.template` 除外）、`*.pem` / `*.key` / `*.p12` / `*.pfx` / `*.jks`、`id_rsa` 等私钥、`.npmrc` / `.netrc` / `.git-credentials`、`*credential*` / `*secret*` / `*token*`、`settings.local.json`、`deploy/config.*.yaml`。模式命中这些路径时 `doctor` 直接报错。

默认不复制任何文件：新工作树不会静默继承本机状态。

### 清理判定

`remove` 在下列任一情况成立时**保留**工作树并给出原因，只有显式 `--force` 才删除：

- worktree 被锁；
- 存在未提交或未跟踪文件；
- 存在不在任何远端上的提交；
- Git 无法报告状态（未知不等于干净）。

无论是否 `--force`，删除路径必须位于 `.worktreeconfig.json` 的 `worktreeRoot` 之内，且不得是主检出本身。`--dry-run` 只打印判定结果。默认连带删除分支（`-d`，未合并时 Git 会拒绝）；`--keep-branch` 保留分支。

## 合同检查的两个层级

| 层级 | 入口 | 范围 | 失败语义 |
| --- | --- | --- | --- |
| 结构守卫 | `bun run check`（`check-task-worktrees.mjs`） | 全部 Task 的结构矛盾：ID/文件名不一致、路径越界、依赖引用与环、声明 worktree 却缺 branch/base_commit | **error 失败**；枚举漂移只告警 |
| 协调者门禁 | `bun run worktree:check` | 结构 + 跨 Task scope 冲突 + frontmatter 与真实 Git 漂移 | 全部视为失败；`--task <ID>` 时还会把该 Task 的 worktree 缺失升级为失败 |

分层的原因：结构矛盾是任何消费者都会读错的客观缺陷，必须机械拦截；而"两个 Task 的写范围重叠"是调度决策（`conflicts_with` 就是为此存在），且存量条目里已有合法重叠，"某个 worktree 在这台机器上已被删除"也是任务生命周期的正常终点。把它们放进每次 `check` 会让无关改动无法提交，因此由协调者在集成前显式运行。

## 集成前检查顺序

1. `bun run worktree:status` 确认 worker 的 worktree、分支与脏树状态；
2. `bun run worktree:check --task <ID>` 确认该 Task 的合同、依赖与 scope；
3. 运行 worker 交付记录中的定向测试；
4. 合并或 cherry-pick 到集成分支；
5. 运行 `bun run test:impact` 与 `bun run check`；
6. 更新 Task 的 `integration_status`，必要时更新 `worktree` 字段（淘汰后写明"已淘汰"及落地的提交）。

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

每个 Task 在 frontmatter 中声明：

```yaml
execution: parallel
owner: packages/ai
branch: task/TASK-0002-provider          # 未拆出 worktree 时写 unassigned 或集成分支
worktree: ../open-forge-wt/task-0002-provider   # 未拆出时写 unassigned（原因）
base_commit: <commit>                    # 创建工作树时记录
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
- `branch`：拆出 worktree 时必填，且必须是 `task/TASK-xxxx-<slug>`；未拆出时写 `unassigned` 或集成分支名；
- `worktree`：拆出时写 `worktreeRoot` 下的**相对路径**；未拆出时写 `unassigned（原因）` 这类占位说明；
- `base_commit`：`worktree` 已声明时必填，记录创建时的基线提交；
- `read_paths`：允许读取的主要范围；
- `write_paths`：允许修改的范围；`worktree` 已声明时不得为空；
- `exclusive_paths`：需要独占的共享文件；
- `depends_on`：前置 Task ID（也可指向 `ISSUE-` / `BUG-` / `REQ-` / `PLAN-` 等跨模块阻断项，此类引用只校验 ID 形态，不在本树内解析）；
- `conflicts_with`：写入范围重叠、需要协调执行或串行集成的 Task ID；独立 Worktree 中可以并行实现，但必须按声明顺序集成。冲突关系通常在两端都登记；若一端正在其他 Worktree 中修改，Coordinator 可先在未被占用的 Task 登记并在交接时补齐另一端。
- `integration_status`：`pending`、`reviewing`、`integrated`、`rejected`。

路径字段是仓库相对的具体路径，允许 `*` / `**` glob（例如 `packages/**/package.json`），但必须留在仓库内；重叠判定按 glob 之前的静态前缀做保守比较。`status`、`execution`、`integration_status`、`priority` 的取值必须落在各自枚举内，写错会被 `check:task-worktrees` 报为告警、被 `worktree:check` 报为失败。

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

## 测试失败分流与交接

测试失败先记录证据、再判断归属，不将一次红灯自动归因于最近的代码改动：

1. **行为可复现且违反既定合同**：建立或更新 `BUG`，记录用户流程、期望/实际、最小复现、平台/版本，并关联修复 Task 与回归测试。
2. **预期或合同尚未明确**：建立 `ISSUE` 调查决策；结论明确后再转 Bug 或执行 Task。
3. **测试设施、Runner、依赖或既有基线问题**：未查明时用 `ISSUE` 调查；已确认且可复用的合同/性能基线记入 `VERIFY`。Task 交接中注明是否在基线/隔离重跑中复现，不能将环境失败写成代码通过。

每个失败交接至少写明：Task/PR 与提交、操作系统和相关工具版本、完整命令与失败用例、期望/实际、可复现步骤、脱敏的关键输出、重跑/基线结果。CI 失败附 Actions run URL、job 与平台。产品缺陷优先用 `project/bugs/templates/bug.md`；验证合同与环境记录用 `project/verification/TEMPLATE.md`，不另建重复的测试失败实体。

失败未解决或必要验证未通过时，Task 保持 `verifying` 或 `blocked` 并写清责任人、后续动作和风险，不标记 `done`。不得删减断言、跳过门禁或把未运行的检查记为通过来消除红灯。

## 交接

Worker 完成时在 Task 中记录：

- 已完成的行为；
- 修改文件；
- 测试和命令结果（包括失败用例、提交、平台/工具版本、重跑与基线对照；CI 失败附 run URL）；
- 未运行的验证及原因；
- 已知风险；
- 后续 Worker 需要注意的上下文。
