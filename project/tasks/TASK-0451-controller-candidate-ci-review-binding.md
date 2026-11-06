---
id: TASK-0451
type: task
status: ready
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0450, TASK-0454, TASK-0455]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/release.mjs
  - scripts/agents/runner.mjs
  - .github/workflows/quality.yml
  - .github/workflows/desktop-packaged.yml
  - project/research/RESEARCH-0045-github-codeup-flow-ci-migration.md
write_paths:
  - scripts/agents/services.mjs
  - scripts/agents/services.test.mjs
  - scripts/agents/integrate.mjs
  - scripts/agents/integrate.test.mjs
  - scripts/agents/evidence.mjs
  - scripts/agents/evidence.test.mjs
  - scripts/agents/release.test.mjs
  - schemas/agents/service-proof.schema.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0450]
conflicts_with: [TASK-0450, TASK-0452, TASK-0454, TASK-0455]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 候选提交与 CI 证据绑定（PLAN-0029 Phase 1.2）

## 目标

集成前要求远端最终候选提交 SHA/树、该 SHA 上的 CI 结论与已有本地评审/检查绑定三者指向同一对象。原草稿的评审独立性拆至 [TASK-0454](TASK-0454-controller-review-isolation.md)，条款级证据拆至 [TASK-0455](TASK-0455-requirement-run-clause-evidence.md)。

## 调查结论（2026-11-06，只读核对）

- CI 门禁来源：GitHub Actions。`quality.yml` 在 push dev 与 PR 上运行，`desktop-packaged.yml` 仅 PR；`codeup-sync.yml` 只做镜像同步，RESEARCH-0045 记录 Codeup Flow 尚未建立、合并前门禁不能交给 Flow。
- 控制器不直接调用 `gh`：`release.mjs` 只认签名 `ci` service proof（head/tree 一致且覆盖 `requiredChecks` + `desktop-packaged` + `tests/<platform>`）。本 Task 沿用签名 proof，不新增 `gh run` 依赖。
- 已有：`runner.mjs` 的 `codeBinding`（head/tree/policy/contract）、`evidence.mjs` 对 checks 与 review 的 binding 校验、评审者 actorId 不在 authors 中且 family 不同。
- 缺口：`services.mjs` 的 `ci` 数据无 `runId`、`remoteRef`；`integrate.mjs` 不校验 CI proof，只有发布阶段校验。

## 范围

### 做

- `ci` proof 数据新增 `runId`（非空文本）与 `remoteRef`（`<remote>/<branch>`，与 policy 的 `integration.candidateRef` 校验口径一致）。
- `applyIntegration` 接收 proofs，要求存在已验证的 `ci` proof：`head`/`tree` 等于最终候选，`remoteRef` 等于 policy 的 `integration.candidateRef`，`checks` 覆盖 `policy.requiredChecks`。
- 发布阶段沿用同一 proof 字段，`release.test.mjs` 夹具补新字段；发布已有断言不削弱。
- 检查名映射决定：proof 中的 `checks` 使用 policy 的逻辑名（如 `tests/windows`），由签发 proof 的服务把 workflow job 名映射为逻辑名；在 `scripts/agents/README.md` 记录映射表与签发方职责，控制器不解析 job 名。

### 不做

- 不接 GitHub API 或 Codeup Flow；不启用真实 adapter（TASK-0452）；不推送、不发布。
- 不改评审执行方式（TASK-0454）和 requirement-run 证据（TASK-0455）。

## Given / When / Then

- Given 已准备的集成候选与签名 CI proof / When `applyIntegration` / Then 仅在 proof 的 head、tree、remoteRef、checks 与候选及 policy 一致时前进。
- 失败用例：proof 针对旧提交、树不一致、remoteRef 不是候选引用、缺少必需检查、缺 runId、无 proof，均拒绝且不改动目标分支。

## 必须保持

- 现有 integrate/release/evidence 测试断言不削弱；集成仍要求独立 worktree、有效租约与人工审批证据。
- 签名校验、信任根与时间窗口语义不变。

## 测试与验证

- 先补失败用例再实现；`scripts/agents` 全量测试经仓库 runner；`bun run test:impact -- <files>`；`bun run check`。
