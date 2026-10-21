---
id: TASK-0334
type: task
status: done
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-request; PLAN-0019; current-source
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0326, TASK-0327, TASK-0331, TASK-0332]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（共享 scripts/agents 目录，单 Agent 串行）
base_commit: d1ddd68ee
read_paths:
  - .ua
  - AGENTS.md
  - project/CONVENTIONS.md
  - project/requirements
  - project/plans
  - project/tasks
  - docs/dev/agent-rules
  - .agents/skills/open-forge-task-intake
  - scripts/agents
  - schemas/agents
  - .github/release-notes
write_paths:
  - scripts/agents/requirement-run.mjs
  - scripts/agents/requirement-run.test.mjs
  - scripts/agents/cli.mjs
  - scripts/agents/cli.test.mjs
  - scripts/agents/README.md
  - schemas/agents/requirement-run.schema.json
  - project/tasks/TASK-0334-requirement-run-mvp.md
  - project/tasks/README.md
  - project/plans/PLAN-0019-autonomous-development.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - scripts/agents/requirement-run.mjs
  - schemas/agents/requirement-run.schema.json
depends_on: []
conflicts_with: [TASK-0326, TASK-0327, TASK-0328, TASK-0329, TASK-0330, TASK-0331, TASK-0332, TASK-0333]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# Requirement Run MVP：需求级覆盖与工程完成判定

## 目标

用户要的模式是“提出一个大需求，Agent 拆解后持续推进，直到该需求的全部流程完成”，而不是只把现有 `loop` 队列跑空。现有 `queue`/`loop` 是有界 Task 队列执行器：每次领取一个 ready Task，`done + integrated` 才解锁依赖，空队列、依赖等待、路径冲突或连续停滞即停止；它不知道 REQ 条款是否全部被覆盖，也没有需求级完成报告。

本 Task 补 Phase 1 的需求级覆盖与工程完成判定：输入 REQ 条款 R1..Rn、PLAN 与 Task DAG，以及 Agent 拆解时生成的机器可读 coverage manifest；串行复用现有 `cycle` 执行 manifest 内的 eligible Task；输出覆盖矩阵和带停止原因的运行报告。Phase 1 不自动拆解需求、不自动创建 ready Task、不并行写入、不启用真实模型或发布。

输入输出边界：

- 输入：`project/requirements/REQ-*.md` 的稳定条款、`project/plans/PLAN-*.md`、Task frontmatter/交付记录、coverage manifest JSON、`project/autonomy-policy.json`。
- 输出：`requirement-check` 的静态覆盖结论；`requirement-run` 的报告 JSON（覆盖矩阵、每个 Task 的工程/接受状态、attempted/notRun、stopReason、humanAcceptance、release）。
- 复用：`loadTasks`、`queue.completedTasks`、`leases.claim`、`orchestrate.cycle`、`store`、`schema`。不新增 GOAL 状态机，不复制 Task 运行状态机。

## 范围

### 并发评估

- 结论：不支持并行；共享 `scripts/agents`、`schemas/agents` 与 Project 索引，必须串行。
- 执行方式：serial。
- 可并行 Task：无；并行写入会让 CLI、README、索引和测试互相覆盖。
- 前置依赖：TASK-0326/0327/0331 的代码已集成 main。本文不把它们写入 `depends_on`：`queue.mjs` 只把 `done + integrated` 算完成，而这些 Task 因真实模型或人工验收保持 `verifying`，写入会让本 Task 永久不可领取。语义依赖记录在这里，调度依赖保持为空。
- 冲突文件/独占路径：`scripts/agents/requirement-run.mjs`、`schemas/agents/requirement-run.schema.json` 为本 Task 独占；`scripts/agents/cli.mjs` 与 README 为共享串行编辑。
- Branch：`main`。
- Worktree：不拆出；单 Agent 串行修改共享目录，拆分不会增加隔离，反而制造索引漂移。
- 集成负责人：当前 Coordinator（本会话）。
- 集成顺序：先落 runner/schema/tests，再接 CLI，最后回填 README、Project 记录与 Release Notes；一次或按 concern 原子提交，不夹带 `temp/`。

