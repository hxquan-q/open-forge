---
id: TASK-0450
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3179282c470bdb2ccab8d9bdbfb7ff836b5eb66a
read_paths:
  - docs/dev/agent-rules/collaboration.md
  - project/collaboration/development-workflow.md
  - scripts/agents/policy.mjs
  - scripts/agents/tasks.mjs
write_paths:
  - scripts/agents/integrate.mjs
  - scripts/agents/integrate.test.mjs
  - scripts/agents/prepare.mjs
  - scripts/agents/release.mjs
  - scripts/agents/release.test.mjs
  - scripts/agents/contracts.mjs
  - scripts/agents/contracts.test.mjs
  - scripts/agents/adapters.test.mjs
  - schemas/agents/policy.schema.json
  - project/autonomy-policy.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: []
conflicts_with: [TASK-0451, TASK-0452]
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 研发控制器集成目标配置化（PLAN-0029 Phase 0.4 + 1.1）

## 目标

分支职责已在 `docs/dev/agent-rules/collaboration.md` 定义（本地 `main` 集成、`origin/dev` 开发候选、`origin/main` 稳定发布）。控制器在 `integrate.mjs:17`、`prepare.mjs:45`、`release.mjs:88` 三处硬编码 `main`，本 Task 把集成分支与远端候选目标改为由 `project/autonomy-policy.json` 声明，经 `validatePolicy` 校验。

## 范围

### 并发评估

- 结论：不支持与 TASK-0451/0452 并行（共享 `scripts/agents`）。
- 执行方式：serial
- 集成顺序：0450 → 0451 → 0452

### 做

- policy 新增 `integration` 字段：本地集成分支（默认值与现状一致为 `main`）、远端候选引用（`origin/dev`）。
- 三处检查改读 policy；错误信息包含期望与实际分支。
- `validatePolicy` 校验字段类型与分支名格式；缺失字段的处理按现有 policy 版本兼容规则决定并记录。
- 兼容决定：policy 仅有入仓单份且 `version` 固定为 1，`integration` 设为必填、无默认回退；缺失时 `validatePolicy` 报 `integration: required`。“默认 `main`”指入仓值与现状一致，而非代码回退。
- 更新 `scripts/agents/README.md`，链接协作规则作为分支职责事实源。

### 不做

- 不改变分支职责本身，不推送，不触碰 `origin/main` 晋升。
- 不开启任何 capability 或 adapter。

## Given / When / Then

- Given：policy 声明集成分支为 `main`。
- When：控制器在 `main` / 非 `main` 检出上执行 prepare、integrate、release 前置检查。
- Then：`main` 上行为与现状一致；非 `main` 时拒绝并报出配置值；非法 policy 被 `validatePolicy` 拒绝。

## 必须保持

- 现有 `integrate.test.mjs`、`release.test.mjs`、`policy.test.mjs` 断言不削弱。
- 集成仍要求独立 Task worktree、租约有效和人工审批证据。

## 测试与验证

- 定向测试：先补失败用例（配置分支与检出不一致），再实现；`scripts/agents` 全量测试经仓库 runner。
- 质量检查：`bun run check`；`node scripts/quality/check-autonomy.mjs`（若适用）。

## 验收分层

- 工程验证：本轮修复定向测试与 check:quick 已通过；全量检查/影响测试存在未改模块的失败，详情见下。
- 技术评审：本轮修复经原生子任务独立只读复核，无阻断发现。
- 集成：pending
- 人工功能验收：不适用（控制器内部合同）
- 发布：未授权

## 2026-11-06 评审修复

- 来源：用户要求修复 review 中 Git 非法分支名通过 policy 校验的问题。
- 在已有 `xquan` 候选上串行续接；保留已存在的逐路径段校验和测试，不切换分支、不集成或发布。
- Given 配置含 `main.`、`feature//topic`、点开头或 `.lock` 路径段及保留名 `HEAD` / When validatePolicy / Then 在控制器执行准备、集成、发布前拒绝；有效 ASCII 分支及既有长度限制不变。
- 验证：非法本地分支与候选分支回归、现有 contracts/prepare/integrate/release 测试、`test:impact` 与完整 `bun run check`。
- 决策：保留现有受限字符集，在纯校验中补齐 Git 约束；避免在每次策略读取和 capability 检查时再启动 Git 子进程。
- 发布说明候选（当前 manifest 0.1.4 已发布，不改既有正文）：内部控制器拒绝非法集成分支与候选分支名；下一次版本准备时汇编。
- RED：保留名 `HEAD` / `origin/HEAD` 的新增断言在修复前失败；保留已存在的路径段修复及测试。
- GREEN：contracts/perf/quality-gates 定向 4 文件 179 例通过；额外用 `git check-ref-format --branch` 对照 `main`、`release/1.2_x` 及 5 个非法样例，结果一致。
- 最终 `bun run check:quick -- <本轮 11 个文件>` exit 0；根/CLI/Desktop 类型检查通过。完整 `bun run check` 因本轮未改的 docs-site/mobile 依赖与类型错误 exit 1，未安装/升级依赖或修改其他应用。
- `test:impact` 的完整质量套件共 808 例，797 通过、11 失败（Git 子进程超时、Windows Bash 发布夹具及临时目录 EPERM）。以 `--maxWorkers=1` 复跑 9 文件 275 例，270 通过、5 失败；与本 Task 相关的 contracts/integrate/release/runner 均通过，仅未修改的 `desktop-release-workflow.test.mjs` 的 5 例仍失败，不把单跑通过写成全套通过。
- 独立只读审查 `/root/review_fixes` 无阻断。上一轮修复保留在原工作区，未提交、集成或推送。

## 候选分支提交（2026-11-06）

- 用户在知悉上述验证失败后明确要求“提交推送”；本提交承载本 Task 的配置化实现与评审修复，目标为现有上游 `origin/xquan`。
- 改动归属：Open-Forge-only。复用相同文件、条件下已通过的定向、check:quick 与独立审查结果；完整门禁仍按上文记录失败。
- 这是候选分支保存，不表示已集成本地 main、通过开发候选验收或获准稳定发布；`integration_status` 保持 pending。

## 集成补记（2026-11-07）

- 实现已随 `dad01f2dd` 集成本地 `main` 并推送 `origin/dev`（16d7e620f）；`integration_status` 补记为 integrated，状态置 verifying。
