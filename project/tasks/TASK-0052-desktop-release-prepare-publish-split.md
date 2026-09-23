---
id: TASK-0052
type: task
status: done
priority: P0
owner: release/desktop
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0007
execution: serial
branch: forge/dev
worktree: shared-workspace（用户授权本轮串行实施；保留所有现存修改）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [package.json, apps/desktop/package.json, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, scripts/release/release-notes.mjs, .github/workflows/desktop-release.yml]
write_paths: [scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, package.json]
exclusive_paths: [scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, package.json, apps/desktop/package.json, bun.lock, .github/release-notes]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 发布准备与发布两阶段隔离

## 目标

让 Desktop release preparation 只做可审查的本地版本准备；创建 commit/tag 和 push 只能经单独发布入口并显式授权。本 Task 不选择 Open Forge 初始版本，不执行真实发版。

## 范围

### 并发评估

- 结论：不支持与其他版本、package manifest、Release Notes 写入任务并发。
- 执行方式：serial，共享工作区。
- 可并行 Task：无；本轮统一由 Coordinator 顺序实施。
- 前置依赖：无需首发号决定即可改造脚本合同；实际设置版本仍依赖 `ISSUE-0007`。
- 冲突文件/独占路径：Desktop/root release scripts、root package scripts、Desktop manifest、`bun.lock`、`.github/release-notes/**`。
- Branch：`forge/dev`；Worktree：当前共享工作区，不创建新 worktree。
- 集成负责人：Coordinator。
- 集成顺序：先纯逻辑/CLI 测试，再实现 prepare/publish gate；不得执行 publish 命令。

### 做

- 将本地 `prepare` 与远端 `publish` 拆开。
- `prepare` 不调用 git commit/tag/push，不执行 registry 发布；检查版本格式、目标 Release Notes 和允许修改的文件。
- `publish` 默认拒绝，只有显式 flag 才进入 commit/tag/push 分支；测试使用 fake runner，绝不连接远端。
- 版本解析保持当前纯 `X.Y.Z` 合同，预发布 suffix 是否支持留给 `ISSUE-0007` 决定。

### 不做

- 不修改 `apps/desktop/package.json#version`、不生成首发 Release Notes、不创建 tag、不提交、不 push。
- 不重设计 workspace package 发布；由 `ISSUE-0009` 与 `TASK-0056` 处理。
- 不运行完整打包发布或真实 GitHub Actions。

## Given / When / Then

- Given：工作区含任意用户改动且尚未确认要发的版本；When：调用 prepare/publish；Then：prepare 只允许在其明确合同内生成本地版本准备结果，不能 commit/tag/push；publish 没有显式授权时必须停止且不产生远端副作用。
- Given：目标版本缺少对应 Open Forge Release Notes 或不是合法的纯 `X.Y.Z`；When：执行准备或发布校验；Then：脚本在更改版本、commit 或 tag 之前失败并指出缺失项。

## 必须保持

- Release Notes、Desktop package version、tag 和 updater metadata 使用同一 Open Forge Desktop 版本。
- 已发布 Release Notes 不修改；上游 Vetta 发布说明不作为 Open Forge Release 正文。
- 本 Task 不运行真实发布路径，工作区其他变更不进入预期暂存白名单。

## 测试与验证

- 定向测试：版本解析、缺失 Release Notes、prepare 无 git 副作用、publish 缺少显式授权被拒、已授权分支只产生预期 git 命令计划。
- 用户流程：模拟维护者先准备目标版本，再在缺少授权时尝试发布，确认版本准备可审查且发布被阻断。
- 质量检查：`bun scripts/quality/run-vitest.mjs --run scripts/release-desktop.test.mjs`；`bun run check:quick -- <changed files>`；不运行 `release-desktop`、不 push、不 tag。

## 交付记录

- 实际修改：`scripts/release-desktop.mjs` 拆分为 `prepare`/`publish` 两个子命令；`prepare` 只做本地版本准备（bump 或 `--version X.Y.Z --initial` 显式设定首发线），创建 `# Open Forge <version>` 草稿说明、改 manifest、更新 lockfile 并白名单校验，不 commit/tag/push；`publish` 必须带 `--confirm-publish`，校验版本一致、说明就绪（标题/日期/非空小节）、tag 本地与远端可用后才执行 `desktopPublishCommands()` 生成的 add/commit/tag/`push --atomic` 计划。`package.json` 脚本改为 `release:desktop:{patch,minor,initial,publish}`。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/release-desktop.test.mjs scripts/release/package-release-policy.test.mjs` → 3 文件 22 测试通过（含一个并行 worktree 副本）；`bun run check:quick -- <changed files>` → Biome 干净，guards 中唯一失败为并行改动造成的 `@vetta/coding-agent/projects` tsconfig path map，与本 Task 无关。
- 未运行及原因：真实 prepare/publish（会写 manifest 并产生 git 副作用，且首发号未决）；desktop-release workflow 与真实 push（未授权）。
- 剩余风险：首发版本号和是否支持 prerelease 仍由 ISSUE-0007 阻塞；真实发布需单独授权。
