---
id: TASK-0327
type: task
status: in_progress
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-request; open-forge-autonomous-dev-plan-v2.md; Magpie engineering review
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（控制器共享路径，单 Agent 串行）
base_commit: 6c5e94d09
read_paths: [scripts/agents, schemas/agents, project/tasks, scripts/worktree]
write_paths: [scripts/agents/orchestrate.mjs, scripts/agents/queue.mjs, scripts/agents/cli.mjs, scripts/agents/orchestrate.test.mjs, schemas/agents/orchestration.schema.json, scripts/agents/orchestrate.test.mjs, scripts/agents/operations.mjs, project/tasks/TASK-0327-bounded-queue-orchestration.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, scripts/agents/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/agents/orchestrate.mjs, scripts/agents/queue.mjs, schemas/agents/orchestration.schema.json]
depends_on: [TASK-0326]
conflicts_with: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0328, TASK-0329]
integration_status: pending
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 有界多 Task 持续编排

## 目标

在已完成的单 Task `cycle` 上增加确定性、有限轮次的 `loop`：每次从真实 ready Task 队列选择工作，沿用依赖、租约和写入冲突检查，连续处理至目标完成、无可领取工作、被暂停/取消或达到操作者设定的回合上限。周期产物必须给出每个 Task 的实际状态、未执行项与阻断原因；不自动发布。

## 范围

### 并发评估

- 结论：条件支持并发研究，不支持并行修改共享控制器
- 执行方式：serial
- 可并行 Task：无；本 Task 与 TASK-0322–0326、0328–0329 共享 controllers
- 前置依赖：TASK-0326 角色合同
- 冲突文件/独占路径：见 frontmatter
- Branch：`main`
- Worktree：目标 Task 仍使用标准 Task Worktree；协调器自身串行
- 集成负责人：当前 Agent
- 集成顺序：单 Task 续接 → 多 Task 选择 → 周期/停止 → 证据

### 做

- 增加可测试的队列选择和周期汇总；Task 选择由 Task、租约、策略和 completed 证据决定，不接受外部正文伪造 ready。
- 每次最多领取一个与其它运行不冲突的 Task；限制总 Task 数、回合数和停滞；遇到暂停、清理未知、重复停滞、无进展或人工闸门停止。
- 复用现有 `cycle` 的状态机，拒绝重放已完成 Task；每个周期输出实际 runId、Task、阶段、反馈证据与 `notRun`。
- 用公开 CLI `loop` 触发；固定无发布，不让 `--through integrate` 隐式越过当前本地集成边界。
- 测试空队列、依赖等待、冲突跳转、部分失败后继续、预算终止、取消后不领取新工作。

### 不做

- 不做无限后台守护，不启动真实 dev/UI，不访问外部平台。
- 不修改租约代次、fencing、发布控制或规则晋升。
- 不并行多个同路径 Task，不以模型输出生成可执行指令。

## Given / When / Then

- Given 两个 ready Task 已按优先级排列，When 运行 `loop --limit 1`，Then 只领取一个，并返回另一个的 waiting/eligible 状态而不伪造完成。
- Given 当前 Task 无进展或队列只剩冲突/依赖未满足，When 下一轮，Then 停止并明确 reason，不重复启动。
- Given 操作者暂停控制器或发出取消，When 正在执行，Then 当前子进程被取消，之后不再领取新 Task。
- Given 一个 Task 失败、一个独立 Task 仍可执行，When 设置明确的失败继续策略，Then 只在符合策略时继续，且汇总保留失败证据。

## 必须保持

单写者、租约有效期、generation/fencing、写入范围、Task DAG、独立评审、证据绑定和显式发布授权不变。默认只处理 ready Task；不自动将 suggestion 写入实现或提升 lessons。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run scripts/agents/orchestrate.test.mjs scripts/agents/queue.test.mjs scripts/agents/cli.test.mjs`
- 用户流程：从公开 CLI 连续领取多个临时 Task，验证限制、失败中止、取消与状态输出。
- 质量检查：`bun run check:quick` 后 `bun run check`。

## 验收分层

- 工程验证：待实施。
- 技术评审：当前 Agent 自审，独立模型未配置。
- 集成：本地 main，待提交/最终组合验证。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：临时 Git/Task 夹具，配置 level 与受控 adapter 仅用于本地测试。
- 操作步骤或 AI 任务输入：运行有回合上限的队列循环。
- 预期行为与最终产物：空闲、冲突、失败与取消都有结构化停止原因；不会无限重试或越权发布。
- 不通过表现与已知限制：循环无界、领取依赖未满足 Task、进程失联后继续或失败被写成成功均不接受；真实模型能力未验。
- 验收反馈及回归案例：待收集。

## 交付记录

- 实际修改：新增 `loop` 有界编排与 `loopRunPrefix`，每次只领取一个非冲突 ready Task，复用既有 `cycle` 状态机；限制总 Task 数 1–100、连续停滞 1–10，暂停、取消、清理未知和无合格工作均显式停止。`claimNext` 返回真实队列与冲突摘要，CLI 增加 `loop --limit/--max-stalls/--run-prefix`，同时收紧缺值、未知和重复参数处理。新增真实临时 Git/Task 夹具覆盖依赖等待、冲突、预算、停滞熔断、暂停和取消后不领取。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/agents/adapters.test.mjs scripts/agents/orchestrate.test.mjs scripts/agents/runner.test.mjs scripts/agents/cli.test.mjs scripts/agents/queue.test.mjs`，5 文件 / 34 例通过（2026-10-20）；`bun run check:quick -- <TASK-0326/0327 实际修改文件>` 通过（16 文件，Biome 与全仓 guards exit 0）。
- 未运行及原因：未运行真实模型、真实 UI、分布式控制器或外部发布；用户已明确没有隔离 VM/runner 与模型环境。循环通过注入的 `cycle` 替身验证状态边界，真实多 Task 长跑仍需受限环境。
- Worktree：协调控制器在 main 串行；目标 Task 的后续真实执行仍必须进入各自 Task Worktree。
- 剩余风险：单机文件锁不证明分布式调度安全；CLI 当前没有后台守护，取消依赖进程信号，失联进程仍需恢复流程确认清理。
