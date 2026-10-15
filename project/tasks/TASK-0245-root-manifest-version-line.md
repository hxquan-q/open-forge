---
id: TASK-0245
type: task
status: done
priority: P2
owner: 发布工程
requirement:
plan:
source: 用户决策（2026-10-14）：根 package.json#version=0.55.3 是上游锁步残留，二开商用版本线是 0.1.3（apps/desktop/package.json#version），根清单需重新规划到自有版本线且不再漂移
related_requirement: []
related_plan: []
related_tasks: [TASK-0244]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 79b5dcca2
read_paths: [scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, scripts/release/release-notes.mjs, scripts/release/release-notes.test.mjs, package.json]
write_paths: [package.json, bun.lock, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, scripts/release/release-notes.mjs, scripts/release/release-notes.test.mjs, .github/release-notes/v0.1.3.md, project/tasks/TASK-0245-root-manifest-version-line.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 根清单版本归入 0.1.x 商用版本线并消除漂移

## 目标

根 `package.json#version` 从上游残留的 `0.55.3` 改为跟随 Desktop 商用版本线（当前 `0.1.3`），并让漂移在两处结构性失效：发版脚本同步改写根清单、门禁断言根↔Desktop 一致。

## 背景

- 现行发版路径是 `release-desktop.mjs`：只改写 `apps/desktop/package.json` + `bun.lock` + 发布说明，并以 `assertOnlyReleaseFilesChanged` 白名单强制「只许动这几个文件」——根清单版本从未被任何脚本读写，`0.55.3` 是上游 0.5.x 锁步线的死数据，与 0.1.x 商用线并存会误导读根版本的第三方工具。
- legacy `release.mjs`（lockstep）读的是 `packages/coding-agent` 版本（0.0.1 线），策略测试用合成字面量，不读真实根清单——改动不影响该链路。
- `bun.lock` 含根清单条目（`"name": "open-vetta"`），版本改动需 `bun install --lockfile-only` 同步。

## 范围

### 做

- 根 `package.json#version`：`0.55.3` → `0.1.3`；`bun install --lockfile-only` 同步锁文件。
- `release-desktop.mjs`：prepare/publish 同步把版本写进根清单；根清单加入 `getUnexpectedReleaseChanges` 白名单、`assertOnlyReleaseFilesChanged` 必改清单与 `desktopPublishCommands` 的 git add 列表；publish 前断言根版本与请求版本一致。
- `release-notes.mjs`：`--check`（已在 `check:guards` 内）新增「根清单版本 ≠ Desktop 版本」判负项，发布说明门禁自动覆盖。
- 测试：`desktopPublishCommands` 含根清单、`getUnexpectedReleaseChanges` 允许根清单、新增根↔Desktop 不一致判负用例。

### 不做

- 不改根 `package.json` 的 `name: "open-vetta"`（牵动 bun.lock 根条目名与发布面，独立议题）。
- 不动 legacy lockstep `release.mjs`/`sync-versions.js`（读 coding-agent 版本，与根清单无关）。
- 不创建新版本号：0.1.3 是现行商用版本，根清单只是对齐，不触发任何发布动作。

## Given / When / Then

- Given：根 0.55.3 ≠ Desktop 0.1.3，且无脚本维护根版本。
- When：本次对齐后运行 `bun run check`；未来 `release:desktop:*` 发版。
- Then：check 中 release-notes 门禁含一致性断言通过；未来 prepare/publish 自动把根清单带到同一版本并随发布提交入库。

## 必须保持

- `release-desktop.mjs` 的白名单语义不变：除发布四件套（desktop/根/锁文件/说明）外出现任何脏文件仍然判负。
- 发布日期只在 publish 产生、tag 后说明不可改写等既有合同不变。

## 测试与验证

- 定向：`bun run vitest --run scripts/release-desktop.test.mjs scripts/release/release-notes.test.mjs`（仓库 runner）。
- 质量检查：完整 `bun run check`（release-notes --check 在 check:guards 内，直接验证根↔Desktop 一致断言）。
- 用户流程：不适用（发布工具链改动；下次发版时真实走查）。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行，验收后推 origin/dev。
- 人工功能验收：不适用（下次真实发版时复核根清单随版本前进）。
- 发布：未授权。

## 交付记录

- 实际修改：根 `package.json#version` 0.55.3→0.1.3；`release-desktop.mjs`（`ROOT_PACKAGE_PATH` 常量、`getUnexpectedReleaseChanges` 白名单加根清单、prepare 同步写根清单并纳入必改清单、publish 先断言根版本一致并把根清单纳入两处必改清单、`desktopPublishCommands` 的 git add 加根清单）；`release-notes.mjs` 新增 `rootManifestVersionProblem` 并挂进 `collectReleaseNotesProblems`（--check 门禁）；两个测试文件更新期望并新增 5 个用例（一致/上游线残留/非法版本/无根清单夹具/真实仓库单版本线）。
- 实际运行：`bun install --lockfile-only`（根清单在 bun.lock 工作区条目无 version 字段，无锁变化）；`bun run vitest --run scripts/release-desktop.test.mjs scripts/release/release-notes.test.mjs` 41/41；完整 `bun run check` 全绿（release-notes --check 含新断言）。
- 未运行及原因：未真实执行 `release:desktop:*` prepare/publish——会改写版本号并进入发布链路，未获发布授权；行为由单测与白名单既有测试覆盖。
- Worktree：未拆出；串行小改，main 直接实施。
- 剩余风险：根 `name: "open-vetta"` 仍是上游命名（bun.lock 根条目同名）；是否随品牌决策改名属独立议题，未在本任务处理。
