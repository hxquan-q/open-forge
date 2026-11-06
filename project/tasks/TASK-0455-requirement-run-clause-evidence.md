---
id: TASK-0455
type: task
status: verifying
priority: P2
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0451, TASK-0454]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/tasks.mjs
write_paths:
  - scripts/agents/requirement-run.mjs
  - scripts/agents/requirement-run.test.mjs
  - schemas/agents/requirement-run.schema.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: []
conflicts_with: [TASK-0451, TASK-0452, TASK-0454]
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# requirement-run 条款级证据关联（PLAN-0029 Phase 1.5）

## 目标

`requirement-check` 的证据从“路径存在”（`evidenceCheck: presence-only`）提升为与条款关联的可核对证据；工程完成、候选验证、人工验收、已发布四种状态分开记录。由 TASK-0451 原草稿拆出。

## 调查结论（2026-11-06，只读核对）

- `requirement-run.mjs` 的 `evidenceCheck()` 只校验仓库内非空、非 glob 的真实文件；`clauseView` 按 Task 的 integrated + verifying/done 计工程完成。
- 报告固定输出 `evidenceCheck: "presence-only"`、`semanticReview: "not-performed"`（schema 以 `const` 锁定，README 第 56 行同述）。
- TASK-0451 落地后，store 中 `runs[*]`（含 `task` = Task ID）在 status `integrated` 且 phase `applied` 时可携带 `integration.candidateVerification`（`verifyCandidate` 写入），是候选验证的权威来源。
- 与 TASK-0451/0454 无代码依赖，但共享 `scripts/agents`，按 0451 → 0454 → 0455 串行。

## 范围

### 并发评估

- 结论：不支持并行（共享 `scripts/agents`，`exclusive_paths` 重叠）。
- 执行方式：serial；集成顺序 0451 → 0454 → 0455。

### 做（2026-11-06 定稿）

- 条款关联形式（定稿）：manifest 侧声明 + 证据文件内精确引用。`taskRef.evidence` 条目扩为字符串或封闭对象 `{path, clauses, kind}`：`path` 沿用字符串条目约束；`clauses` 为非空去重的条款 ID 列表，每个 ID 必须是 manifest 中绑定到该 Task 的条款；`kind` ∈ `test`/`verification`/`ci`，仅作声明与报告记录，不触发行为差异（CI 的权威绑定仍是 store 的 `candidateVerification`）。
- 机械关联检查（定稿）：对象条目复用既有路径检查后，另读证据文件 UTF-8 内容，须以精确 token（前后边界为非 `[A-Za-z0-9_.-]` 字符，避免 `R1` 命中 `R10`）同时引用需求 ID（如 `REQ-0019`）与声明的每个条款 ID（如 `R1`）；声明条款未绑定该 Task、文件缺需求或条款引用，均按既有 problem/missingEvidence 路径报告。
- 存量兼容（定稿）：字符串条目语义不变；manifest 全为字符串条目时 `evidenceCheck` 保持 `presence-only`，出现任一对象条目即为 `clause-reference`。schema 的 `evidenceCheck` 由 `const` 改为枚举 `["presence-only", "clause-reference"]`。
- 四态分离（定稿）：`requirementRun` 的最终报告从 store 计算候选验证——run 的 `task` 等于该 Task、status `integrated` 且 `integration.candidateVerification` 存在即该 Task candidateVerified。报告 Task 增可选 `candidateVerified`（布尔）；条款增可选 `candidateVerification`（`verified`/`pending`，全部引用 Task 工程完成且已验证才 verified）；顶层增可选 `candidateVerification`（`verified`/`pending`/`not-applicable`，无工程完成 Task 时 `not-applicable`）。新字段全部可选，兼容存量报告。`checkRequirement` 无 store，不加候选验证字段；`humanAcceptance` 语义不变，不从 Task 状态推断验收。
- README 需求级覆盖段更新：新证据条目形式、两种检查级别、四态语义（engineering / candidate-verified / human-accepted / released）。

### 不做

- 不做模型驱动的语义判定，`semanticReview` 保持 `not-performed`；不改 Task 状态机与 coverage 拆解来源。
- 不为 `kind` 增加行为分支或提交绑定校验（提交级 CI 绑定属 store/candidateVerification，不在报告层重做）。
- 不改 `checkRequirement` 既有返回字段（除 `evidenceCheck` 变为计算值）。

## Given / When / Then

