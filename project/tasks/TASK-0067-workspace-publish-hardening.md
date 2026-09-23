---
id: TASK-0067
type: task
status: done
priority: P1
owner: release/package-ecosystem
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0009
execution: parallel
branch: forge/dev
worktree: unassigned
read_paths: [package.json, scripts/release/package-release-policy.mjs, packages/*/package.json]
write_paths: [package.json, packages/*/package.json, scripts/release/package-release-policy.test.mjs]
exclusive_paths: [package.json]
depends_on: [ISSUE-0009]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Workspace 发包面硬化

## 目标

按 ISSUE-0009 决策（不公开发布任何 workspace 包），消除 `publish:private` 裸 `npm publish -ws` 绕过守卫直发全部非 private 包的风险，并把「不发布」从脚本守卫升级为 manifest 事实。

## 范围

### 做

- 根 `publish:private` 脚本改为经由 `scripts/release/package-release-policy.mjs` 的 fail-closed 守卫（与 `release.mjs` 同一策略：显式 scope + 显式授权才放行）。
- 给无 `publishConfig` 的 workspace 包补 `"private": true`（约 22 个 `packages/*/package.json` 与内部包各加一行）。
- `@vetta-org/*` 四个包指向上游 scope 的 `publishConfig` 保留不动（上游合同组成部分，fork 永不执行其发布）。
- 为守卫接线补定向测试。

### 不做

- 不删除任何 `publishConfig`、不改任何包版本号。
- 不执行任何 `npm publish`。

## Given / When / Then

- Given：任何人运行 `bun run publish:private` 或包目录内 `npm publish`；When：无显式授权/无发布意图；Then：脚本路径被守卫拒绝，`private: true` 包被 registry 拒绝。

## 测试与验证

- `package-release-policy` 定向测试扩展；`bun run check:quick` 限本批文件。

## 交付记录

- 实际修改：`package.json`（`publish`/`publish:private` 改经 `scripts/release/publish-private.mjs` 守卫；`publish:dry` 保留为安全 dry-run）；新增 `scripts/release/publish-private.mjs`（复用 `validatePackageReleaseScope`）；23 个无 `publishConfig` 包补 `"private": true`（`apps/cli-host` + 22 个 `packages/*`）；`scripts/release/package-release-policy.test.mjs` 新增两条合同测试。
- 实际运行：`package-release-policy` 测试 6/6 通过；`node scripts/release/publish-private.mjs` 无授权被拒（缺 `RELEASE_PACKAGE_SCOPE`），带授权仍被拒（版本不一致列出全部 mismatch）——双层 fail-closed 生效。
- 未运行及原因：未执行任何真实 `npm publish`。
- 剩余风险：`@vetta-org/*` 四包保留上游 `publishConfig`（按决策不动）；`publish:dry` 不走守卫但只产生 dry-run 不发布。
