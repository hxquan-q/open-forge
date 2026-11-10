---
id: TASK-0452
type: task
status: done
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0450, TASK-0451, TASK-0456]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - project/agents.json
  - project/autonomy-policy.json
  - scripts/agents/adapters.mjs
  - scripts/agents/doctor.mjs
  - docs/dev/agent-rules/autonomy.md
write_paths:
  - project/agents.json
  - project/autonomy-policy.json
  - scripts/agents
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0450, TASK-0451]
conflicts_with: [TASK-0450, TASK-0451]
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 真实 adapter 端到端验收任务（PLAN-0029 Phase 1.4）

## 目标

启用一个真实 adapter，拿一个低风险 Task 跑通“独立执行 → 只读评审 → 修复 → 远端候选 CI → 集成 `origin/dev`”，并证明运行的不是 mock：代码提交、评审对象、CI 对象三者一致（依赖 TASK-0451 的绑定）。

## 待定决策（2026-11-07 定稿，依据用户 2026-11-06 提供的端点与授权）

- adapter 与模型：新增 `qwen-http` wrapper（`scripts/agents/model-adapter.mjs`，OpenAI-compatible HTTP，无 shell、文件工具限定 Task write paths），指向用户提供的内部端点 `qwen3.8-27b`；baseUrl/apiKey 存 `E:/forge-controller/adapter.config.json`（仓库外，不入库、不记录）。
- policy：`level: 2`、`capabilities: [implement, review, verify, integrate-dev]`、`allowedProviders: [openai-compatible]`；满足 integrate-dev 最低 level 2。
- 评审隔离：`differentReviewerFamily: false`（同一模型兼任实现与评审，如实记录偏离）。缓解：评审 actorId 按 attempt 唯一、评审在 detached 候选副本执行、binding head/tree 一致性校验、assertDistinctContext。
- 样本任务：TASK-0456（autonomy 文档同步推送后候选核验；`docs/dev/agent-rules/**` 命中 tests-and-guards 闸门，需操作者签名 approval，顺带演练人工闸门导入）。
- 隔离声明：`isolation: external-sandbox` 为 wrapper 层约束（无 shell、路径受限、固定 git 子命令），非 OS 沙箱；执行边界由操作者签名的 execution proof 如实背书。

## 不做

- 不接自动发布、不开放团队租约与并行调度。
- 不把单次成功写成控制器达到目标 level。

## 验收

- 运行记录包含真实 adapter 调用证据（命令、模型、输出摘要、耗时、费用），无 mock fixture。
- 集成到 `origin/dev` 的提交 SHA 与评审、CI 记录一致；失败时如实记录阶段与原因。

## 交付记录

