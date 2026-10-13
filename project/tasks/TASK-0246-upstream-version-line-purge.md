---
id: TASK-0246
type: task
status: done
priority: P1
owner: 发布工程
requirement:
plan:
source: 用户决策（2026-10-14）：商用口径下版本面必须严肃——TASK-0245 只归位了根清单，全仓普查仍发现 2 个上游 0.55.3 残留与 3 处 CI/模板的上游版本示例
related_requirement: []
related_plan: []
related_tasks: [TASK-0245]
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 31343215c
read_paths: [scripts/quality/check-guards.mjs, package.json, apps/docs-site/package.json, packages/runtime-knowledge/package.json, .github/workflows/desktop-release.yml, .github/workflows/desktop-upgrade-e2e.yml, .github/ISSUE_TEMPLATE/bug-report.yml]
write_paths: [apps/docs-site/package.json, packages/runtime-knowledge/package.json, bun.lock, scripts/quality/check-version-lines.mjs, scripts/quality/check-version-lines.test.mjs, scripts/quality/check-guards.mjs, package.json, .github/workflows/desktop-release.yml, .github/workflows/desktop-upgrade-e2e.yml, .github/ISSUE_TEMPLATE/bug-report.yml, .github/release-notes/v0.1.3.md, project/tasks/TASK-0246-upstream-version-line-purge.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 清除上游版本线残留并建立版本线门禁

## 目标

全仓不存在任何上游 0.5.x 版本线残留，且该不变量由 `check:guards` 机械看护——上游线版本号再出现即完整检查红。

## 普查结论（2026-10-14）

- 62 个 manifest 的版本分布：产品线 0.1.3（desktop+根，TASK-0245 已锚定）；内部 workspace 线 0.0.1（26 个，private 不发布）；插件/主题各自独立线 0.1.x–0.4.x；examples 1.x；mobile 1.0.0；vendor 0.0.0/0.0.0-vetta-shim。
- **残留 2 处 0.55.3**：`apps/docs-site`（@vetta/docs-site，private）与 `packages/runtime-knowledge`（@vetta/runtime-knowledge，private）。两者均不发布、无任何按版本引用（grep `runtime-knowledge@`、docs-site 版本读取均为零），是上游锁步线的死数据。
- CI/模板文案 3 处上游示例：`desktop-release.yml`（0.5.47）、`desktop-upgrade-e2e.yml`（0.5.46/0.5.47）、`bug-report.yml`（0.5.41）。
- `v0.5.58.md`/`v0.5.59.md` 为上游继承发布说明，规则明文原样保留（`# Vetta` 前缀白名单），不在本任务动。

## 范围

### 做

- 两个残留 manifest 归入内部 0.0.1 线（与其余 26 个 private workspace 包一致）；`bun install` 同步锁文件。
- 新增 `scripts/quality/check-version-lines.mjs`：遍历 git 追踪的全部 manifest，任何 `0.5.x` 区间版本判负（上游锁步线特征）；挂入 `check-guards.mjs` 聚合器。
- 测试 `check-version-lines.test.mjs`（纯函数夹具）并注册进 `test:quality`。
- CI/模板 3 处示例版本改为 0.1.x。

### 不做

- 不把 26 个内部包 bump 到 0.1.3：private 不发布，版本无对外语义；产品版本单一事实源仍是 `apps/desktop`（AGENTS 明文）。
- 不动插件/主题/examples/mobile 的独立版本线（不在上游区间，各自演进）。
- 不改根 `package.json` 的 `name: "open-vetta"`（品牌决策，独立议题）。
- 不修改上游继承的发布说明与已冻结 CHANGELOG。

## Given / When / Then

- Given：2 个 manifest 停在 0.55.3，无任何机制拦截同类残留。
- When：归位后运行完整 `bun run check`；未来任何提交把 manifest 版本改回 0.5.x。
- Then：当前 check 全绿；未来同类改动被 `version-lines` guard 判负，进不了 main。

## 必须保持

- 桌面发版链路（release-desktop/release-notes 闸门）行为不变；本门禁是新增独立断言。
- 内部包 0.0.1 线自洽性不被破坏（legacy lockstep 断言所有选中包同版本）。

## 测试与验证

- 定向：`bun run vitest --run scripts/quality/check-version-lines.test.mjs scripts/release/release-notes.test.mjs`。
- 门禁：`bun run scripts/quality/check-version-lines.mjs` 单独跑 + 完整 `bun run check`（含新 guard 与 test:quality 注册项）。
- 用户流程：不适用（版本元数据与门禁，无行为变化）。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审；门禁规则（区间判定）有单测，两处归位有零引用证据。
- 集成：main 串行，验收后推 origin/dev。
- 人工功能验收：不适用。
- 发布：未授权。

## 交付记录

- 实际修改：`apps/docs-site` 与 `packages/runtime-knowledge` 版本 0.55.3→0.0.1（bun.lock 两处条目同步）；新增 `scripts/quality/check-version-lines.mjs`（0.5.x/0.55.x 区间判负）挂入 `check-guards.mjs`；新增 `check-version-lines.test.mjs` 并注册进 `test:quality`；CI/模板 3 处上游示例版本改 0.1.x（`desktop-upgrade-e2e.yml` 因首次成为 fork 改动文件补 `Modified by` 声明头）。
- 实际运行：门禁红路实测（临时把 docs-site 改回 0.55.3 → exit 1 并给出指引，恢复 → 68 manifest 全过）；定向 30/30；完整 `bun run check` exit 0；`test:quality` 516/516。
- 未运行及原因：未跑单元测试全量——版本元数据与门禁脚本无运行时行为，check + test:quality 已覆盖。
- Worktree：未拆出；串行小改，main 直接实施。
- 剩余风险：门禁规则按「次版本 5 或 55」识别上游线；若本产品将来自然演进到 0.5.0/0.55.0（当前 0.1.x，相距 40+ 个 minor），届时需有意调整规则而非绕过。