- Given manifest 条目为对象、声明条款已绑定该 Task、证据文件同时精确引用需求 ID 与条款 ID / When `checkRequirement` / Then 工程满足时条款 covered，`evidenceCheck` 为 `clause-reference`。
- 失败用例：证据文件缺条款引用或缺需求引用、声明条款未绑定该 Task，`runnable` 为 false 且 problem 指明缺失/未绑定；人工验收缺失时报告不得出现 accepted。
- 既有行为：纯字符串 manifest 全部用例不变（`presence-only`、路径检查、报告结构）；存量报告（无新字段）仍通过 schema 校验。
- Given store 中该 Task 的 run status `integrated` 且携带 `candidateVerification` / When `requirementRun` 出报告 / Then 该 Task `candidateVerified` 为 true、对应条款与顶层为 `verified`，而 `humanAcceptance` 仍为 `pending`（Task 非 done）；无工程完成 Task 的报告顶层为 `not-applicable`。

## 测试与验证

- 失败用例先行；`requirement-run.test.mjs` 新增对象条目关联通过、条款引用缺失、未绑定条款、存量字符串兼容、store 候选验证四态、存量报告校验用例；`scripts/agents` 全量测试经仓库 runner 串行；`bun run check:quick -- <files>`；`bun run test:impact -- <files>`。

## 交付

- 实现：`requirement-run.mjs` 将 manifest `taskRef.evidence` 条目扩为字符串或封闭对象 `{path, clauses, kind}`（schema 新增 `$defs.evidenceRef`：`path` 沿用字符串条目约束，`clauses` 非空去重且每个 ID 须绑定到该 Task，`kind` ∈ `test`/`verification`/`ci` 仅作声明不触发行为差异）；新增 `referencesToken`（条款 ID 转义后按前后非 `[A-Za-z0-9_.-]` 边界做精确 token 匹配，`R1` 不命中 `R10`）、`manifestEvidenceLevel`（出现任一对象条目即 `clause-reference`，否则 `presence-only`）、`evidenceProblems`（对象条目复用既有路径检查后读 UTF-8 内容，须同时精确引用需求 ID 与每个声明条款 ID，声明未绑定或引用缺失均按既有 problem/missingEvidence 路径报告，`missingEvidence` 保持路径字符串）；`validateCoverage` 五处返回统一携带计算出的 `evidenceCheck`（含任务装载失败回退）；`verifiedTaskIds` 从 store runs（`task` 匹配、status `integrated` 且 `integration.candidateVerification` 存在）计算候选验证，报告 Task 增可选 `candidateVerified`、条款增可选 `candidateVerification`（verified/pending）、顶层增可选 `candidateVerification`（verified/pending/not-applicable），`checkRequirement` 保持无候选字段、`humanAcceptance` 语义不变；README 需求级覆盖段更新证据形式、两级检查与四态语义。
- 技术评审：主会话对两个子代理的 diff 逐变量自审（正则转义与边界字符集、`boundClauses` Map 构建及 `taskViews` 改写与旧 `clauseIdsByTask` 的等价性经 `git show HEAD:` 对照、五处返回 `evidenceCheck` 完备性、schema `clause.tasks` minItems 1 使空 refs 不可达故 `every` 判定安全、报告新字段全部可选兼容存量）；统一检查阶段修复子代理 4 处 Biome 格式与未用参数问题；未引入独立评审身份，不宣称独立评审。
- 实际验证（2026-11-06）：失败用例先行（RED 运行 8 failed | 11 passed，含目标错误文案）后实现转绿；`requirement-run.test.mjs` 19 例通过；`scripts/agents` 全量 22 文件 197 例经仓库 runner 串行通过（166.96s）；`bun run check:quick -- <4 个改动文件>` 通过；`bun run test:impact -- <4 个改动文件>` 首跑 2 例失败（`runner.test.mjs:307` 5s 超时 + `integrate.test.mjs` 1 例），单独复跑两文件 28/28 通过，判定为 Windows 偶发（与 TASK-0454 记录模式一致）。
- 偏离与异常：上述 test:impact 偶发；`requirement-run.mjs` 增至 832 行触发文件规模提示，增长均为本任务语义主线，未混入无关重构。
- 未运行与风险：完整 `bun run check` 未运行（docs-site 与 mobile 为既有环境问题，见 TASK-0448 记录）；候选验证仅以 store 种子数据验证，真实 `candidateVerification` 产生链路留待 TASK-0452 端到端。
- 本提交保存至 `xquan`，目标 `origin/xquan`；`integration_status` 保持 pending。人工验收：不适用（内部控制器合同，无用户可见行为），完成标准为全量测试与门禁通过。
- 发布：不适用

## 集成补记（2026-11-07）

- 实现已随 `8649c8ac5` 集成本地 `main` 并推送 `origin/dev`（16d7e620f）；真实 `candidateVerification` 产生链路经 TASK-0452 端到端验收（done）覆盖，`integration_status` 补记为 integrated，状态置 verifying。
