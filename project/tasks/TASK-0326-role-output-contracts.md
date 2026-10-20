---
id: TASK-0326
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-request; open-forge-autonomous-dev-plan-v2.md; Magpie engineering review
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0322, TASK-0323, TASK-0324, TASK-0325]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（scripts/agents 控制器共享路径，单 Agent 串行）
base_commit: 6c5e94d09
read_paths: [scripts/agents, schemas/agents, project/tasks, docs/dev/agent-rules]
write_paths: [scripts/agents/adapters.mjs, scripts/agents/adapters.test.mjs, scripts/agents/runner.mjs, scripts/agents/contracts.mjs, scripts/agents/cli.mjs, scripts/agents/runner.test.mjs, scripts/agents/cli.test.mjs, schemas/agents/policy.schema.json, schemas/agents/role-output.schema.json, schemas/agents/implementation.schema.json, schemas/agents/review.schema.json, schemas/agents/planner.schema.json, schemas/agents/triage.schema.json, schemas/agents/lessons-output.schema.json, schemas/agents/ui-review.schema.json, schemas/agents/lesson.schema.json, project/tasks/TASK-0326-role-output-contracts.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, scripts/agents/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/agents/runner.mjs, scripts/agents/adapters.mjs, schemas/agents/role-output.schema.json]
depends_on: [TASK-0325]
conflicts_with: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0327, TASK-0328, TASK-0329]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 完整角色执行合同与路由

## 目标

续接 TASK-0322–0325，兑现配置 Schema 已声明但执行器尚未支持的 `planner`、`triage`、`lessons`、`ui-reviewer`。每个角色使用闭合的 JSON 输出合同和角色专属提示；模型文本不能声明执行身份、直接修改仓库或绕过控制器。执行结果进入可审计运行状态，未知状态和越权输出一律拒绝。

## 范围

### 并发评估

- 结论：不支持并行写入
- 执行方式：serial
- 可并行 Task：无；与 TASK-0327–0329 共享 `scripts/agents` 入口
- 前置依赖：TASK-0325 已集成
- 冲突文件/独占路径：见 frontmatter
- Branch：`main`
- Worktree：单一控制器目录串行，不新增 Worktree
- 集成负责人：当前 Agent
- 集成顺序：角色合同 → 编排 → UI → 信号 → readiness

### 做

- 建立四类角色有界输出：计划/拆解、信号分诊、复盘建议、UI 评审。
- 让 `decodeOutput`、`executionPrompt`、`assertRunnable` 与角色选择完全基于固定三列表，不再用二元 implementer/reviewer 表达式。
- 把角色运行结果集成为运行状态字段；planner/triage/lessons/ui-reviewer 仅产生建议，不允许推进实现、评审或集成状态。
- 用真实子进程测试正常输出、未知字段、错误角色、只读改动和身份伪造。

### 不做

- 不调用真实模型，不启用 adapter，不修改策略等级或授予能力。
- 不让视觉建议自动成为通过条件；UI reviewer 的独立性与真实运行由 TASK-0328 接线。
- 不直接修改 `.agents`、发布器、产品运行时或真实用户状态。

## Given / When / Then

- Given 配置允许 planner 和有效 run contract，When 执行 planner，Then 只得到闭合计划建议并记录 controller-owned 身份，Task/run 进度不变。
- Given triage/lessons 输出试图包含任意额外字段或修改决策，When 解码，Then 拒绝且不写入运行状态。
- Given UI reviewer 试图修改候选或自报 human/model，When 执行，Then 输出合同或 worktree 检查拒绝，已有证据状态不被提升。
- Given 无授权 adapter 或角色不受配置支持，When 选择角色，Then 在启动进程前失败。

## 必须保持

单写者、租约/fencing、证据绑定、独立评审、模型身份由配置决定、未授权默认关闭、人工闸门与发布边界不变。分析角色不能推进 Task；任何模型输出都只是数据。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run scripts/agents/runner.test.mjs scripts/agents/cli.test.mjs`
- 用户流程：每个角色由公开 CLI `run --role ...` 返回结构化结果，拒绝伪造和越权。
- 质量检查：`bun run check:quick`，完成前 `bun run check`。

## 验收分层

- 工程验证：原有定向/quick 及本轮 46/46 包组合验证通过，完整 check 见 TASK-0333 的最终推送记录；真实模型行为未验收。
- 技术评审：当前 Agent 自审；真实独立模型评审未配置。
- 集成：`ecfe01f17` 已提交本地 main，TASK-0333 推送审计核对为 main 祖先；集成元数据本轮回填。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：受控临时 Repository 与 fixture adapter；真实 adapter disabled。
- 操作步骤或 AI 任务输入：用 CLI 分别请求 planner/triage/lessons/ui-reviewer。
- 预期行为与最终产物：闭合 JSON、角色运行审计、实现/评审状态不被推进；违规输出明确拒绝。
- 不通过表现与已知限制：缺角色、错误 Schema、候选修改、身份自报或缺少 adapter 均失败；真实模型质量不评。
- 验收反馈及回归案例：待收集。

## 交付记录

- 实际修改：新增 `planner`、`triage`、`lessons-output`、`ui-review` 四份闭合 Schema，补齐策略能力枚举与最低等级路由；`adapters.mjs` 使用固定角色表统一选择能力、解码合同和生成角色提示；`runner.mjs` 只让实现者写仓库和推进候选，分析角色仅记录 controller-owned 身份、绑定哈希与结构化建议，拒绝任何文件/Git 改动；`cli.mjs` 在运行结果中返回 `analyses`。新增角色合同、只读越权、身份不可自报和未知角色的正反向测试。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/agents/adapters.test.mjs scripts/agents/orchestrate.test.mjs scripts/agents/runner.test.mjs scripts/agents/cli.test.mjs scripts/agents/queue.test.mjs`，5 文件 / 34 例通过（2026-10-20）。组合定向包含 TASK-0327 回归，按实际文件边界报告。
- 未运行及原因：未调用真实模型、未启用 adapter、未运行独立模型评审；用户已明确没有实现模型与异家族评审配置。模型提示的语义质量仍需真实受限运行与 A/B 评估。
- Worktree：`scripts/agents` 共享控制器路径，单 Agent 串行 main，未拆出独立 Worktree。
- 剩余风险：闭合 Schema 只证明输出形状和仓库只读边界，不证明模型建议正确；真实 Provider 的消息格式、usage 与错误语义仍需适配验收。