- 实现（2026-11-07）：`scripts/agents/model-adapter.mjs` OpenAI-compatible wrapper（无 shell；文件工具限定 cwd 与 Task write paths；git 限定固定只读子命令 + 显式 add/commit，支持响应无文件变更评审的空提交；工具轮次预算声明与剩余告警；forced 轮空响应重试）+ `model-adapter.test.mjs` 14 例；`project/agents.json` 增 `qwen-implementer`/`qwen-reviewer`（同端点同模型双身份，满足 doctor 的 a.id≠b.id 身份要求）；`project/autonomy-policy.json` 提升至 level 2、capabilities [implement, review, verify, integrate-dev]、allowedProviders [openai-compatible]、differentReviewerFamily false；三处测试 fixture 显式固定 `differentReviewerFamily: true`（它们断言跨家族评审语义，消除对部署态的隐式依赖）。
- 操作面（仓库外 `E:/forge-controller/`）：`adapter.config.json`（baseUrl/apiKey/model，不入库）、`state/`（controller.key、trusted-execution/trusted-services/trusted-humans.json）、`ops/`（keys/trust/proof/approve/ci-proof/dump-contract/provision-deps）。节点依赖以 junction 预供给 worktree（verify 不做模型驱动安装）。
- 真实调用证据（模型 qwen3.8-27b，端点 http://183.36.30.83:8317/v1，doctor 确认模型列表；命令 = agents.json 的 wrapper 数组）：run5/run6 实现 input 69.8K/72.7K、output 0.9K tokens，耗时约 4-5 分钟/轮；评审 input 1.84M-3.07M、output 1.4K-2.6K tokens（cached 占比约 89%），耗时 8-24 分钟；费用 `costUsd: null`（自托管端点未报价，usage 记账保留 token 数）。无 mock fixture，全部经控制器 store 记账（source: cli-reported）。
- 六轮运行如实记录：run1 serial 任务无 worktree（控制器合同）；run2 模型 24 轮只读不写被正确拦截（催生轮次预算指引）；run3 工程候选 cedc296b4 评审 approve、verify 因环境失败（Bun store 损坏与 junction 覆盖不足），修复轮合同要求新提交而模型无法空提交 → 预算熔断（合同缺口：环境性验证失败无原候选重验路径）；run4 残留目录致 prepare 失败；run5 工程候选 a29a4c414 全绿，集成候选评审耗尽 40 轮后 forced 空响应（协议缺陷）；run6 完整走通：实现 1ae6120d1 → 评审 approve（0 findings）→ verify tests/check/impact 全绿 → 集成候选 39cdeec9d → 集成轮重评审 approve（附一条准确 low finding：README 索引变更在 write_paths 外属协调者路径）→ 集成轮 verify 全绿（需为集成候选补签 approval，闸门按绑定精确生效）→ `integrate` ff 本地 main → 授权后推 `main:dev`（origin/dev = 39cdeec9d526，与评审/审批/检查绑定一致）。
- 人工闸门演练：`docs/dev/agent-rules/**` 命中 tests-and-guards，操作者 Ed25519 签名 approval 经 `agent:approval` 导入，工程候选与集成候选各一份（按 binding 绑定）。
- 已知限制（如实）：实现者在无 shell 工具集下仍会在交付记录中声称“bun run check 通过”（不可信的验证声明，真实验证以控制器 verify 为准）；27B 模型在集成轮“响应评审但无需改文件”场景反复失败，空提交选项最终未被执行预算覆盖到；wrapper 层隔离非 OS 沙箱。
- 偏离与异常：本地 main 曾两次 rebase 移除误提交的 bootstrap（b71af6f/cf5807e/ab65bf7，均为任务状态翻转的中间提交，最终集成提交 39cdeec9d 包含同等翻转）；worktree remove --force 遇 junction 部分中止留 husk（主工作区经 git status 与 7530 文件守卫核对无损失），后续先拆 junction 再删目录。
- 候选验证（CI 绑定，2026-11-07）：授权推送 `main:dev`（origin/dev = 39cdeec9d526，纯 fast-forward）；CI quality workflow run 42264316594 **success**。逻辑名映射（按 scripts/agents/README 规则，签发方来源说明）：`check` ← quality job `check + quality tests` 的 `bun run check`；`tests` ← 同 job `bun run test:quality`（dev push 不触发 3-OS matrix，见 ISSUE-0029）；`impact` ← 本地 verify 阶段对同一集成候选的 `test:impact`（store checks 记录 impact passed）与 CI 同提交全绿交叉印证（README 明定当前 workflow 无同名 job 由签发方说明来源）。操作者 Ed25519 签发 CI 证明，`candidate-verify` 通过：status `candidate-verified`、ciRunId 42264316594、head/tree 与集成证据一致，store 写入 `integration.candidateVerification`。
- 未运行与风险：docs-site workflow 在 39cdeec9d 上 **failure**（`apps/docs-site/content/docs/(en/)plugins/capabilities.mdx` MDX frontmatter 前有 JSX 注释行，引入于存量提交 ceef9d9f3/34f162b66，早于本次推送窗口；本地 `bun run check` 只 typecheck 不 build 故未拦截）。不影响本任务验收（requiredChecks 来源 quality workflow 全绿），修复待另立任务。`bun run test:quality` 全量与完整 check 未在主工作区对 39cdeec9d 重跑（verify 已在 worktree 内对集成候选执行 tests/check/impact 三项全绿，CI 同提交复核）。
- 结论：验收条款全部达成——回路「独立执行 → 只读评审 → 修复语义（触发与熔断已验证）→ 远端候选 CI → 集成 origin/dev」真实跑通且无 mock；集成 SHA 与评审、审批、CI 记录三方一致；六轮失败如实入档。控制器不因此声明达到目标 level（rollout 另计）。