### 做

1. 新增 `scripts/agents/requirement-run.mjs`：
   - `validateCoverage({ root, requirement, plan, coverage, tasks })`：校验 manifest 结构、条款唯一性、Task 归属、证据路径存在且非空。
   - `coverageMatrix(...)`：生成 R1..Rn → Task → evidence → 工程/接受状态。
   - `requirementRun(...)`：在有界循环内只选择 manifest 内 eligible 的 ready Task，串行调用现有 `cycle`；不领取 manifest 外 Task。
   - 停止原因至少覆盖 `engineering-complete`、`coverage-gap`、`blocked`、`stalled`、`needs-human`、`failed`、`limit`、`paused`、`cancelled`。
   - 复用现有 store 的 Task 租约/运行记录；需求级报告写到 `--report` 指定路径，默认 `<state-dir>/requirement-runs/<runId>.json`，不新增第二套授权状态机。
2. 新增 `schemas/agents/requirement-run.schema.json`：用现有封闭 JSON Schema 子集定义 coverage manifest 与 report；manifest 的每个条款至少一个 Task，每个 Task 至少一条 repo-relative evidence 路径。
3. 扩展 `scripts/agents/cli.mjs`：
   - 新增只读命令 `requirement-check --requirement <ID> --plan <ID> --coverage <file>`。
   - 新增 `requirement-run --requirement <ID> --plan <ID> --coverage <file> --holder <ID> --state-dir <dir> [--report <file>] [--through verify|integrate] [--limit N] [--max-stalls N] [--test <file>]`。
   - `--through integrate` 在 L0/L1 下必须在领取任何 Task 前拒绝。
   - 保持现有 `cycle`/`loop` 命令与参数行为不变。
4. 测试与文档：
   - `scripts/agents/requirement-run.test.mjs` 覆盖覆盖矩阵、停止原因、只执行 manifest 内 Task、`verifying` 依赖不自称完成、报告不冒充人工接受/发布。
   - `scripts/agents/cli.test.mjs` 覆盖两个新命令的参数与拒绝路径。
   - `scripts/agents/README.md` 记录用法、退出/停止语义与非目标。
5. 回填本 Task、Tasks 索引、PLAN-0019 与 `.github/release-notes/v0.1.3.md` 的实际结果；未运行项如实保留。

### 不做

- 不修改 `queue.mjs` 的 `done + integrated` 完成语义，不把 `verifying` 改成可解锁依赖；需要该语义时另建治理 Task、合同测试与迁移说明。
- 不新增 GOAL/Requirement 运行状态机，不修改 `contracts.mjs` 能力等级，不修改 `project/autonomy-policy.json`。
- 不自动把 signal/triage 建议变成 ready Task；不自动拆解用户需求；不实现 Phase 2 发现循环、Phase 3 并行实现、Phase 4 发布/遥测。
- 不启用真实 Provider、付费 API、真实模型、Desktop/Agent 实例、UI 运行或发布器；不在本 Task 提升 level。
- 不运行 `verify:ui:*`，不启动长驻 dev server，不读取真实用户状态或凭据。
- 不把“证据路径存在”写成“证据语义已审核”；不把 `engineering-complete` 写成用户接受或发布授权。
- 不修改产品 Runtime、现有 `.claude` hooks、`.ua` 或他人 `temp/`。

## Given / When / Then

