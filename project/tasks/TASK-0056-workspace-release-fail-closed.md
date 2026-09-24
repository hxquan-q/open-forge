---
id: TASK-0056
type: task
status: done
priority: P0
owner: release/package-ecosystem
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0009
execution: serial
branch: forge/dev
worktree: shared-workspace（用户授权本轮串行实施；不触碰现存用户改动）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [package.json, scripts/release.mjs, scripts/sync-versions.js, packages/coding-agent/package.json, packages/runtime-knowledge/package.json, apps/desktop/package.json]
write_paths: [scripts/release.mjs, scripts/release/package-release-policy.mjs, scripts/release/package-release-policy.test.mjs, package.json]
exclusive_paths: [scripts/release.mjs, scripts/release/package-release-policy.mjs, scripts/release/package-release-policy.test.mjs, package.json, packages/**/package.json, apps/desktop/package.json, bun.lock]
depends_on: []
conflicts_with: [TASK-0052]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Workspace Release 锁步假设 fail closed

## 目标

防止旧 root release 脚本在 package 版本不同的当前 monorepo 中静默把所有 package 改成同一个版本；明确其不是 Desktop 发布入口，并在不一致时于文件写入、commit、tag、push 或 publish 前失败。

## 范围

### 并发评估

- 结论：不支持与 Desktop release 版本脚本任务并发；两者都涉及版本和发布入口。
- 执行方式：serial，共享工作区。
- 可并行 Task：无。
- 前置依赖：TASK-0052 完成后集成；ISSUE-0009 的 package 发布拓扑决策不阻止 fail-closed 守卫。
- 冲突文件/独占路径：根 `package.json`、`scripts/release.mjs`、release policy helper/test、所有将来可能被改写的 package manifest 和 `bun.lock`。
- Branch：`forge/dev`；Worktree：当前共享工作区。
- 集成负责人：Coordinator。
- 集成顺序：版本组 Task-0052 → 本 Task → package release policy decision。

### 做

- 把 root release 即将处理的 package manifest 版本列表变成可测试的纯校验。
- 对当前不满足脚本假设的版本集合在任何文件写入、stage、commit、tag、push 或 registry 发布之前拒绝运行，并明确提示需要先确定 package release scope。
- 将生成的 release 文件限制在显式路径清单，避免 `git add .` 把非 release 文件纳入提交。
- Desktop 应用 release 只能使用 Desktop 专用入口，不通过 root workspace lockstep 脚本升版。

### 不做

- 不在本 Task 实现完整 per-package publish/DAG；由 ISSUE-0009 先决定实际公开 package 与 cohort。
- 不改任何 package 版本、不执行 release script、不创建 commit/tag、不 push、不 publish。
- 不删除已有 CLI 入口；对不满足守卫的情况给出直接可理解的失败信息。

## Given / When / Then

- Given：root 与 workspace package manifests 中有两个或更多不同版本；When：维护者通过根 release 命令准备 release；Then：脚本在变更任何文件或执行任何远端副作用前退出并说明当前锁步假设不成立。
- Given：版本集合通过预检；When：release 脚本整理变更；Then：仅显式 release 文件路径可进入暂存列表，工作区外的其他文件不得被自动加入。

## 必须保持

- 当前不同版本 manifest 不被脚本“自动收敛”或覆盖。
- Desktop 与 package release 的版本事实源互不替代。
- 不触发真实 release、registry 或 Git remote 操作进行测试。

## 测试与验证

- 定向测试：一致版本集合通过；不一致集合产生稳定诊断；预检失败不调用写入/git/registry 边界；release 路径清单只含受控文件。
- 用户流程：在当前 package 版本不一致的只读 fixture 上调用预检，确认操作停止且 manifest 内容不变。
- 质量检查：仓库统一 runner 执行新增测试；`bun run check:quick -- <changed files>`。

## 交付记录

- 实际修改：新增 `scripts/release/package-release-policy.mjs`（`validatePackageReleaseScope`：缺 `RELEASE_PACKAGE_SCOPE=lockstep` 拒绝、缺 `RELEASE_PUSH=true` 拒绝、选中 cohort 版本不一致拒绝并列出全部 mismatch）；`scripts/release.mjs` 在任何文件写入/git/registry 操作前先跑校验，`git add` 改为显式路径清单，头部注释标明 Desktop release 不走此入口；`package.json` 的 `test:quality` 纳入 `scripts/release/package-release-policy.test.mjs`。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run scripts/release-desktop.test.mjs scripts/release/package-release-policy.test.mjs` → policy 4 测试通过；手动验证当前工作区直接调用 `release.mjs` 时按预期先后被「缺 scope」和「混合版本」拒绝，未产生任何文件写入或远端副作用；`check:quick` 干净（除无关并行改动导致的 coding-agent tsconfig guard）。
- 未运行及原因：真实 workspace release/publish（当前版本集本就不满足锁步前提，且无授权）。
- 剩余风险：per-package 发布策略及 cohort 仍由 ISSUE-0009 阻塞；`release:patch|minor|major` 脚本名保留但行为已 fail closed，后续可考虑改名以降低误用可能。
