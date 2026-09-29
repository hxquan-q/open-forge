---
id: TASK-0114
type: task
status: done
priority: P3
owner: scripts/quality
requirement: []
plan: PLAN-0011
source: RESEARCH-0012 Avernet P3（`check_pr_title.py` `<type>(<scope>):` 强制 + 结构 PR 必填合同/消费者/迁移字段）
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [.github/workflows/, .github/pull_request_template.md, project/collaboration/development-workflow.md]
write_paths: [.github/workflows/, .github/pull_request_template.md, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# PR 结构门禁（title scope 强制 + 结构变更模板字段）

## 目标

Avernet 在 CI 里强制 PR title 为 `<type>(<scope>): <outcome>`（`scripts/ci/check_pr_title.py`），且结构变更 PR 模板必填「合同是否变更/受影响消费者/兼容性/迁移计划/waiver」（`ci.enforce.md:140-164`）。本仓 commit message 有语义化前缀规范，但 **PR 面无机械校验**。本任务补齐 PR 侧门禁。

## 范围

### 并发评估

- 结论：支持并行——写面在 `.github/`，与所有代码任务零交集。
- 执行方式：可独立 Worktree 或主工作区。
- 可并行 Task：本批全部。
- 前置依赖：无。
- 冲突文件/独占路径：无。
- Branch：独立 task 分支。
- Worktree：按需。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0011 阶段 C，独立可先行。

### 做

- 新增 workflow（如 `.github/workflows/pr-title.yml`）：校验 PR title 匹配 `<type>(<scope>): <desc>`，scope 闭集从 monorepo 包名/领域推导；
- `.github/pull_request_template.md` 增补结构变更必填段：「是否变更公共合同 / 受影响消费者与实现 / 兼容性 / 迁移计划 / waiver 引用」；
- 对本仓 fork 工作流（`hxquan-q/open-forge`）适配：只对发往 origin 的 PR 生效，不干扰 upstream fetch 流程；
- 文档同步：`development-workflow.md` 记一笔新门禁。

### 不做

- 不对历史 PR 追溯；
- 不做 commit-level title 校验（那是 commit-msg hook 的事，本任务只管 PR title）；
- 不引入外部 Action 依赖——用脚本/轻量 workflow 实现。

## Given / When / Then

- Given：一个 PR title 形如 `add feature`（无 type/scope）；
- When：CI 跑该 workflow；
- Then：报红并提示期望格式；改为 `feat(desktop): ...` 后转绿。

## 必须保持

- 不破坏既有 workflow；新门禁失败只影响新 PR；
- scope 闭集可维护（新包加入时闭集可扩，不致误伤）；
- fork 推送门禁与 upstream 只 fetch 不 push 的边界不变。

## 测试与验证

- 定向测试：title 正则用例（合法/非法/边界 scope）；
- 用户流程：在 fork 上发一个测试 PR 验证门禁生效（需用户授权触发或本地 act 模拟）；
- 质量检查：`bun run check:quick`、workflow YAML lint。

## 交付记录

- 实际修改：
  - `scripts/quality/check-pr-title.mjs`（新增）：`<type>(<scope>): <description>` 校验；type 白名单（feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert/i18n/merge）；scope = `package.json#workspaces` 全部包目录 basename（含 presets/externals 展开）+ `EXTRA_SCOPES` 非包域；支持逗号多 scope。
  - `scripts/quality/check-pr-title.test.mjs`（新增）：6 例——合法包 scope、多 scope、缺 scope/缺冒号/空描述等形状错误、未知 type/scope、边界 scope（`runtime` 合法域 vs `runtime-mcp2`/`runtime-nod` 拒绝、大写/空格拒绝）、常用 scope 覆盖断言。
  - `.github/workflows/pr-title.yml`（新增）：`pull_request` opened/edited/reopened/ready_for_review 触发，`contents: read` 权限，复用仓库既有 `actions/checkout` + `oven-sh/setup-bun`（无新第三方 Action），运行 `check-pr-title.mjs`。
  - `.github/pull_request_template.md`：新增 `## Structural changes` 段（合同变更与否、受影响消费者/实现、兼容性、迁移计划、waiver/ADR/OWNERS 引用），勾选 `Public contract` 时必填。
  - `project/collaboration/development-workflow.md`：新增「PR 标题与结构变更门禁」节（含本地预检命令与边界说明）。
  - `package.json`：`check-pr-title.test.mjs` 加入 `test:quality`。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run scripts/quality/check-pr-title.test.mjs` — 6/6 通过。
  - 本地模拟：`bun run scripts/quality/check-pr-title.mjs -- "feat(desktop): add canvas batch save"` → 放行；`-- "update stuff"` → exit 1 并提示形状。
  - workflow YAML 用 `yaml` 包实解析通过（并当场抓到并修复 job name 未加引号的真实语法错误）。
- 未运行及原因：真实 GitHub PR 触发未验证（需授权发测试 PR）；`bun run check` 全量留到树末统一验收。
- Worktree：主工作区。
- 剩余风险：
  - scope 允许逗号多值与 `merge` type，比 strict conventional-commits 宽松——与仓库现状对齐，收紧属后续治理决定；
  - `EXTRA_SCOPES` 需人工维护，非包域新增要同步两处（脚本常量+文档）；
  - workflow 未在真实 PR 上跑过，首个 PR 若误报可按错误信息定位 scope/type 修正。