- Given 一个 REQ 有 R1..R3，manifest 为每个条款绑定本 REQ/PLAN 内的 Task 和存在的证据路径，When 执行 `requirement-check`，Then 输出逐条覆盖矩阵；任一环节缺失时 `stopReason=coverage-gap` 且不领取任何 Task。
- Given manifest 内 4 个 Task 的依赖、写路径和状态可调度，When 执行 `requirement-run --through verify`，Then 按优先级/ID 串行调用 `cycle`，每个 Task 仍走实现→异家族评审→验证；不领取 manifest 外的 ready Task。
- Given 所有条款绑定的 Task 都已 `integration_status: integrated` 且状态为 `verifying` 或 `done`，When 判定完成，Then 报告 `engineering-complete`，同时 `humanAcceptance` 为 `pending`（存在 verifying）且 `release` 为 `not-authorized`；不得写成用户已接受。
- Given 某条款的 Task 未集成或证据路径缺失，When 队列暂时无 eligible Task，Then 报告 `coverage-gap` 并列出缺失条款/Task/证据，而不是 `engineering-complete` 或 `empty-queue`。
- Given 某 Task 的 `depends_on` 前驱仍是 `verifying`（未 `done + integrated`），When 选择下一个 Task，Then 该 Task 保持不可领取并报告 `needs-human`，说明需先完成人工接受；不绕过依赖，不把前驱改成 done。
- Given Task 被阻塞、租约被占用、路径冲突或连续 `needs-action`，When 达到停止条件，Then 分别报告 `blocked`、`stalled`、`failed` 等具体原因，保留 Task 源码、租约和运行状态，不自动重试 terminal/stalled run。
- Given `--through integrate` 但策略等级低于 2，When 启动，Then 在 claim/cycle 前拒绝并报告 `needs-human`；不产生 run 或 lease。
- Given 运行达到 `--limit` 或收到中断信号，When 收尾，Then 报告 `limit`/`cancelled`，列出未执行 Task 与下一步，不把部分完成写成全部完成。

## 必须保持

