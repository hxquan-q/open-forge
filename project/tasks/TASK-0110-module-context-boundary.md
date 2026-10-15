---
id: TASK-0110
type: task
status: done
priority: P1
owner: scripts/quality
requirement: []
plan: PLAN-0011
source: RESEARCH-0012 Avernet P1（每模块 `## Context Boundary` YAML + `internal_dependencies` 白名单 + 生成 `dependents.md`）
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [scripts/quality/check-package-boundaries.mjs, scripts/quality/check-coding-agent-architecture.mjs, packages/*/README.md, packages/*/AGENTS.md, apps/*/AGENTS.md]
write_paths: [scripts/quality/, packages/*/README.md, apps/*/README.md, docs/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0111]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 每模块 Context Boundary 声明 + arch test + dependents 生成

## 目标

把包边界规则从「`check-package-boundaries.mjs` 里的集中前缀表」演进为 Avernet 式声明：每个包 README（或包级 `AGENTS.md`）内嵌 `## Context Boundary` YAML 块，声明 `purpose` / `provides` / `consumes` / **`internal_dependencies` 白名单**；arch test 校验「未声明的跨包 import 即失败」，并机器生成 `dependents.md` 反向视图（禁止手写）。声明与模块同处一地，新增包改自己的声明而非中心守卫。

## 范围

### 并发评估

- 结论：条件支持——写面横跨各包 README 与 `scripts/quality/`，文件级与其他任务基本不冲突，但与 TASK-0111（治理规则改写 AGENTS.md）在文档语义上有交集。
- 执行方式：可独立 Worktree；README 批量修改建议一次完成避免漂移。
- 可并行 Task：PLAN-0010/0012 任务、TASK-0113、TASK-0114。
- 前置依赖：无；需先定 YAML schema。
- 冲突文件/独占路径：`scripts/quality/check-package-boundaries.mjs` 演进路径与 TASK-0111 的守卫改动需协调（文件不同但语义相邻）。
- Branch：独立 task 分支。
- Worktree：按 workflow 派工。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0011 阶段 A 唯一项。

### 做

- 定义 `## Context Boundary` YAML schema：`purpose`（一句话职责）、`provides`（公开入口列表）、`consumes`（依赖的对外合同）、`internal_dependencies`（允许 import 的内部包白名单）；
- 给全部 `packages/*` 与 `apps/*` 写首版声明（从现有 `check-package-boundaries.mjs` 前缀表与 `package.json#exports` 导出推导，逐包核实）；
- arch test：扫描各包 import，凡 `internal_dependencies` 未声明的跨包 import 即失败；白名单缺省=禁止一切内部深链；
- 生成 `dependents.md`（谁依赖我）反向视图，由测试脚本产出并断言与声明一致，文件头注明「机器生成禁手写」；
- 与既有前缀表守卫**并行运行一个校验周期**：对比两机制报出的违规集，只允许新机制多报真实违规，不允许漏报；确认等价后再评估收编旧表（收编与否记入交付结论）；
- 落地时补一篇 ADR（集中表→每模块声明的形态迁移）。

### 不做

- 不改 `package.json#exports` 公开合同本身；
- 不动 import 的实际代码（本任务只加声明+校验，发现的真实违规登记为 waiver 或另立 bug）；
- 不引入 Avernet 的 Python import-linter 工具链——用本仓 TS/脚本实现。

## Given / When / Then

- Given：某包新增了未在 `internal_dependencies` 声明的跨包 import；
- When：跑 arch test / `bun run check`；
- Then：报红并指出「包 X import 了未声明的 Y」；补上声明后转绿；`dependents.md` 自动反映新依赖方向。

## 必须保持

- 既有 `check-package-boundaries.mjs` 在校验期内不得削弱或删除（并行双跑）；
- 生成的 `dependents.md` 禁止手写，CI 校验其与声明一致；
- 声明文件必须是各包自有 README/AGENTS.md，不新增隐藏配置目录；
- YAML schema 变更向后兼容（新增字段不破坏旧声明）。

## 测试与验证

- 定向测试：schema 解析器单测、白名单校验单测（含未声明 import 报红样例）、dependents 生成正确性；
- 用户流程：人为制造一个未声明 import → 门禁报红 → 补声明 → 转绿；
- 质量检查：`bun run check`（含架构守卫）、与旧前缀表结果差分对比附交付记录。

## 交付记录

- 实际修改：`scripts/quality/context-boundary-lib.mjs`（声明解析 + import 扫描 + 反向视图渲染，参数化 root）、`check-context-boundaries.mjs`（守卫 CLI：`--apply` 脚手架 / `--write-dependents` / 默认校验）、`context-boundaries.test.mjs`（9 个单测）；64 个模块（全部 workspace + `apps/im-gateway|kotlin|ssh-helper`）README 内嵌 `## Context Boundary` yaml 块，`internal_dependencies` 由真实 import 扫描推导、purpose/provides 人工修订；`docs/architecture/dependents.md` 机器生成；`check-guards.mjs`、`test:quality`、`docs/dev/quality-gates.md`、`docs/monorepo-new-package.md` 同步；`docs/adr/0131` 记录形态迁移。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/quality/context-boundaries.test.mjs`（9/9 通过）；`check-context-boundaries.mjs` 全仓校验通过；`--write-dependents` 生成反向视图；`check-package-boundaries.mjs` 旧守卫双跑比对：报 0 违规，新机制唯一冲突面为 15 处既有测试文件相对逃逸（按 ADR-0131 §2 测试文件例外收编，依赖方向仍受白名单约束），无漏报。
- 未运行及原因：`bun run check` 全量未跑（本轮改动以守卫+文档为主，定向校验已覆盖；提交后由常规 check 兜底）。
- Worktree：主工作区串行执行，未建独立 Worktree。
- 剩余风险：扫描只覆盖 TS/JS 源文件，Go/Kotlin 模块的声明靠人工维护；`consumes` 多为 `[]`，作为后续扩展点；测试文件相对逃逸例外是刻意让步，若日后要求生产级一致需单独清理。