- `queue.mjs` 的完成语义仍是 `done + integrated`；`verifying` 不会因为本 Task 解锁任何 `depends_on`。
- 现有 `cycle`/`loop` 的参数、停止语义和策略检查不变；`requirement-run` 是它们之上的需求级选择/报告层。
- 七类人工闸门、未知分类、异家族评审、可信验证、集成与发布边界不变。
- 报告只做证据路径存在性检查，明确标注 `evidenceCheck: presence-only` 与 `semanticReview: not-performed`；独立评审和人工接受仍是独立证据层。
- 不新增第二套租约/授权状态；需求级报告不是调度权威，恢复仍以 Task 状态和现有 store 为准。
- 保留现有未跟踪 `temp/` 与其他 Agent 的改动；只提交本 Task 声明路径。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run scripts/agents/requirement-run.test.mjs scripts/agents/cli.test.mjs`。
- 现有控制器回归：`bun run test:agents`。
- 质量检查：`bun run check:quick`；合并前完整 `bun run check`。
- 记录/索引检查：`bun scripts/quality/run-vitest.mjs --run scripts/quality/project-indexes.test.mjs scripts/quality/check-task-worktrees.test.mjs scripts/release/release-notes.test.mjs`。
- 用户流程：在测试夹具中用 3 条款/4 Task 的临时 Git/Task 树跑 `requirement-check` 与 `requirement-run`；用注入的受控 `execute` 代替真实模型，不启动 Provider、UI 或发布器。
- 失败场景：缺条款映射、证据路径不存在、Task 不属于本 REQ/PLAN、依赖等待 verifying、路径冲突、租约占用、连续 needs-action、L1 下请求 integrate、达到 limit、中断取消。
- 证据：保存测试日志路径、报告 JSON 摘要、实际提交 Hash；不把局部测试写成完整 L4 或真实模型质量证据。

## 验收分层

- 工程验证：本轮通过；定向 2 文件 / 19 例、agents 20 文件 / 116 例、记录检查 3 文件 / 31 例、`check:quick` 与完整 `check` 均 exit 0；报告 schema 由 `validateRequirementReport` 与 runner 测试覆盖。未调用真实模型，不能用本结果证明模型质量。
- 技术评审：待执行；需新上下文只读审查 `requirement-run.mjs`、schema、CLI 接线和测试，并如实标注是否同家族评审。
- 集成：`integration_status: integrated`；实现提交 `54e080673` 与记录提交 `c1b45985d` 已 fast-forward 推送个人 origin/dev（`d1ddd68ee..c1b45985d`），`git ls-remote` 确认远端为 `c1b45985d4faa3ac42146f274e9e815b936921b0`；未推 origin/main、upstream、tag 或发布。
- 人工功能验收：待验收；用户需用真实 REQ/PLAN 跑一次 `requirement-check`/`requirement-run` 并检查报告是否符合预期；Agent 不自评接受。
- 发布：未授权；本 Task 不产生发布候选。

## 功能验收包

- 入口与前置条件：本地仓库、Bun、现有 `scripts/agents` 测试依赖；不配置真实模型，不启动 Desktop。
- 操作步骤或 AI 任务输入：
  1. 准备一个含 R1..R3 的临时 REQ/PLAN 与 4 个 Task 的 manifest，其中 3 个 Task 已集成、1 个按依赖等待。
  2. 运行 `requirement-check`，检查矩阵与 `coverage-gap`/`needs-human` 判定。
  3. 运行 `requirement-run --through verify`，检查只执行 manifest 内 Task、报告 stopReason 与未执行项。
  4. 将全部 Task 置为 `done + integrated`（内部夹具）后复跑，检查 `engineering-complete` 与 `humanAcceptance`。
- 预期行为与最终产物：覆盖矩阵逐条对应 R1..Rn；报告 JSON 符合 schema；无 manifest 外 Task 被执行；`verifying` 不被写成接受；发布始终 `not-authorized`。
- 不通过表现与已知限制：把空队列当完成、把 verifying 当依赖完成、报告缺证据路径仍判完成、自动领取无关 ready Task、在 L1 下执行 integrate、真实模型/UI/发布未运行却写成通过。
- 验收反馈及回归案例：用户对真实 REQ 的拆解/覆盖是否符合预期；失败案例固化为 `requirement-run.test.mjs` 的回归用例。

## 交付记录

- 实际修改：
  - 新增 `scripts/agents/requirement-run.mjs`：coverage manifest 校验、R1..Rn → Task → evidence 矩阵、manifest 内串行选择、`cycle` 委托、停止原因与原子报告；`engineeringComplete` 只认 `integration_status: integrated` 且状态为 `verifying`/`done`。
  - 新增 `schemas/agents/requirement-run.schema.json`：用现有封闭 JSON Schema 子集定义 coverage 与 report；根 `anyOf`，`$defs` 供模块按名引用。
  - `scripts/agents/cli.mjs`：新增只读 `requirement-check` 与 `requirement-run`，参数 `--requirement/--plan/--coverage/--report`；`requirement-check` 在加载策略前返回，不创建状态目录。
  - 测试：`requirement-run.test.mjs` 10 例；`cli.test.mjs` 新增 2 例并给夹具补 requirement/plan。
  - `scripts/agents/README.md`：补充用法、停止语义、工程完成/人工接受/发布分层与默认限制。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run scripts/agents/requirement-run.test.mjs scripts/agents/cli.test.mjs` → 2 文件 / 19 例通过。
  - `bun run test:agents` → 20 文件 / 116 例通过。
  - `bun run check:quick` → exit 0（Biome、guards、project-indexes 等通过）。
  - `bun run check` → exit 0（lint/types/guards/mobile-lint 全部通过）。
  - `bun scripts/quality/run-vitest.mjs --run scripts/quality/project-indexes.test.mjs scripts/quality/check-task-worktrees.test.mjs scripts/release/release-notes.test.mjs` → 3 文件 / 31 例通过。
  - `git commit` → `54e080673`（feat(agents): 实现需求级覆盖与串行 Requirement Run）、`c1b45985d`（docs(project): 记录 TASK-0334 需求级运行实现与验证）。
  - `git push origin main:dev` → `d1ddd68ee..c1b45985d`；`git ls-remote origin refs/heads/dev` 确认远端为 `c1b45985d4faa3ac42146f274e9e815b936921b0`。
- 未运行及原因：真实 Provider、真实模型、真实 UI、CI、发布、遥测均不在本 Task 授权内；`requirement-run` 的默认 `verify` 路径只用注入 `execute` 测过，未调用真实 `cycle`/adapter。
- Worktree：未拆出；serial 共享 `scripts/agents`，单 Agent 串行修改。
- 剩余风险：覆盖 manifest 由 Agent/协调者编写，路径存在性不能证明证据语义正确；`verifying` 依赖仍需人工接受，需求级闭环会在该点停下；Phase 2–4 未实现；真实模型回合未验收。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
